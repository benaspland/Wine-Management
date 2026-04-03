import { describe, it, expect, beforeEach } from 'vitest'

// Mock database for testing delayed wine rescheduling
const mockDb = {
  delayedByDate: new Map<string, Set<string>>(),
  deliverySchedule: [] as any[],

  markWineDelayedForDate: (wineId: string, date: string) => {
    if (!mockDb.delayedByDate.has(date)) {
      mockDb.delayedByDate.set(date, new Set())
    }
    mockDb.delayedByDate.get(date)!.add(wineId)
  },

  getDelayedWinesForDate: (date: string): string[] => {
    return Array.from(mockDb.delayedByDate.get(date) || [])
  },

  filterScheduleByDelayedDates: (schedule: any[]): any[] => {
    // Map delivery dates to delayed wines for that date
    const delayedByDate = new Map<string, Set<string>>()
    const allDeliveryDates = new Set<string>()

    schedule.forEach(entry => {
      allDeliveryDates.add(entry.scheduled_date)
    })

    for (const date of allDeliveryDates) {
      const delayed = mockDb.getDelayedWinesForDate(date)
      delayedByDate.set(date, new Set(delayed))
    }

    // Filter: exclude wine only from its specific delayed date, allow in future dates
    return schedule.filter(entry => {
      const delayedWinesForThisDate = delayedByDate.get(entry.scheduled_date) || new Set<string>()
      return !delayedWinesForThisDate.has(entry.wine_id)
    })
  },

  // Mock implementation of getWineScheduledDeliveryDate with delay checking
  getWineScheduledDeliveryDate: (wineId: string): string | undefined => {
    // Get all scheduled dates for this wine, sorted
    const allEntries = mockDb.deliverySchedule
      .filter((s: any) => s.wine_id === wineId)
      .sort((a: any, b: any) => a.scheduled_date.localeCompare(b.scheduled_date))

    // Get all dates this wine is delayed from
    const delayedDates = new Set<string>()
    for (const [date, wineIds] of mockDb.delayedByDate.entries()) {
      if (wineIds.has(wineId)) {
        delayedDates.add(date)
      }
    }

    // Return first scheduled date that is NOT delayed
    const entry = allEntries.find((s: any) => !delayedDates.has(s.scheduled_date))
    return entry?.scheduled_date
  }
}

