/**
 * Dashboard stats — pure derivations from the wine list and consumption
 * log that power the Overview page.
 */

import { describe, it, expect } from 'vitest'
import {
  computeDashboardStats,
  computeDrinkingPace,
  nextDelivery,
} from '../dashboard.service'
import type { Wine, ConsumptionLogEntry } from '../../types/index'
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
    expect(stats.windowWatch.closingSoonest[0].name).toBe('Urgent')
    expect(stats.windowWatch.closingSoonest[0].windowEnd).toBe(2027)
  })

  it('lists at most the three most urgent closing wines, soonest first', () => {
    const stats = computeDashboardStats(
      [
        wine({ drinking_window_end: 2028, name: 'C' }),
        wine({ drinking_window_end: 2026, name: 'A' }),
        wine({ drinking_window_end: 2027, name: 'B' }),
        wine({ drinking_window_end: 2027, name: 'B2' }),
      ].map(w => ({ ...w, drinking_window_start: 2020 })),
      NOW
    )

    expect(stats.windowWatch.closingSoonest).toHaveLength(3)
    expect(stats.windowWatch.closingSoonest.map(w => w.name)).toEqual(['A', 'B', 'B2'])
  })
})

describe('computeDrinkingPace', () => {
  function entry(date: string): ConsumptionLogEntry {
    seq += 1
    return {
      id: `log-${seq}`,
      wine_id: 'w-1',
      consumed_date: date,
      created_at: date,
    }
  }

  it('counts only the current year and compares against a pro-rata target', () => {
    const log = [entry('2026-01-15'), entry('2026-03-02'), entry('2025-11-20')]
    // July 1st = almost exactly half the year
    const pace = computeDrinkingPace(log, 30, new Date(2026, 6, 1))

    expect(pace.consumedThisYear).toBe(2)
    expect(pace.target).toBe(30)
    expect(pace.expectedByNow).toBe(15)
    expect(pace.delta).toBe(-13)
  })

  it('reports ahead of pace with a positive delta', () => {
    const log = Array.from({ length: 10 }, (_, i) => entry(`2026-01-${String(i + 1).padStart(2, '0')}`))
    const pace = computeDrinkingPace(log, 30, new Date(2026, 1, 1)) // Feb 1 ≈ 8.5%

    expect(pace.consumedThisYear).toBe(10)
    expect(pace.delta).toBeGreaterThan(0)
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
