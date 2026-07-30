/**
 * Dashboard stats — pure derivations from the wine list that power the
 * Overview page.
 */

import { describe, it, expect } from 'vitest'
import { computeDashboardStats, nextDelivery } from '../dashboard.service'
import type { Wine } from '../../types/index'
import type { DeliveryDisplayEntry } from '../schedule.service'

let seq = 0
function wine(overrides: Partial<Wine>): Wine {
  seq += 1
  return {
    id: `w-${seq}`,
    name: `Wine ${seq}`,
    producer: `Producer ${seq}`,
    vintage: 2018,
    tier: 2,
    region: 'Rioja',
    wine_type: 'Red',
    drinking_window_start: 2020,
    drinking_window_end: 2040,
    quantity_in_storage: 6,
    quantity_at_home: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const NOW = new Date('2026-07-01T12:00:00Z')

describe('computeDashboardStats', () => {
  it('totals bottles and wines, split by location', () => {
    const stats = computeDashboardStats(
      [
        wine({ quantity_in_storage: 10, quantity_at_home: 2 }),
        wine({ quantity_in_storage: 0, quantity_at_home: 3 }),
      ],
      NOW
    )

    expect(stats.totalWines).toBe(2)
    expect(stats.totalBottles).toBe(15)
    expect(stats.bottlesInStorage).toBe(10)
    expect(stats.bottlesAtHome).toBe(5)
  })

  it('sums cellar value only over wines with a recorded price', () => {
    const stats = computeDashboardStats(
      [
        wine({ purchase_price: 25, quantity_in_storage: 10, quantity_at_home: 2 }), // 300
        wine({ purchase_price: 100, quantity_in_storage: 3 }), // 300... wait 3*100=300
        wine({ quantity_in_storage: 6 }), // unpriced
      ],
      NOW
    )

    expect(stats.totalValue).toBe(25 * 12 + 100 * 3)
    expect(stats.pricedBottles).toBe(15)
  })

  it('excludes wines with zero bottles from every stat', () => {
    const stats = computeDashboardStats(
      [
        wine({ quantity_in_storage: 6 }),
        wine({ quantity_in_storage: 0, quantity_at_home: 0, region: 'Ghostland' }),
      ],
      NOW
    )

    expect(stats.totalWines).toBe(1)
    expect(stats.topRegions.some(r => r.label === 'Ghostland')).toBe(false)
    expect(stats.byTier.reduce((sum, t) => sum + t.wines, 0)).toBe(1)
  })

  it('breaks bottles down by wine type in canonical order', () => {
    const stats = computeDashboardStats(
      [
        wine({ wine_type: 'White', quantity_in_storage: 4 }),
        wine({ wine_type: 'Red', quantity_in_storage: 10 }),
        wine({ wine_type: 'Red', quantity_in_storage: 2 }),
      ],
      NOW
    )

    // Canonical order (Red first), zero-count types omitted
    expect(stats.byType).toEqual([
      { label: 'Red', bottles: 12 },
      { label: 'White', bottles: 4 },
    ])
  })

  it('ranks regions by bottles and folds the tail into Other', () => {
    const regions = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    const wines = regions.map((region, i) =>
      wine({ region, quantity_in_storage: 10 - i })
    )

    const stats = computeDashboardStats(wines, NOW)

    expect(stats.topRegions).toHaveLength(7) // top 6 + Other
    expect(stats.topRegions[0]).toEqual({ label: 'A', bottles: 10 })
    const other = stats.topRegions[6]
    expect(other.label).toBe('Other')
    expect(other.bottles).toBe(4 + 3) // regions G and H
  })

  it('counts wines per tier including empty tiers', () => {
    const stats = computeDashboardStats(
      [wine({ tier: 5 }), wine({ tier: 5 }), wine({ tier: 1 })],
      NOW
    )

    expect(stats.byTier).toHaveLength(5)
    expect(stats.byTier.find(t => t.tier === 5)?.wines).toBe(2)
    expect(stats.byTier.find(t => t.tier === 5)?.label).toBe('Icon')
    expect(stats.byTier.find(t => t.tier === 3)?.wines).toBe(0)
  })

  it('classifies drinking windows as ready, waiting, and closing soon', () => {
    const stats = computeDashboardStats(
      [
        wine({ drinking_window_start: 2020, drinking_window_end: 2027, name: 'Urgent' }),
        wine({ drinking_window_start: 2020, drinking_window_end: 2040, name: 'Relaxed' }),
        wine({ drinking_window_start: 2030, drinking_window_end: 2045, name: 'Future' }),
      ],
      NOW // 2026
    )

    expect(stats.readyToDrinkWines).toBe(2)
    expect(stats.windowWatch.waitingWines).toBe(1)
    expect(stats.windowWatch.closingSoonWines).toBe(1) // window ends 2027 <= 2028
    expect(stats.windowWatch.drinkFirst[0].name).toBe('Urgent')
    expect(stats.windowWatch.drinkFirst[0].windowEnd).toBe(2027)
  })

  it('names at most five wines, nearest the end of their window first', () => {
    const stats = computeDashboardStats(
      [2040, 2026, 2035, 2032, 2038, 2030, 2036].map((end, i) =>
        wine({ drinking_window_start: 2020, drinking_window_end: end, name: `W${i}` })
      ),
      NOW
    )

    expect(stats.windowWatch.drinkFirst).toHaveLength(5)
    expect(stats.windowWatch.drinkFirst.map(w => w.windowEnd)).toEqual([
      2026, 2030, 2032, 2035, 2036,
    ])
  })

  it('lists what to drink first even when nothing is at risk, flagging only the urgent', () => {
    // The regression this guards: a list restricted to closing-soon wines
    // is empty for years in a young cellar, leaving a dead panel where
    // the answer to "what do I open next" should be.
    const stats = computeDashboardStats(
      [
        wine({ drinking_window_start: 2020, drinking_window_end: 2040, name: 'Later' }),
        wine({ drinking_window_start: 2020, drinking_window_end: 2033, name: 'Sooner' }),
      ],
      NOW
    )

    expect(stats.windowWatch.closingSoonWines).toBe(0)
    expect(stats.windowWatch.drinkFirst.map(w => w.name)).toEqual(['Sooner', 'Later'])
    expect(stats.windowWatch.drinkFirst.every(w => !w.urgent)).toBe(true)
  })

  it('flags only the wines inside the closing-soon horizon', () => {
    const stats = computeDashboardStats(
      [
        wine({ drinking_window_start: 2020, drinking_window_end: 2027, name: 'Urgent' }),
        wine({ drinking_window_start: 2020, drinking_window_end: 2030, name: 'Fine' }),
      ],
      NOW
    )

    expect(stats.windowWatch.drinkFirst.map(w => [w.name, w.urgent])).toEqual([
      ['Urgent', true],
      ['Fine', false],
    ])
  })
})

describe('nextDelivery', () => {
  function displayEntry(date: string, status: string, quantities: number[]): DeliveryDisplayEntry {
    return {
      date,
      windowId: '',
      status,
      locked: false,
      wines: quantities.map((quantity, i) => ({
        id: `w-${i}`,
        name: `Wine ${i}`,
        vintage: 2018,
        tier: 2,
        quantity,
      })),
    }
  }

  it('returns the first non-completed delivery with totals', () => {
    const schedule = [
      displayEntry('2026-03-01', 'completed', [6]),
      displayEntry('2026-09-01', 'planned', [6, 3]),
      displayEntry('2027-03-01', 'planned', [12]),
    ]

    expect(nextDelivery(schedule)).toEqual({ date: '2026-09-01', bottles: 9, wines: 2 })
  })

  it('returns null when everything is delivered or empty', () => {
    expect(nextDelivery([])).toBeNull()
    expect(nextDelivery([displayEntry('2026-03-01', 'completed', [6])])).toBeNull()
  })
})
