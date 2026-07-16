/**
 * Integration tests for the delivery planning orchestration layer —
 * the real ScheduleService + database + workflows stack, no copies.
 *
 * This suite replaces the retired simulation tests (delay-behavior,
 * delayed-wine-exclusion, delayed-wine-rescheduling, pinned-delay-conflict,
 * delivery-schedule-save): their scenario intents — deferring a wine from
 * one delivery without losing it, locked-window persistence, schedule
 * regeneration stability — are asserted here against the code the app
 * actually runs.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import * as db from '../database'
import * as planner from '../deliveryPlanning.service'
import * as workflows from '../workflows.service'
import type { Wine } from '../../types/index'

// Mock localStorage for tests (same pattern as the other integration suites)
const localStorageMock = (() => {
  let store: Record<string, string> = {}

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

/**
 * A drinkable, mid-tier storage wine the scheduler will always plan:
 * window already open, tier below the high-tier start-year restriction.
 */
async function makeWine(name: string, quantityInStorage: number, overrides: Partial<Wine> = {}) {
  return db.createWine({
    name,
    producer: `Producer ${name}`,
    vintage: 2018,
    tier: 2,
    region: 'Rioja',
    country: 'Spain',
    wine_type: 'Red',
    drinking_window_start: 2024,
    drinking_window_end: 2045,
    quantity_in_storage: quantityInStorage,
    quantity_at_home: 0,
    ...overrides,
  })
}

/** Enough stock (120 bottles) to guarantee more than one delivery. */
async function seedCollection(): Promise<Wine[]> {
  const wines: Wine[] = []
  for (const name of ['Uno', 'Due', 'Tre', 'Quattro', 'Cinque', 'Sei']) {
    wines.push(await makeWine(name, 20))
  }
  return wines
}

/**
 * A small collection (48 bottles) whose first delivery leaves headroom
 * below max_home_capacity, so promotions are accepted. (With an empty
 * home the scheduler fills the first delivery to full capacity, so a
 * large collection leaves no room to promote into.)
 */
async function seedSmallCollection(): Promise<Wine[]> {
  const wines: Wine[] = []
  for (const name of ['Uno', 'Due', 'Tre', 'Quattro', 'Cinque', 'Sei']) {
    wines.push(await makeWine(name, 8))
  }
  return wines
}

async function totalBottles(): Promise<number> {
  const wines = await db.getAllWines()
  return wines.reduce((sum, w) => sum + w.quantity_in_storage + w.quantity_at_home, 0)
}

beforeEach(async () => {
  localStorage.clear()
  await db.initializeDatabase()
})

describe('buildDeliverySchedule', () => {
  it('plans deliveries only in the configured months', async () => {
    const wines = await seedCollection()
    const schedule = await planner.buildDeliverySchedule(wines)

    expect(schedule.length).toBeGreaterThanOrEqual(2)
    for (const entry of schedule) {
      expect(entry.date).toMatch(/^\d{4}-(03|09)-\d{2}$/)
      expect(entry.wines.length).toBeGreaterThan(0)
    }
  })

  it('never schedules more bottles than storage holds', async () => {
    const wines = await seedCollection()
    const schedule = await planner.buildDeliverySchedule(wines)

    const perWine = new Map<string, number>()
    for (const entry of schedule) {
      for (const w of entry.wines) {
        perWine.set(w.id, (perWine.get(w.id) ?? 0) + w.quantity)
      }
    }

    for (const wine of wines) {
      expect(perWine.get(wine.id) ?? 0).toBeLessThanOrEqual(wine.quantity_in_storage)
    }
  })

  it('is stable across rebuilds when nothing changes', async () => {
    const wines = await seedCollection()
    const first = await planner.buildDeliverySchedule(wines)
    const second = await planner.buildDeliverySchedule(wines)

    expect(second.map(e => e.date)).toEqual(first.map(e => e.date))
    expect(
      second.map(e => e.wines.map(w => `${w.id}:${w.quantity}`).sort())
    ).toEqual(first.map(e => e.wines.map(w => `${w.id}:${w.quantity}`).sort()))
  })
})

