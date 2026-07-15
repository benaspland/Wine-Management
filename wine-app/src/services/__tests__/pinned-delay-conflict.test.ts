import { describe, it, expect, beforeEach } from 'vitest'

let memoryStorage = new Map()

const mockDb = {
  memoryStorage,

  pinWineToCurrentDelivery: (wineId: string, deliveryDate: string) => {
    const pins = memoryStorage.get('delivery_pins') || []
    pins.push({
      id: `pin-${Date.now()}`,
      wine_id: wineId,
      delivery_date: deliveryDate,
      created_at: new Date().toISOString(),
    })
    memoryStorage.set('delivery_pins', pins)
  },

  getPinnedWines: (deliveryDate: string): string[] => {
    const pins = memoryStorage.get('delivery_pins') || []
    return pins
      .filter((p: any) => p.delivery_date === deliveryDate)
      .map((p: any) => p.wine_id)
  },

  delayWineFromDelivery: (wineId: string, deliveryDate: string) => {
    const delays = memoryStorage.get('delivery_delays') || []
    delays.push({
      id: `delay-${Date.now()}`,
      wine_id: wineId,
      delivery_date: deliveryDate,
      created_at: new Date().toISOString(),
    })
    memoryStorage.set('delivery_delays', delays)

    // FIX: Remove the pin when delaying
    const pins = memoryStorage.get('delivery_pins') || []
    const filtered = pins.filter((p: any) => !(p.wine_id === wineId && p.delivery_date === deliveryDate))
    memoryStorage.set('delivery_pins', filtered)
  },

  getDelayedWines: (deliveryDate: string): string[] => {
    const delays = memoryStorage.get('delivery_delays') || []
    return delays
      .filter((d: any) => d.delivery_date === deliveryDate)
      .map((d: any) => d.wine_id)
  },

  clearPinMarks: (deliveryDate: string) => {
    const pins = memoryStorage.get('delivery_pins') || []
    const filtered = pins.filter((p: any) => p.delivery_date !== deliveryDate)
    memoryStorage.set('delivery_pins', filtered)
  },
}

describe('Pinned + Delayed Conflict', () => {
  beforeEach(() => {
    memoryStorage = new Map()
    memoryStorage.set('delivery_pins', [])
    memoryStorage.set('delivery_delays', [])
  })

  it('should clear pin when wine is delayed (fix for delayed wine still showing in UI)', () => {
    const wineId = 'wine-001'
    const deliveryDate = '2026-03-01'

    // Step 1: Wine is promoted to current delivery (pinned)
    mockDb.pinWineToCurrentDelivery(wineId, deliveryDate)
    let pinned = mockDb.getPinnedWines(deliveryDate)
    expect(pinned).toContain(wineId)

    // Step 2: User delays the wine
    mockDb.delayWineFromDelivery(wineId, deliveryDate)
    const delayed = mockDb.getDelayedWines(deliveryDate)
    expect(delayed).toContain(wineId)

    // FIX: Wine should no longer be pinned
    pinned = mockDb.getPinnedWines(deliveryDate)
    expect(pinned).not.toContain(wineId) // Wine is no longer pinned

    // When the schedule regenerates, the wine will not be re-added to current delivery
  })

  it('should maintain independent pin marks for different wines', () => {
    const deliveryDate = '2026-03-01'

    // Promote wine A and B
    mockDb.pinWineToCurrentDelivery('wine-A', deliveryDate)
    mockDb.pinWineToCurrentDelivery('wine-B', deliveryDate)
    let pinned = mockDb.getPinnedWines(deliveryDate)
    expect(pinned).toHaveLength(2)

    // Delay wine A (should remove its pin, but not B's)
    mockDb.delayWineFromDelivery('wine-A', deliveryDate)
    pinned = mockDb.getPinnedWines(deliveryDate)

    expect(pinned).toContain('wine-B')
    expect(pinned).not.toContain('wine-A')
  })
})
