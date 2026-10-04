import { describe, it, expect } from 'vitest'
import { ScheduleService } from '../schedule.service'
import type { Wine, StorageLocation, DeliveryScheduleEntry } from '../../types/index'

const NOW = new Date(2026, 9, 4) // October 2026

function makeWine(overrides: Partial<Wine> & { id: string }): Wine {
  return {
    name: 'Test Wine',
    vintage: 2020,
    tier: 1 as const,
    region: 'Bordeaux',
    producer: 'Test Producer',
    drinking_window_start: 2024,
    drinking_window_end: 2040,
    quantity_in_storage: 6,
    quantity_at_home: 0,
    format: '750ml',
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    ...overrides,
  }
}

function makeLocation(overrides: Partial<StorageLocation> & { id: string }): StorageLocation {
  return {
    name: overrides.id,
    cadence: 'fixed',
    delivery_months: [3, 9],
    min_volume_ml: 4 * 4500,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    ...overrides,
  }
}

const wines = (n: number, overrides: Partial<Wine> = {}) =>
  Array.from({ length: n }, (_, i) => makeWine({ id: `${overrides.storage_location_id ?? 'u'}-${i}`, ...overrides }))

function plan(
  allWines: Wine[],
  locations: StorageLocation[],
  opts: { capacity?: number; rate?: number; min?: number; locked?: Record<string, Array<{ wine_id: string; quantity: number }>>; committed?: Record<string, number> } = {}
) {
  return ScheduleService.generateDeliverySchedule(
    allWines,
    opts.capacity ?? 80,
    0,
    [3, 9],
    opts.rate ?? 30,
    opts.min ?? 24,
    opts.committed ?? {},
    opts.locked ?? {},
    locations,
    NOW
  )
}

/** Bottles per delivery, keyed by date|location. */
function byDelivery(entries: DeliveryScheduleEntry[]) {
  const out = new Map<string, number>()
  for (const e of entries) {
    const key = `${e.scheduled_date}|${e.storage_location_id ?? 'unallocated'}`
    out.set(key, (out.get(key) ?? 0) + e.quantity)
  }
  return out
}

const month = (date: string) => Number(date.slice(5, 7))
const total = (entries: DeliveryScheduleEntry[]) => entries.reduce((s, e) => s + e.quantity, 0)