describe('promoteWineToNextDelivery', () => {
  it('locks the first delivery and persists the promoted wine', async () => {
    const wines = await seedSmallCollection()
    const schedule = await planner.buildDeliverySchedule(wines)
    const target = wines[5]

    await planner.promoteWineToNextDelivery(schedule, target.id, 3)

    const windows = await db.getAllDeliveryWindows()
    const locked = windows.filter(w => w.locked)
    expect(locked).toHaveLength(1)
    expect(locked[0].scheduled_date).toBe(schedule[0].date)

    const windowWines = await db.getDeliveryWindowWines(locked[0].id)
    const promoted = windowWines.find(ww => ww.wine_id === target.id)
    expect(promoted?.quantity).toBe(3)
  })

  it('keeps the promoted wine in the first delivery across rebuilds', async () => {
    const wines = await seedSmallCollection()
    const schedule = await planner.buildDeliverySchedule(wines)
    const target = wines[5]

    await planner.promoteWineToNextDelivery(schedule, target.id, 3)

    const rebuilt = await planner.buildDeliverySchedule(wines)
    expect(rebuilt[0].locked).toBe(true)
    const inFirst = rebuilt[0].wines.find(w => w.id === target.id)
    expect(inFirst?.quantity).toBe(3)
  })

  it('updates the quantity when the wine is already in the delivery', async () => {
    const wines = await seedSmallCollection()
    const schedule = await planner.buildDeliverySchedule(wines)
    const target = wines[5]

    await planner.promoteWineToNextDelivery(schedule, target.id, 3)
    // The app refreshes the schedule after every action (useDeliverySchedule);
    // promoting again on a stale schedule would create a second window
    const refreshed = await planner.buildDeliverySchedule(wines)
    await planner.promoteWineToNextDelivery(refreshed, target.id, 5)

    const windows = await db.getAllDeliveryWindows()
    const locked = windows.find(w => w.locked)
    const windowWines = await db.getDeliveryWindowWines(locked!.id)
    const promoted = windowWines.filter(ww => ww.wine_id === target.id)
    expect(promoted).toHaveLength(1)
    expect(promoted[0].quantity).toBe(5)
  })

  it('rejects a promotion that would exceed projected home capacity', async () => {
    const wines = await seedSmallCollection()
    const schedule = await planner.buildDeliverySchedule(wines)

    await expect(
      planner.promoteWineToNextDelivery(schedule, wines[0].id, 100)
    ).rejects.toThrow(/exceed home capacity/)

    // The rejection happens before any window is created or locked
    const windows = await db.getAllDeliveryWindows()
    expect(windows.filter(w => w.locked)).toHaveLength(0)
  })
})

describe('deferWineFromDelivery', () => {
  it('removes the wine from that delivery only — it reappears later', async () => {
    const wines = await seedCollection()
    const schedule = await planner.buildDeliverySchedule(wines)
    const target = schedule[0].wines[0]

    await planner.deferWineFromDelivery(schedule, target.id, schedule[0].date)

    const rebuilt = await planner.buildDeliverySchedule(wines)
    expect(rebuilt[0].wines.some(w => w.id === target.id)).toBe(false)

    // The deferred bottles are not lost: they land in a later delivery
    const laterEntries = rebuilt.slice(1)
    expect(laterEntries.some(e => e.wines.some(w => w.id === target.id))).toBe(true)
  })

  it('locks the window so the deferral survives repeated rebuilds', async () => {
    const wines = await seedCollection()
    const schedule = await planner.buildDeliverySchedule(wines)
    const target = schedule[0].wines[0]

    await planner.deferWineFromDelivery(schedule, target.id, schedule[0].date)

    const windows = await db.getAllDeliveryWindows()
    expect(windows.filter(w => w.locked)).toHaveLength(1)

    const once = await planner.buildDeliverySchedule(wines)
    const twice = await planner.buildDeliverySchedule(wines)
    expect(once[0].wines.some(w => w.id === target.id)).toBe(false)
    expect(twice.map(e => e.date)).toEqual(once.map(e => e.date))
  })

  it('refuses to defer the only wine in a delivery', async () => {
    // 6 bottles = one scheduler chunk, so the delivery holds a single entry
    const wine = await makeWine('Solo', 6)
    const schedule = await planner.buildDeliverySchedule([wine])
    expect(schedule[0].wines).toHaveLength(1)

    await expect(
      planner.deferWineFromDelivery(schedule, wine.id, schedule[0].date)
    ).rejects.toThrow('Cannot defer the only wine in this delivery')

    // Nothing was locked or removed
    const rebuilt = await planner.buildDeliverySchedule([wine])
    expect(rebuilt[0].wines[0].id).toBe(wine.id)
  })

  it('throws for a date that has no delivery', async () => {
    const wines = await seedCollection()
    const schedule = await planner.buildDeliverySchedule(wines)

    await expect(
      planner.deferWineFromDelivery(schedule, wines[0].id, '1999-01-01')
    ).rejects.toThrow('Delivery not found')
  })
})