describe('Delayed Wine Rescheduling - Per-Date Filtering', () => {
  beforeEach(() => {
    mockDb.delayedByDate.clear()
    mockDb.deliverySchedule = []
  })

  it('should exclude delayed wine from specific delivery date only, not from future dates', () => {
    const schedule = [
      // Current delivery (March)
      { id: 'entry-1', wine_id: 'wine-001', scheduled_date: '2026-03-01', quantity: 6 },
      { id: 'entry-2', wine_id: 'wine-002', scheduled_date: '2026-03-01', quantity: 6 },
      // Future delivery (September) - same wines rescheduled
      { id: 'entry-3', wine_id: 'wine-001', scheduled_date: '2026-09-01', quantity: 6 },
      { id: 'entry-4', wine_id: 'wine-002', scheduled_date: '2026-09-01', quantity: 6 },
    ]

    // Mark wine-002 as delayed only for March delivery
    mockDb.markWineDelayedForDate('wine-002', '2026-03-01')

    const filtered = mockDb.filterScheduleByDelayedDates(schedule)

    // wine-002 excluded from March but included in September
    expect(filtered).toHaveLength(3)

    // March delivery should only have wine-001
    const marchEntries = filtered.filter(e => e.scheduled_date === '2026-03-01')
    expect(marchEntries).toHaveLength(1)
    expect(marchEntries[0].wine_id).toBe('wine-001')

    // September delivery should have both wines
    const septemberEntries = filtered.filter(e => e.scheduled_date === '2026-09-01')
    expect(septemberEntries).toHaveLength(2)
    expect(septemberEntries.map(e => e.wine_id).sort()).toEqual(['wine-001', 'wine-002'])
  })

  it('should handle wine delayed from March but rescheduled to May', () => {
    const schedule = [
      // Current delivery (March) - wine-003 scheduled
      { id: 'entry-1', wine_id: 'wine-003', scheduled_date: '2026-03-01', quantity: 6 },
      // Future delivery (May) - wine-003 rescheduled
      { id: 'entry-2', wine_id: 'wine-003', scheduled_date: '2026-05-01', quantity: 6 },
    ]

    // Wine-003 delayed from March delivery
    mockDb.markWineDelayedForDate('wine-003', '2026-03-01')

    const filtered = mockDb.filterScheduleByDelayedDates(schedule)

    // wine-003 removed from March but still appears in May
    expect(filtered).toHaveLength(1)
    expect(filtered[0].scheduled_date).toBe('2026-05-01')
    expect(filtered[0].wine_id).toBe('wine-003')
  })

  it('should handle multiple wines delayed from different dates', () => {
    const schedule = [
      // March delivery
      { id: 'entry-1', wine_id: 'wine-001', scheduled_date: '2026-03-01', quantity: 6 },
      { id: 'entry-2', wine_id: 'wine-002', scheduled_date: '2026-03-01', quantity: 6 },
      // September delivery
      { id: 'entry-3', wine_id: 'wine-003', scheduled_date: '2026-09-01', quantity: 6 },
      { id: 'entry-4', wine_id: 'wine-004', scheduled_date: '2026-09-01', quantity: 6 },
    ]

    // wine-002 delayed from March, wine-004 delayed from September
    mockDb.markWineDelayedForDate('wine-002', '2026-03-01')
    mockDb.markWineDelayedForDate('wine-004', '2026-09-01')

    const filtered = mockDb.filterScheduleByDelayedDates(schedule)

    // Should have 2 wines (wine-001 in March, wine-003 in September)
    expect(filtered).toHaveLength(2)

    const marchWines = filtered.filter(e => e.scheduled_date === '2026-03-01')
    expect(marchWines).toHaveLength(1)
    expect(marchWines[0].wine_id).toBe('wine-001')

    const septemberWines = filtered.filter(e => e.scheduled_date === '2026-09-01')
    expect(septemberWines).toHaveLength(1)
    expect(septemberWines[0].wine_id).toBe('wine-003')
  })

  it('should allow wine to appear in multiple future deliveries after being delayed from current', () => {
    const schedule = [
      // Current delivery (March)
      { id: 'entry-1', wine_id: 'wine-005', scheduled_date: '2026-03-01', quantity: 6 },
      // Future deliveries
      { id: 'entry-2', wine_id: 'wine-005', scheduled_date: '2026-06-01', quantity: 6 },
      { id: 'entry-3', wine_id: 'wine-005', scheduled_date: '2026-09-01', quantity: 6 },
      { id: 'entry-4', wine_id: 'wine-005', scheduled_date: '2026-12-01', quantity: 6 },
    ]

    // wine-005 delayed from March delivery
    mockDb.markWineDelayedForDate('wine-005', '2026-03-01')

    const filtered = mockDb.filterScheduleByDelayedDates(schedule)

    // wine-005 should appear in June, September, December but not March
    expect(filtered).toHaveLength(3)
    expect(filtered.every(e => e.wine_id === 'wine-005')).toBe(true)
    expect(filtered.map(e => e.scheduled_date)).toEqual([
      '2026-06-01',
      '2026-09-01',
      '2026-12-01'
    ])
  })

  it('should not exclude wine if no delays are set for that date', () => {
    const schedule = [
      { id: 'entry-1', wine_id: 'wine-001', scheduled_date: '2026-03-01', quantity: 6 },
      { id: 'entry-2', wine_id: 'wine-002', scheduled_date: '2026-03-01', quantity: 6 },
      { id: 'entry-3', wine_id: 'wine-003', scheduled_date: '2026-03-01', quantity: 6 },
    ]

    // No wines marked as delayed
    const filtered = mockDb.filterScheduleByDelayedDates(schedule)

    // All wines should remain
    expect(filtered).toHaveLength(3)
    expect(filtered.map(e => e.wine_id).sort()).toEqual(['wine-001', 'wine-002', 'wine-003'])
  })

  it('should correctly exclude specific wine while keeping others in same delivery', () => {
    const schedule = [
      { id: 'entry-1', wine_id: 'wine-001', scheduled_date: '2026-03-01', quantity: 6 },
      { id: 'entry-2', wine_id: 'wine-002', scheduled_date: '2026-03-01', quantity: 12 },
      { id: 'entry-3', wine_id: 'wine-003', scheduled_date: '2026-03-01', quantity: 8 },
    ]

    // Only wine-002 delayed from March
    mockDb.markWineDelayedForDate('wine-002', '2026-03-01')

    const filtered = mockDb.filterScheduleByDelayedDates(schedule)

    // wine-001 and wine-003 should remain, wine-002 excluded
    expect(filtered).toHaveLength(2)
    expect(filtered.map(e => e.wine_id)).toEqual(['wine-001', 'wine-003'])

    // Verify total bottles remaining
    const totalBottles = filtered.reduce((sum, e) => sum + e.quantity, 0)
    expect(totalBottles).toBe(14) // 6 + 8, excluding 12
  })

  it('should handle wine delayed from one date but appearing in multiple other dates', () => {
    const schedule = [
      // March - wine appears
      { id: 'entry-1', wine_id: 'wine-001', scheduled_date: '2026-03-01', quantity: 6 },
      // June - wine delayed
      { id: 'entry-2', wine_id: 'wine-001', scheduled_date: '2026-06-01', quantity: 6 },
      // September - wine appears
      { id: 'entry-3', wine_id: 'wine-001', scheduled_date: '2026-09-01', quantity: 6 },
      // December - wine appears
      { id: 'entry-4', wine_id: 'wine-001', scheduled_date: '2026-12-01', quantity: 6 },
    ]

    // wine-001 delayed only from June delivery
    mockDb.markWineDelayedForDate('wine-001', '2026-06-01')

    const filtered = mockDb.filterScheduleByDelayedDates(schedule)

    // wine-001 should appear in March, September, December but not June
    expect(filtered).toHaveLength(3)
    expect(filtered.map(e => e.scheduled_date)).toEqual(['2026-03-01', '2026-09-01', '2026-12-01'])
  })
})

