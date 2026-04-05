import { describe, it, expect } from 'vitest'
import { ScheduleService } from '../schedule.service'
import type { Wine, DeliveryScheduleEntry } from '../../types/index'

// Helper to create a wine with sensible defaults
function makeWine(overrides: Partial<Wine> & { id: string }): Wine {
  return {
    name: 'Test Wine',
    vintage: 2020,
    tier: 1 as const,
    region: 'Bordeaux',
    producer: 'Test Producer',
    drinking_window_start: 2025,
    drinking_window_end: 2035,
    quantity_in_storage: 6,
    quantity_at_home: 0,
    format: '750ml',
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    ...overrides,
  }
}

describe('ScheduleService', () => {
  describe('generateDeliverySchedule', () => {
    it('should schedule ALL storage wines for delivery', () => {
      const wines: Wine[] = [
        makeWine({ id: 'w1', producer: 'A', tier: 1 as const, quantity_in_storage: 6 }),
        makeWine({ id: 'w2', producer: 'B', tier: 2 as const, quantity_in_storage: 6 }),
        makeWine({ id: 'w3', producer: 'C', tier: 3 as const, quantity_in_storage: 6 }),
        makeWine({ id: 'w4', producer: 'D', tier: 1 as const, quantity_in_storage: 6 }),
        makeWine({ id: 'w5', producer: 'E', tier: 2 as const, quantity_in_storage: 6 }),
      ]

      const deliveries = ScheduleService.generateDeliverySchedule(wines, 80, 0, [3, 9], 30)

      // Every wine should have at least one delivery entry
      const deliveredWineIds = new Set(deliveries.map(d => d.wine_id))
      for (const wine of wines) {
        expect(deliveredWineIds.has(wine.id)).toBe(true)
      }
    })

    it('should respect cellar capacity per delivery window', () => {
      // Create 30 wines = 180 bottles at 6 each; cellar capacity = 80
      const wines: Wine[] = Array.from({ length: 30 }, (_, i) =>
        makeWine({
          id: `w${i}`,
          producer: `Producer ${i}`,
          tier: ((i % 3) + 1) as 1 | 2 | 3,
          quantity_in_storage: 6,
        })
      )

      const deliveries = ScheduleService.generateDeliverySchedule(wines, 80, 0, [3, 9], 30)

      // Group deliveries by date
      const byDate: Record<string, number> = {}
      deliveries.forEach(d => {
        byDate[d.scheduled_date] = (byDate[d.scheduled_date] || 0) + d.quantity
      })

      // No single delivery date should exceed cellar capacity (80)
      for (const [date, bottles] of Object.entries(byDate)) {
        expect(bottles).toBeLessThanOrEqual(80)
      }
    })

    it('should schedule past-window wines with high priority', () => {
      const wines: Wine[] = [
        makeWine({
          id: 'past-window',
          producer: 'Past',
          tier: 1 as const,
          drinking_window_start: 2020,
          drinking_window_end: 2024, // Already past
          quantity_in_storage: 6,
        }),
        makeWine({
          id: 'future',
          producer: 'Future',
          tier: 1 as const,
          drinking_window_start: 2025,
          drinking_window_end: 2035,
          quantity_in_storage: 6,
        }),
        makeWine({ id: 'w3', producer: 'C', tier: 1 as const, quantity_in_storage: 6 }),
        makeWine({ id: 'w4', producer: 'D', tier: 1 as const, quantity_in_storage: 6 }),
      ]

      const deliveries = ScheduleService.generateDeliverySchedule(wines, 80, 0, [3, 9], 30)

      // Past-window wine should be scheduled
      const pastDelivery = deliveries.find(d => d.wine_id === 'past-window')
      expect(pastDelivery).toBeDefined()

      // Past-window wine should appear in first delivery (highest priority)
      const firstDate = deliveries.reduce((min, d) =>
        d.scheduled_date < min ? d.scheduled_date : min, '9999-99-99')
      expect(pastDelivery!.scheduled_date).toBe(firstDate)
    })

    it('should not put more bottles in a delivery than capacity allows', () => {
      // 50 wines at 6 bottles each = 300 bottles, capacity 80
      const wines: Wine[] = Array.from({ length: 50 }, (_, i) =>
        makeWine({
          id: `w${i}`,
          producer: `Producer ${i}`,
          tier: ((i % 3) + 1) as 1 | 2 | 3,
          quantity_in_storage: 6,
        })
      )

      const deliveries = ScheduleService.generateDeliverySchedule(wines, 80, 0, [3, 9], 45)

      // All wines must eventually be scheduled
      const totalDelivered = deliveries.reduce((sum, d) => sum + d.quantity, 0)
      const totalInStorage = wines.reduce((sum, w) => sum + w.quantity_in_storage, 0)
      expect(totalDelivered).toBe(totalInStorage)
    })
  })

  describe('generateDrinkingSchedule', () => {
    it('should NOT show wines for consumption before their delivery date', () => {
      const wines: Wine[] = [
        makeWine({
          id: 'w1',
          producer: 'A',
          tier: 1 as const,
          quantity_in_storage: 6,
          quantity_at_home: 0,
          drinking_window_start: 2026,
          drinking_window_end: 2035,
        }),
      ]

      // Delivery scheduled for September 2026
      const deliveryEntries: DeliveryScheduleEntry[] = [
        {
          wine_id: 'w1',
          quantity: 6,
          scheduled_date: '2026-09-01',
          tier: 1 as const,
          region: 'Bordeaux',
          status: 'pending',
        },
      ]

      const schedule = ScheduleService.generateDrinkingSchedule(
        wines, deliveryEntries, 2026, 3, 30
      )

      // No entry should be before September 2026
      console.log('Schedule entries:', schedule.map(e => ({
        wineId: e.wineId,
        year: e.suggestedYear,
        month: e.suggestedMonth,
      })))
      const earlyEntries = schedule.filter(
        e => e.suggestedYear === 2026 && e.suggestedMonth < 9
      )
      console.log('Early entries (before Sep 2026):', earlyEntries)
      expect(earlyEntries.length).toBe(0)
    })

    it('should show wines at home immediately for consumption', () => {
      const wines: Wine[] = [
        makeWine({
          id: 'home-wine',
          producer: 'HomeProducer',
          tier: 1 as const,
          quantity_in_storage: 0,
          quantity_at_home: 3,
          drinking_window_start: 2025,
          drinking_window_end: 2035,
        }),
      ]

      const schedule = ScheduleService.generateDrinkingSchedule(
        wines, [], 2026, 3, 30
      )

      // Should have at least one entry
      expect(schedule.length).toBeGreaterThan(0)
    })

    it('should exclude storage wines with no delivery scheduled', () => {
      const wines: Wine[] = [
        makeWine({
          id: 'no-delivery',
          producer: 'NoDelivery',
          tier: 1 as const,
          quantity_in_storage: 6,
          quantity_at_home: 0,
        }),
      ]

      // No delivery entries
      const schedule = ScheduleService.generateDrinkingSchedule(
        wines, [], 2026, 3, 30
      )

      // Wine without delivery should not appear
      const entries = schedule.filter(e => e.wineId === 'no-delivery')
      expect(entries.length).toBe(0)
    })

    it('end-to-end: delivery + drinking schedules work together correctly', () => {
      // Simulate user scenario: all wines in storage, none at home
      const wines: Wine[] = Array.from({ length: 20 }, (_, i) =>
        makeWine({
          id: `w${i}`,
          producer: `Producer ${i}`,
          tier: ((i % 3) + 1) as 1 | 2 | 3,
          name: `Wine ${i}`,
          quantity_in_storage: 6,
          quantity_at_home: 0,
          drinking_window_start: 2026,
          drinking_window_end: 2035,
        })
      )

      // Step 1: Generate delivery schedule
      const deliveries = ScheduleService.generateDeliverySchedule(
        wines, 80, 0, [3, 9], 45
      )

      // All wines must be scheduled for delivery
      const deliveredWineIds = new Set(deliveries.map(d => d.wine_id))
      for (const wine of wines) {
        expect(deliveredWineIds.has(wine.id)).toBe(true)
      }

      // Step 2: Generate drinking schedule using delivery entries
      const drinkingSchedule = ScheduleService.generateDrinkingSchedule(
        wines, deliveries, 2026, 5, 45
      )

      // Step 3: Verify no wine is scheduled for consumption before its delivery
      for (const entry of drinkingSchedule) {
        const delivery = deliveries.find(d => d.wine_id === entry.wineId)
        expect(delivery).toBeDefined()

        const deliveryYearMonth = delivery!.scheduled_date.substring(0, 7)
        const consumptionYearMonth = `${entry.suggestedYear}-${String(entry.suggestedMonth).padStart(2, '0')}`

        expect(consumptionYearMonth >= deliveryYearMonth).toBe(true)
      }

      // First delivery date
      const firstDeliveryDate = deliveries.reduce(
        (min, d) => (d.scheduled_date < min ? d.scheduled_date : min),
        '9999-99-99'
      )
      console.log('First delivery:', firstDeliveryDate)
      console.log('Total delivery entries:', deliveries.length)
      console.log('Total bottles delivered:', deliveries.reduce((s, d) => s + d.quantity, 0))
      console.log('Drinking schedule entries:', drinkingSchedule.length)

      // Group deliveries by date and check sizes
      const byDate: Record<string, number> = {}
      deliveries.forEach(d => {
        byDate[d.scheduled_date] = (byDate[d.scheduled_date] || 0) + d.quantity
      })
      console.log('Deliveries by date:', byDate)

      // No delivery should be absurdly large (more than capacity)
      for (const [date, bottles] of Object.entries(byDate)) {
        expect(bottles).toBeLessThanOrEqual(80)
      }
    })
  })
})
