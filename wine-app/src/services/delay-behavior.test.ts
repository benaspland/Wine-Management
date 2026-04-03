import { describe, it, expect, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let memoryStorage = new Map()

// Mock database functions for testing delay behavior
const mockDb = {
  memoryStorage,

  delayWineFromDelivery: (wineId: string, deliveryDate: string) => {
    const delays = memoryStorage.get('delivery_delays') || []
    delays.push({
      id: `delay-${Date.now()}`,
      wine_id: wineId,
      delivery_date: deliveryDate,
      created_at: new Date().toISOString(),
    })
    memoryStorage.set('delivery_delays', delays)
  },

  getDelayedWines: (deliveryDate: string): string[] => {
    const delays = memoryStorage.get('delivery_delays') || []
    return delays
      .filter((d: any) => d.delivery_date === deliveryDate)
      .map((d: any) => d.wine_id)
  },

  clearDelayMarks: (deliveryDate: string) => {
    const delays = memoryStorage.get('delivery_delays') || []
    const filtered = delays.filter((d: any) => d.delivery_date !== deliveryDate)
    memoryStorage.set('delivery_delays', filtered)
  },
}

describe('Delay Behavior - Wine Filtering in Current Delivery', () => {
  beforeEach(() => {
    memoryStorage = new Map()
    memoryStorage.set('delivery_delays', [])
  })

  it('should mark a wine as delayed', () => {
    mockDb.delayWineFromDelivery('wine-001', '2026-03-01')
    const delayed = mockDb.getDelayedWines('2026-03-01')

    expect(delayed).toContain('wine-001')
  })

  it('should exclude delayed wines from current delivery display', () => {
    // Setup: wine in current delivery
    const currentDeliveryWines = [
      { id: 'wine-001', name: 'Wine A', quantity: 6 },
      { id: 'wine-002', name: 'Wine B', quantity: 6 },
      { id: 'wine-003', name: 'Wine C', quantity: 6 },
    ]

    // Delay wine-002
    mockDb.delayWineFromDelivery('wine-002', '2026-03-01')

    // Filter wines for display (mimicking line 666 in DeliverySchedulePage)
    const delayedWines = mockDb.getDelayedWines('2026-03-01')
    const displayWines = currentDeliveryWines.filter(
      wine => !delayedWines.includes(wine.id)
    )

    // Should only show wines 001 and 003
    expect(displayWines).toHaveLength(2)
    expect(displayWines.map(w => w.id)).toEqual(['wine-001', 'wine-003'])
    expect(displayWines.map(w => w.id)).not.toContain('wine-002')
  })

  it('should show delay button only for non-delayed wines in current delivery', () => {
    // Setup wines
    const wines = [
      { id: 'wine-001', quantity: 6 },
      { id: 'wine-002', quantity: 6 },
    ]

    // Delay wine-001
    mockDb.delayWineFromDelivery('wine-001', '2026-03-01')
    const delayedWines = mockDb.getDelayedWines('2026-03-01')

    // Check delay button visibility for each wine (mimicking line 705 in DeliverySchedulePage)
    const isNextDelivery = true
    wines.forEach(wine => {
      const showDelayButton = isNextDelivery && !delayedWines.includes(wine.id)

      if (wine.id === 'wine-001') {
        expect(showDelayButton).toBe(false) // Delay button hidden for delayed wine
      } else {
        expect(showDelayButton).toBe(true) // Delay button shown for non-delayed wine
      }
    })
  })

  it('should remove delayed wine after clearing delay marks when delivery completes', () => {
    // Setup: wine delayed in current delivery
    mockDb.delayWineFromDelivery('wine-001', '2026-03-01')
    let delayed = mockDb.getDelayedWines('2026-03-01')
    expect(delayed).toContain('wine-001')

    // Mark delivery as complete - clears delay marks
    mockDb.clearDelayMarks('2026-03-01')

    // Wine should no longer be marked as delayed
    delayed = mockDb.getDelayedWines('2026-03-01')
    expect(delayed).not.toContain('wine-001')
  })

  it('should allow multiple wines to be delayed in same delivery', () => {
    mockDb.delayWineFromDelivery('wine-001', '2026-03-01')
    mockDb.delayWineFromDelivery('wine-002', '2026-03-01')
    mockDb.delayWineFromDelivery('wine-003', '2026-03-01')

    const delayed = mockDb.getDelayedWines('2026-03-01')
    expect(delayed).toHaveLength(3)
    expect(delayed).toContain('wine-001')
    expect(delayed).toContain('wine-002')
    expect(delayed).toContain('wine-003')
  })

  it('should keep delay marks separate for different delivery dates', () => {
    mockDb.delayWineFromDelivery('wine-001', '2026-03-01')
    mockDb.delayWineFromDelivery('wine-002', '2026-09-01')

    const march = mockDb.getDelayedWines('2026-03-01')
    const sept = mockDb.getDelayedWines('2026-09-01')

    expect(march).toContain('wine-001')
    expect(march).not.toContain('wine-002')
    expect(sept).toContain('wine-002')
    expect(sept).not.toContain('wine-001')
  })
})