describe('generateDeliverySchedule with storage locations', () => {
  it('plans unallocated wine on the global months and minimum, as before locations existed', () => {
    const cellar = wines(10)
    const result = plan(cellar, [])
    expect(total(result)).toBe(60)
    expect(result.every(e => e.storage_location_id === undefined)).toBe(true)
    expect(result.every(e => [3, 9].includes(month(e.scheduled_date)))).toBe(true)
    const deliveries = [...byDelivery(result).values()]
    deliveries.slice(0, -1).forEach(b => expect(b).toBeGreaterThanOrEqual(24))
  })

  it('delivers each fixed location only in its own months', () => {
    const a = makeLocation({ id: 'a', delivery_months: [5] })
    const b = makeLocation({ id: 'b', delivery_months: [2, 11] })
    const cellar = [...wines(6, { storage_location_id: 'a' }), ...wines(6, { storage_location_id: 'b' })]
    const result = plan(cellar, [a, b])

    expect(total(result)).toBe(72)
    for (const e of result) {
      if (e.storage_location_id === 'a') expect(month(e.scheduled_date)).toBe(5)
      else expect([2, 11]).toContain(month(e.scheduled_date))
    }
  })

  it('lets a flexible location deliver in any month once its minimum fits', () => {
    const free = makeLocation({ id: 'free', cadence: 'flexible', delivery_months: [], min_volume_ml: 2 * 4500 })
    const result = plan(wines(4, { storage_location_id: 'free' }), [free])

    // Nothing waits for March: the first delivery is this month
    expect(result[0].scheduled_date).toBe('2026-10-01')
    expect(total(result)).toBe(24)
  })

  it('measures the minimum by volume, so magnums count double', () => {
    const loc = makeLocation({ id: 'm', cadence: 'flexible', delivery_months: [], min_volume_ml: 2 * 4500 })
    // Two cases of three magnums = 9 litres = two cases of 75cl
    const magnums = [
      makeWine({ id: 'mag1', format: 'Magnum', quantity_in_storage: 3, storage_location_id: 'm' }),
      makeWine({ id: 'mag2', format: 'Magnum', quantity_in_storage: 3, storage_location_id: 'm' }),
      makeWine({ id: 'later', quantity_in_storage: 6, storage_location_id: 'm' }),
    ]
    const result = plan(magnums, [loc])
    const first = result.filter(e => e.scheduled_date === result[0].scheduled_date)
    const firstVolume = first.reduce((s, e) => s + e.quantity * (e.wine_id.startsWith('mag') ? 1500 : 750), 0)
    expect(firstVolume).toBeGreaterThanOrEqual(9000)
  })

  it('never puts more at home than the cellar holds, across all locations in a month', () => {
    const a = makeLocation({ id: 'a', delivery_months: [3] })
    const b = makeLocation({ id: 'b', cadence: 'flexible', delivery_months: [], min_volume_ml: 2 * 4500 })
    const cellar = [...wines(15, { storage_location_id: 'a' }), ...wines(15, { storage_location_id: 'b' }), ...wines(5)]
    const result = plan(cellar, [a, b], { capacity: 60 })

    const perMonth = new Map<string, number>()
    for (const e of result) perMonth.set(e.scheduled_date, (perMonth.get(e.scheduled_date) ?? 0) + e.quantity)
    for (const bottles of perMonth.values()) expect(bottles).toBeLessThanOrEqual(60)
    expect(total(result)).toBe(210)
  })

  it('holds space for a more urgent fixed location instead of letting a flexible one take it all', () => {
    const fixed = makeLocation({ id: 'fixed', delivery_months: [3], min_volume_ml: 2 * 4500 })
    const flexible = makeLocation({ id: 'flex', cadence: 'flexible', delivery_months: [], min_volume_ml: 2 * 4500 })
    const cellar = [
      // Closing soon: these should not be starved
      ...Array.from({ length: 3 }, (_, i) =>
        makeWine({ id: `urgent-${i}`, drinking_window_end: 2027, storage_location_id: 'fixed' })
      ),
      ...Array.from({ length: 20 }, (_, i) =>
        makeWine({ id: `relaxed-${i}`, drinking_window_end: 2045, storage_location_id: 'flex' })
      ),
    ]
    const result = plan(cellar, [fixed, flexible], { capacity: 40 })

    const firstUrgent = result.find(e => e.wine_id.startsWith('urgent'))
    expect(firstUrgent?.scheduled_date).toBe('2027-03-01')
  })

  it('treats a wine at a deleted location as unallocated', () => {
    const result = plan(wines(5, { storage_location_id: 'gone' }), [])
    expect(result.every(e => e.storage_location_id === undefined)).toBe(true)
    expect(result.every(e => [3, 9].includes(month(e.scheduled_date)))).toBe(true)
  })

  it('a locked delivery only stands in for its own location', () => {
    const a = makeLocation({ id: 'a', delivery_months: [3], min_volume_ml: 4500 })
    const b = makeLocation({ id: 'b', delivery_months: [3], min_volume_ml: 4500 })
    const cellar = [...wines(2, { storage_location_id: 'a' }), ...wines(2, { storage_location_id: 'b' })]
    const locked = { '2027-03-01|a': [{ wine_id: 'a-0', quantity: 6 }] }
    const result = plan(cellar, [a, b], { locked, committed: { 'a-0': 6 } })

    const march = result.filter(e => e.scheduled_date === '2027-03-01')
    expect(march.some(e => e.storage_location_id === 'a')).toBe(false)
    expect(march.some(e => e.storage_location_id === 'b')).toBe(true)
  })

  it('a locked window from before locations stands in for every location that month', () => {
    const a = makeLocation({ id: 'a', delivery_months: [3], min_volume_ml: 4500 })
    const cellar = [...wines(2, { storage_location_id: 'a' }), ...wines(4)]
    const locked = { '2027-03-01': [{ wine_id: 'u-0', quantity: 6 }] }
    const result = plan(cellar, [a], { locked, committed: { 'u-0': 6 } })
    expect(result.some(e => e.scheduled_date === '2027-03-01')).toBe(false)
  })

  it('lets the last of a location through below its minimum', () => {
    const a = makeLocation({ id: 'a', delivery_months: [5], min_volume_ml: 4 * 4500 })
    const result = plan([makeWine({ id: 'lonely', quantity_in_storage: 2, storage_location_id: 'a' })], [a])
    expect(result).toHaveLength(1)
    expect(result[0].scheduled_date).toBe('2027-05-01')
  })
})