describe('confirmDelivery', () => {
  it('moves every bottle of the delivery from storage to home', async () => {
    const wines = await seedCollection()
    const bottlesBefore = await totalBottles()
    const schedule = await planner.buildDeliverySchedule(wines)
    const entry = schedule[0]
    const deliveryTotal = entry.wines.reduce((sum, w) => sum + w.quantity, 0)

    await planner.confirmDelivery(schedule, entry.date)

    const after = await db.getAllWines()
    const totalHome = after.reduce((sum, w) => sum + w.quantity_at_home, 0)
    expect(totalHome).toBe(deliveryTotal)

    // A wine can appear as several chunk entries in one delivery —
    // aggregate them before comparing against the stored quantities
    const expectedPerWine = new Map<string, number>()
    for (const dw of entry.wines) {
      expectedPerWine.set(dw.id, (expectedPerWine.get(dw.id) ?? 0) + dw.quantity)
    }
    for (const [wineId, expected] of expectedPerWine) {
      const wine = after.find(w => w.id === wineId)
      expect(wine?.quantity_at_home).toBe(expected)
    }

    // Conservation: nothing created or destroyed by the move
    expect(await totalBottles()).toBe(bottlesBefore)
  })

  it('marks the window completed with the actual delivery date', async () => {
    const wines = await seedCollection()
    const schedule = await planner.buildDeliverySchedule(wines)

    await planner.confirmDelivery(schedule, schedule[0].date)

    const windows = await db.getAllDeliveryWindows()
    const completed = windows.filter(w => w.status === 'completed')
    expect(completed).toHaveLength(1)
    // scheduled_date is rewritten to the actual (today's) date
    const today = new Date().toISOString().slice(0, 10)
    expect(completed[0].scheduled_date).toBe(today)
  })

  it('completed deliveries stop being planned on rebuild', async () => {
    const wines = await seedCollection()
    const schedule = await planner.buildDeliverySchedule(wines)
    const firstDate = schedule[0].date

    await planner.confirmDelivery(schedule, firstDate)

    const freshWines = await db.getAllWines()
    const rebuilt = await planner.buildDeliverySchedule(freshWines)
    const upcoming = rebuilt.filter(e => e.status !== 'completed')
    // The delivered bottles are home now; upcoming deliveries plan the rest
    for (const entry of upcoming) {
      expect(entry.date).not.toBe(firstDate)
    }
  })

  it('rejects the whole delivery when home capacity is too small — no partial move', async () => {
    const wines = await seedCollection()
    const schedule = await planner.buildDeliverySchedule(wines)

    // Capacity shrinks after the schedule was built (e.g. user edits config)
    await workflows.updateCellarConfig({ max_home_capacity: 5 })

    await expect(planner.confirmDelivery(schedule, schedule[0].date)).rejects.toThrow(
      /exceeds home capacity/
    )

    // Atomicity: not a single bottle moved
    const after = await db.getAllWines()
    expect(after.every(w => w.quantity_at_home === 0)).toBe(true)
    const windows = await db.getAllDeliveryWindows()
    expect(windows.filter(w => w.status === 'completed')).toHaveLength(0)
  })
})

describe('getScheduledDeliveryDateForWine', () => {
  it('returns the generated schedule date for a storage wine', async () => {
    const wines = await seedCollection()
    const schedule = await planner.buildDeliverySchedule(wines)

    const date = await planner.getScheduledDeliveryDateForWine(wines, schedule[0].wines[0].id)
    expect(date).toBe(schedule[0].date)
  })

  it('prefers a DB-backed locked window over the generated schedule', async () => {
    const wines = await seedSmallCollection()
    const schedule = await planner.buildDeliverySchedule(wines)
    const target = wines[5]

    await planner.promoteWineToNextDelivery(schedule, target.id, 3)

    const date = await planner.getScheduledDeliveryDateForWine(wines, target.id)
    expect(date).toBe(schedule[0].date)

    const dbDate = await db.getNextScheduledDeliveryDateForWine(target.id)
    expect(dbDate).toBe(schedule[0].date)
  })

  it('returns undefined for a wine with no bottles in storage', async () => {
    const homeOnly = await makeWine('Casa', 0, { quantity_at_home: 4 })
    const date = await planner.getScheduledDeliveryDateForWine([homeOnly], homeOnly.id)
    expect(date).toBeUndefined()
  })

  it('returns undefined for an unknown wine', async () => {
    const wines = await seedCollection()
    const date = await planner.getScheduledDeliveryDateForWine(wines, 'no-such-wine')
    expect(date).toBeUndefined()
  })
})
