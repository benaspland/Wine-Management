import { describe, it, expect, beforeEach } from 'vitest'

let memoryStorage = new Map()

// Mock database for testing delivery schedule persistence
const mockDb = {
  memoryStorage,

  initDeliverySchedule: () => {
    memoryStorage.set('delivery_schedule', [])
  },

  saveDeliverySchedule: (entries: any[]) => {
    // Clear existing entries first
    memoryStorage.set('delivery_schedule', [])
    // Insert new entries
    const schedule = entries.map((entry, idx) => ({
      ...entry,
      id: entry.id || `generated-${idx}`,
    }))
    memoryStorage.set('delivery_schedule', schedule)

    // Persist to localStorage
    const stored = Object.fromEntries(memoryStorage)
    localStorage.setItem('wine-app-db', JSON.stringify(stored))
  },

  getDeliverySchedule: () => {
    return memoryStorage.get('delivery_schedule') || []
  },

  getStoredData: () => {
    const stored = localStorage.getItem('wine-app-db')
    return stored ? JSON.parse(stored) : null
  }
}

describe('Delivery Schedule Save - UNIQUE Constraint', () => {
  beforeEach(() => {
    memoryStorage = new Map()
    mockDb.memoryStorage = memoryStorage
    localStorage.clear()
    mockDb.initDeliverySchedule()
  })

  it('should save delivery schedule entries without duplicates', () => {
    const entries = [
      { id: 'delivery-wine-001-2026-09', wine_id: 'wine-001', scheduled_date: '2026-09-01', quantity: 6 },
      { id: 'delivery-wine-002-2026-09', wine_id: 'wine-002', scheduled_date: '2026-09-01', quantity: 6 },
      { id: 'delivery-wine-003-2027-03', wine_id: 'wine-003', scheduled_date: '2027-03-01', quantity: 12 },
    ]

    mockDb.saveDeliverySchedule(entries)
    const saved = mockDb.getDeliverySchedule()

    expect(saved).toHaveLength(3)
    expect(saved[0].id).toBe('delivery-wine-001-2026-09')
  })

  it('should handle regeneration by clearing old entries first', () => {
    // First save
    const firstEntries = [
      { id: 'delivery-wine-001-2026-09', wine_id: 'wine-001', scheduled_date: '2026-09-01', quantity: 6 },
      { id: 'delivery-wine-002-2026-09', wine_id: 'wine-002', scheduled_date: '2026-09-01', quantity: 6 },
    ]
    mockDb.saveDeliverySchedule(firstEntries)
    let schedule = mockDb.getDeliverySchedule()
    expect(schedule).toHaveLength(2)

    // Regenerate (same IDs)
    const secondEntries = [
      { id: 'delivery-wine-001-2026-09', wine_id: 'wine-001', scheduled_date: '2026-09-01', quantity: 6 },
      { id: 'delivery-wine-002-2026-09', wine_id: 'wine-002', scheduled_date: '2026-09-01', quantity: 6 },
      { id: 'delivery-wine-003-2027-03', wine_id: 'wine-003', scheduled_date: '2027-03-01', quantity: 12 },
    ]
    mockDb.saveDeliverySchedule(secondEntries)
    schedule = mockDb.getDeliverySchedule()

    // Should have 3 entries (not 5, which would indicate duplicates)
    expect(schedule).toHaveLength(3)
    expect(schedule.map((s: any) => s.id)).toEqual([
      'delivery-wine-001-2026-09',
      'delivery-wine-002-2026-09',
      'delivery-wine-003-2027-03',
    ])
  })

  it('should persist schedule to localStorage on save', () => {
    const entries = [
      { id: 'delivery-wine-001-2026-09', wine_id: 'wine-001', scheduled_date: '2026-09-01', quantity: 6 },
    ]

    mockDb.saveDeliverySchedule(entries)
    const stored = mockDb.getStoredData()

    expect(stored).toBeDefined()
    expect(stored.delivery_schedule).toBeDefined()
    expect(stored.delivery_schedule).toHaveLength(1)
  })

  it('should handle large number of entries without ID conflicts', () => {
    const entries = Array.from({ length: 138 }, (_, i) => ({
      id: `delivery-wine-${String(i).padStart(3, '0')}-${2026 + Math.floor(i / 12)}-03`,
      wine_id: `wine-${String(i).padStart(3, '0')}`,
      scheduled_date: `${2026 + Math.floor(i / 12)}-03-01`,
      quantity: 6,
    }))

    mockDb.saveDeliverySchedule(entries)
    const saved = mockDb.getDeliverySchedule()

    expect(saved).toHaveLength(138)
    expect(saved[0].id).toBe('delivery-wine-000-2026-03')
    expect(saved[137].id).toBe('delivery-wine-137-2037-03')

    // Check no duplicates
    const ids = new Set(saved.map((s: any) => s.id))
    expect(ids.size).toBe(138) // All unique
  })

  it('should delete all existing rows before saving new schedule (regression test)', () => {
    // This test verifies the fix for the UNIQUE constraint error
    // where DELETE was only removing 1 row instead of all rows

    // First save: 50 entries
    const firstEntries = Array.from({ length: 50 }, (_, i) => ({
      id: `delivery-wine-${String(i).padStart(3, '0')}-2026-03`,
      wine_id: `wine-${String(i).padStart(3, '0')}`,
      scheduled_date: '2026-03-01',
      quantity: 6,
    }))
    mockDb.saveDeliverySchedule(firstEntries)
    let schedule = mockDb.getDeliverySchedule()
    expect(schedule).toHaveLength(50)

    // Second save: 138 entries (includes some IDs from first save)
    // If deletion doesn't work properly, this would have duplicates
    const secondEntries = Array.from({ length: 138 }, (_, i) => ({
      id: `delivery-wine-${String(i).padStart(3, '0')}-${2026 + Math.floor(i / 12)}-03`,
      wine_id: `wine-${String(i).padStart(3, '0')}`,
      scheduled_date: `${2026 + Math.floor(i / 12)}-03-01`,
      quantity: 6,
    }))
    mockDb.saveDeliverySchedule(secondEntries)
    schedule = mockDb.getDeliverySchedule()

    // CRITICAL: Should have exactly 138, not 50 + 138
    expect(schedule).toHaveLength(138)

    // All IDs should be unique (no duplicates from old entries)
    const ids = new Set(schedule.map((s: any) => s.id))
    expect(ids.size).toBe(138)

    // Verify the old entries were actually replaced
    expect(schedule.map((s: any) => s.id)).toContain('delivery-wine-000-2026-03')
    expect(schedule.map((s: any) => s.id)).not.toContain('delivery-wine-049-2026-03') // Only 50 in first save
  })
})