describe('Delayed Wine Rescheduling - Query with Delay Awareness', () => {
  beforeEach(() => {
    mockDb.delayedByDate.clear()
    mockDb.deliverySchedule = []
  })

  it('should return next delivery date when wine is delayed from current delivery', () => {
    // Setup: wine scheduled for August (current) and September (future)
    mockDb.deliverySchedule = [
      { id: 'entry-1', wine_id: 'wine-delayed-001', scheduled_date: '2026-08-01', quantity: 6 },
      { id: 'entry-2', wine_id: 'wine-delayed-001', scheduled_date: '2026-09-01', quantity: 6 },
    ]

    // Before delay: should return August
    let date = mockDb.getWineScheduledDeliveryDate('wine-delayed-001')
    expect(date).toBe('2026-08-01')

    // Mark wine as delayed from August
    mockDb.markWineDelayedForDate('wine-delayed-001', '2026-08-01')

    // After delay: should return September (next non-delayed date)
    date = mockDb.getWineScheduledDeliveryDate('wine-delayed-001')
    expect(date).toBe('2026-09-01')
  })

  it('should return undefined when wine is delayed from all scheduled dates', () => {
    mockDb.deliverySchedule = [
      { id: 'entry-1', wine_id: 'wine-fully-delayed', scheduled_date: '2026-08-01', quantity: 6 },
    ]

    mockDb.markWineDelayedForDate('wine-fully-delayed', '2026-08-01')

    const date = mockDb.getWineScheduledDeliveryDate('wine-fully-delayed')
    expect(date).toBeUndefined()
  })

  it('should skip over delayed dates and return the next available date', () => {
    // Wine scheduled for March, June, September, December
    mockDb.deliverySchedule = [
      { id: 'entry-1', wine_id: 'wine-multi-delay', scheduled_date: '2026-03-01', quantity: 6 },
      { id: 'entry-2', wine_id: 'wine-multi-delay', scheduled_date: '2026-06-01', quantity: 6 },
      { id: 'entry-3', wine_id: 'wine-multi-delay', scheduled_date: '2026-09-01', quantity: 6 },
      { id: 'entry-4', wine_id: 'wine-multi-delay', scheduled_date: '2026-12-01', quantity: 6 },
    ]

    // Delay from March and June
    mockDb.markWineDelayedForDate('wine-multi-delay', '2026-03-01')
    mockDb.markWineDelayedForDate('wine-multi-delay', '2026-06-01')

    // Should return September (first non-delayed date)
    const date = mockDb.getWineScheduledDeliveryDate('wine-multi-delay')
    expect(date).toBe('2026-09-01')
  })

  it('should handle wine delayed from early delivery but available in later ones', () => {
    mockDb.deliverySchedule = [
      { id: 'entry-1', wine_id: 'wine-early-delay', scheduled_date: '2026-03-01', quantity: 6 },
      { id: 'entry-2', wine_id: 'wine-early-delay', scheduled_date: '2026-06-01', quantity: 6 },
      { id: 'entry-3', wine_id: 'wine-early-delay', scheduled_date: '2026-09-01', quantity: 6 },
    ]

    // Delay from March only
    mockDb.markWineDelayedForDate('wine-early-delay', '2026-03-01')

    // Should return June (next available date after March)
    const date = mockDb.getWineScheduledDeliveryDate('wine-early-delay')
    expect(date).toBe('2026-06-01')
  })

  it('should return earliest scheduled date when no delays are set', () => {
    mockDb.deliverySchedule = [
      { id: 'entry-1', wine_id: 'wine-no-delay', scheduled_date: '2026-09-01', quantity: 6 },
      { id: 'entry-2', wine_id: 'wine-no-delay', scheduled_date: '2026-03-01', quantity: 6 },
      { id: 'entry-3', wine_id: 'wine-no-delay', scheduled_date: '2026-12-01', quantity: 6 },
    ]

    // No delays set
    const date = mockDb.getWineScheduledDeliveryDate('wine-no-delay')
    // Should return earliest date (March) even though added in different order
    expect(date).toBe('2026-03-01')
  })

  it('should correctly handle wine with single scheduled date that is NOT delayed', () => {
    mockDb.deliverySchedule = [
      { id: 'entry-1', wine_id: 'wine-single', scheduled_date: '2026-08-01', quantity: 6 },
    ]

    // No delays
    let date = mockDb.getWineScheduledDeliveryDate('wine-single')
    expect(date).toBe('2026-08-01')

    // Delay the single date
    mockDb.markWineDelayedForDate('wine-single', '2026-08-01')
    date = mockDb.getWineScheduledDeliveryDate('wine-single')
    expect(date).toBeUndefined()
  })
})
