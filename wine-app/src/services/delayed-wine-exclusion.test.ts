import { describe, it, expect, beforeEach } from 'vitest'

// Mock delivery schedule entries and delayed wines
const mockDb = {
  delayedWines: new Map<string, Set<string>>(), // date -> set of wine IDs

  addDelayedWine: (wineId: string, date: string) => {
    if (!mockDb.delayedWines.has(date)) {
      mockDb.delayedWines.set(date, new Set())
    }
    mockDb.delayedWines.get(date)!.add(wineId)
  },

  getDelayedWines: (date: string): string[] => {
    return Array.from(mockDb.delayedWines.get(date) || [])
  },

  excludeDelayedFromSchedule: (schedule: any[]) => {
    // Collect all unique delivery dates
    const allDeliveryDates = new Set<string>()
    schedule.forEach(entry => {
      allDeliveryDates.add(entry.scheduled_date)
    })

    // Collect all delayed wines for all dates
    const allDelayedWines = new Set<string>()
    for (const date of allDeliveryDates) {
      const delayed = mockDb.getDelayedWines(date)
      delayed.forEach(wineId => allDelayedWines.add(wineId))
    }

    // Filter out delayed wines
    return schedule.filter(entry => !allDelayedWines.has(entry.wine_id))
  }
}

describe('Delayed Wine Exclusion from Delivery Schedule', () => {
  beforeEach(() => {
    mockDb.delayedWines.clear()
  })

  it('should remove delayed wines from schedule before saving', () => {
    const schedule = [
      { id: 'entry-1', wine_id: 'wine-001', scheduled_date: '2026-03-01', quantity: 6 },
      { id: 'entry-2', wine_id: 'wine-002', scheduled_date: '2026-03-01', quantity: 6 },
      { id: 'entry-3', wine_id: 'wine-003', scheduled_date: '2026-03-01', quantity: 6 },
    ]

    // Mark wine-002 as delayed in current delivery
    mockDb.addDelayedWine('wine-002', '2026-03-01')

    const filtered = mockDb.excludeDelayedFromSchedule(schedule)

    // Should have 2 wines left (wine-002 excluded)
    expect(filtered).toHaveLength(2)
    expect(filtered.map((e: any) => e.wine_id)).toEqual(['wine-001', 'wine-003'])
    expect(filtered.map((e: any) => e.wine_id)).not.toContain('wine-002')
  })

  it('should handle delayed wines across multiple delivery dates', () => {
    const schedule = [
      // March delivery
      { id: 'entry-1', wine_id: 'wine-001', scheduled_date: '2026-03-01', quantity: 6 },
      { id: 'entry-2', wine_id: 'wine-002', scheduled_date: '2026-03-01', quantity: 6 },
      // September delivery
      { id: 'entry-3', wine_id: 'wine-003', scheduled_date: '2026-09-01', quantity: 6 },
      { id: 'entry-4', wine_id: 'wine-004', scheduled_date: '2026-09-01', quantity: 6 },
    ]

    // Mark wine-002 delayed in March, wine-004 delayed in September
    mockDb.addDelayedWine('wine-002', '2026-03-01')
    mockDb.addDelayedWine('wine-004', '2026-09-01')

    const filtered = mockDb.excludeDelayedFromSchedule(schedule)

    // Should have 2 wines left (wine-002 and wine-004 excluded)
    expect(filtered).toHaveLength(2)
    expect(filtered.map((e: any) => e.wine_id)).toEqual(['wine-001', 'wine-003'])
  })

  it('should keep all wines if none are delayed', () => {
    const schedule = [
      { id: 'entry-1', wine_id: 'wine-001', scheduled_date: '2026-03-01', quantity: 6 },
      { id: 'entry-2', wine_id: 'wine-002', scheduled_date: '2026-03-01', quantity: 6 },
      { id: 'entry-3', wine_id: 'wine-003', scheduled_date: '2026-03-01', quantity: 6 },
    ]

    // No wines marked as delayed
    const filtered = mockDb.excludeDelayedFromSchedule(schedule)

    // All wines should remain
    expect(filtered).toHaveLength(3)
    expect(filtered.map((e: any) => e.wine_id)).toEqual(['wine-001', 'wine-002', 'wine-003'])
  })

  it('should handle wine delayed in current delivery but not in future deliveries', () => {
    const schedule = [
      // Current delivery (March)
      { id: 'entry-1', wine_id: 'wine-001', scheduled_date: '2026-03-01', quantity: 6 },
      { id: 'entry-2', wine_id: 'wine-002', scheduled_date: '2026-03-01', quantity: 6 },
      // Future delivery (September) - same wine rescheduled
      { id: 'entry-3', wine_id: 'wine-002', scheduled_date: '2026-09-01', quantity: 6 },
    ]

    // Wine-002 is delayed in current delivery only
    mockDb.addDelayedWine('wine-002', '2026-03-01')

    const filtered = mockDb.excludeDelayedFromSchedule(schedule)

    // Wine-002 should be excluded from BOTH deliveries (current AND future)
    // because it's delayed, it shouldn't appear in any scheduled delivery
    expect(filtered).toHaveLength(1)
    expect(filtered.map((e: any) => e.wine_id)).toEqual(['wine-001'])
    expect(filtered.map((e: any) => e.wine_id)).not.toContain('wine-002')
  })

  it('should handle large schedule with multiple delayed wines', () => {
    const schedule = Array.from({ length: 100 }, (_, i) => ({
      id: `entry-${i}`,
      wine_id: `wine-${String(i).padStart(3, '0')}`,
      scheduled_date: '2026-03-01',
      quantity: 6,
    }))

    // Delay wines 0, 10, 25, 50, 99
    const delayedIndices = [0, 10, 25, 50, 99]
    delayedIndices.forEach(i => {
      mockDb.addDelayedWine(`wine-${String(i).padStart(3, '0')}`, '2026-03-01')
    })

    const filtered = mockDb.excludeDelayedFromSchedule(schedule)

    // Should have 95 wines left (100 - 5 delayed)
    expect(filtered).toHaveLength(95)

    // Verify delayed wines are excluded
    const delayedIds = [0, 10, 25, 50, 99]
    delayedIds.forEach(i => {
      expect(filtered.map((e: any) => e.wine_id)).not.toContain(
        `wine-${String(i).padStart(3, '0')}`
      )
    })
  })

  it('should correctly identify wine details after exclusion', () => {
    const schedule = [
      { id: 'entry-1', wine_id: 'wine-001', scheduled_date: '2026-03-01', quantity: 6 },
      { id: 'entry-2', wine_id: 'wine-002', scheduled_date: '2026-03-01', quantity: 12 },
      { id: 'entry-3', wine_id: 'wine-003', scheduled_date: '2026-03-01', quantity: 8 },
    ]

    // Mark wine-002 (12 bottles) as delayed
    mockDb.addDelayedWine('wine-002', '2026-03-01')

    const filtered = mockDb.excludeDelayedFromSchedule(schedule)

    // Remaining schedule should have 6 + 8 = 14 bottles
    const totalBottles = filtered.reduce((sum: number, e: any) => sum + e.quantity, 0)
    expect(totalBottles).toBe(14)

    // Wine-002 with 12 bottles should be gone
    expect(filtered.find((e: any) => e.wine_id === 'wine-002')).toBeUndefined()
  })
})
