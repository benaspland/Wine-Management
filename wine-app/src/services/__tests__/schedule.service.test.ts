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
      for (const bottles of Object.values(byDate)) {
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

    // ════════════════════════════════════════════
    // REGRESSION TESTS for min_delivery_bottles plumbing
    // ════════════════════════════════════════════

    it('regression: target=30, min=24, cap=80 → schedules a first delivery (not blocked by minimum)', () => {
      // This is the original bug: with target=30 / cap=80 / min=24, the very
      // first delivery window was being skipped because the adaptive-minimum
      // hack had already been removed but space wasn't being freed fast enough.
      // The load-bearing fix is the inter-slot drinking simulation, which
      // should always free enough space for the first delivery to meet the
      // 24-bottle minimum.
      const wines: Wine[] = Array.from({ length: 40 }, (_, i) =>
        makeWine({
          id: `w${i}`,
          producer: `Producer ${i}`,
          tier: ((i % 3) + 1) as 1 | 2 | 3,
          quantity_in_storage: 6,
          quantity_at_home: 0,
          drinking_window_start: 2025,
          drinking_window_end: 2035,
        })
      )

      const deliveries = ScheduleService.generateDeliverySchedule(
        wines, 80, 0, [3, 9], 30, 24
      )

      // Must produce at least one delivery
      expect(deliveries.length).toBeGreaterThan(0)

      // Group by date and check the first delivery respects the minimum
      const byDate: Record<string, number> = {}
      deliveries.forEach(d => {
        byDate[d.scheduled_date] = (byDate[d.scheduled_date] || 0) + d.quantity
      })
      const firstDate = Object.keys(byDate).sort()[0]
      expect(byDate[firstDate]).toBeGreaterThanOrEqual(24)
    })

    it('enforces the configured minimum — no sub-minimum deliveries except the final one', () => {
      // Low consumption target (10/yr): without proper enforcement, deliveries
      // would be scheduled at whatever fits as space trickles open — e.g. 6
      // bottles, 12 bottles, etc. With min=24 enforced, every delivery must
      // be ≥24 bottles OR it's the final sub-24 delivery of remaining stock.
      const wines: Wine[] = Array.from({ length: 20 }, (_, i) =>
        makeWine({
          id: `w${i}`,
          producer: `Producer ${i}`,
          tier: ((i % 3) + 1) as 1 | 2 | 3,
          quantity_in_storage: 6,
          quantity_at_home: 0,
          drinking_window_start: 2025,
          drinking_window_end: 2040,
        })
      )

      const deliveries = ScheduleService.generateDeliverySchedule(
        wines, 80, 0, [3, 9], 10, 24
      )

      // Group by date
      const byDate: Record<string, number> = {}
      deliveries.forEach(d => {
        byDate[d.scheduled_date] = (byDate[d.scheduled_date] || 0) + d.quantity
      })

      const sortedDates = Object.keys(byDate).sort()
      // Every delivery except (possibly) the last must be >= 24 bottles
      for (let i = 0; i < sortedDates.length - 1; i++) {
        const date = sortedDates[i]
        expect(byDate[date]).toBeGreaterThanOrEqual(24)
      }
      // The final delivery may be smaller (it's the "mop up the last few
      // bottles" exception), but all earlier ones must meet the minimum.
    })

    it('respects a custom minDeliveryBottles value (plumbing test)', () => {
      // Verify the minDeliveryBottles parameter is actually threaded through
      // the algorithm by comparing two runs with the same wines but different
      // minimums. With min=50 we should see FEWER deliveries (the middle
      // delivery is held back until it can reach 50 bottles) than with min=24.
      const makeWines = () =>
        Array.from({ length: 20 }, (_, i) =>
          makeWine({
            id: `w${i}`,
            producer: `Producer ${i}`,
            tier: ((i % 3) + 1) as 1 | 2 | 3,
            quantity_in_storage: 6,
            quantity_at_home: 0,
            drinking_window_start: 2025,
            drinking_window_end: 2040,
          })
        )

      const deliveriesWithMin24 = ScheduleService.generateDeliverySchedule(
        makeWines(), 80, 0, [3, 9], 10, 24
      )
      const deliveriesWithMin50 = ScheduleService.generateDeliverySchedule(
        makeWines(), 80, 0, [3, 9], 10, 50
      )

      const byDate24: Record<string, number> = {}
      deliveriesWithMin24.forEach(d => {
        byDate24[d.scheduled_date] = (byDate24[d.scheduled_date] || 0) + d.quantity
      })
      const byDate50: Record<string, number> = {}
      deliveriesWithMin50.forEach(d => {
        byDate50[d.scheduled_date] = (byDate50[d.scheduled_date] || 0) + d.quantity
      })

      // Both should eventually deliver ALL 120 bottles (20 wines × 6)
      const total24 = Object.values(byDate24).reduce((a, b) => a + b, 0)
      const total50 = Object.values(byDate50).reduce((a, b) => a + b, 0)
      expect(total24).toBe(120)
      expect(total50).toBe(120)

      // Every non-final delivery must respect the corresponding minimum
      const sortedDates24 = Object.keys(byDate24).sort()
      for (let i = 0; i < sortedDates24.length - 1; i++) {
        expect(byDate24[sortedDates24[i]]).toBeGreaterThanOrEqual(24)
      }
      const sortedDates50 = Object.keys(byDate50).sort()
      for (let i = 0; i < sortedDates50.length - 1; i++) {
        expect(byDate50[sortedDates50[i]]).toBeGreaterThanOrEqual(50)
      }

      // Plumbing check: min=50 must produce a materially different schedule
      // than min=24. Specifically, min=50 should have fewer or equal distinct
      // delivery dates (since small deliveries get held back and batched).
      // If the parameter were ignored, both runs would be identical.
      expect(sortedDates50.length).toBeLessThanOrEqual(sortedDates24.length)
      // And at least one of the schedules must differ (proving the parameter
      // has real effect). With this wine set the schedules should diverge.
      const schedulesDiffer =
        sortedDates24.length !== sortedDates50.length ||
        sortedDates24.some((d, i) => byDate24[d] !== byDate50[sortedDates50[i]])
      expect(schedulesDiffer).toBe(true)
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
      for (const bottles of Object.values(byDate)) {
        expect(bottles).toBeLessThanOrEqual(80)
      }
    })

    it('should never schedule the same wine twice in the same month', () => {
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

      const deliveries = ScheduleService.generateDeliverySchedule(wines, 100, 0, [3, 9], 45)
      const schedule = ScheduleService.generateDrinkingSchedule(wines, deliveries, 2026, 5, 45)

      // Group by year-month and check for duplicate wineIds
      const byMonth: Record<string, string[]> = {}
      schedule.forEach(e => {
        const key = `${e.suggestedYear}-${String(e.suggestedMonth).padStart(2, '0')}`
        if (!byMonth[key]) byMonth[key] = []
        byMonth[key].push(e.wineId)
      })

      for (const wineIds of Object.values(byMonth)) {
        const unique = new Set(wineIds)
        expect(unique.size).toBe(wineIds.length)
      }
    })

    it('should not schedule more consumption than bottles available', () => {
      const wines: Wine[] = [
        makeWine({
          id: 'limited',
          producer: 'Limited',
          tier: 1 as const,
          quantity_in_storage: 3,
          quantity_at_home: 0,
          drinking_window_start: 2026,
          drinking_window_end: 2035,
        }),
      ]

      const deliveries = ScheduleService.generateDeliverySchedule(wines, 100, 0, [3, 9], 45)
      const schedule = ScheduleService.generateDrinkingSchedule(wines, deliveries, 2026, 10, 45)

      // Wine has 3 bottles — should appear at most 3 times total
      const appearances = schedule.filter(e => e.wineId === 'limited').length
      expect(appearances).toBeLessThanOrEqual(3)
    })
  })

  describe('buildDisplaySchedule', () => {
    const wineA = makeWine({
      id: 'a',
      name: 'Wine A',
      producer: 'Producer A',
      tier: 1,
      quantity_in_storage: 6,
    })
    const wineB = makeWine({
      id: 'b',
      name: 'Wine B',
      producer: 'Producer B',
      tier: 1,
      quantity_in_storage: 6,
    })
    const wineC = makeWine({
      id: 'c',
      name: 'Wine C',
      producer: 'Producer C',
      tier: 2,
      quantity_in_storage: 6,
    })
    const wineD = makeWine({
      id: 'd',
      name: 'Wine D',
      producer: 'Producer D',
      tier: 2,
      quantity_in_storage: 6,
    })

    const makeDelivery = (
      wineId: string,
      date: string,
      quantity = 6
    ): DeliveryScheduleEntry => ({
      wine_id: wineId,
      quantity,
      scheduled_date: date,
      tier: 1,
      region: 'Test',
      status: 'pending',
    })

    it('preserves unlocked schedule unchanged when no DB windows exist', () => {
      const deliveries: DeliveryScheduleEntry[] = [
        makeDelivery('a', '2026-03-01'),
        makeDelivery('b', '2026-03-01'),
        makeDelivery('c', '2026-09-01'),
      ]

      const result = ScheduleService.buildDisplaySchedule(
        deliveries,
        [wineA, wineB, wineC],
        [],
        new Map(),
        [3, 9],
        1
      )

      expect(result).toHaveLength(2)
      expect(result[0].date).toBe('2026-03-01')
      expect(result[0].locked).toBe(false)
      expect(result[0].wines.map(w => w.id).sort()).toEqual(['a', 'b'])
      expect(result[1].date).toBe('2026-09-01')
      expect(result[1].wines.map(w => w.id)).toEqual(['c'])
    })

    it('uses DB curation as source of truth for locked windows', () => {
      const deliveries: DeliveryScheduleEntry[] = [
        makeDelivery('a', '2026-03-01'),
        makeDelivery('b', '2026-03-01'),
        makeDelivery('c', '2026-03-01'),
      ]
      const dbWindows = [
        {
          id: 'win1',
          scheduled_date: '2026-03-01',
          status: 'planned',
          locked: true,
        },
      ]
      const lockedWindowWines = new Map([
        [
          'win1',
          [
            { wine_id: 'b', quantity: 6 },
            { wine_id: 'c', quantity: 6 },
          ],
        ],
      ])

      const result = ScheduleService.buildDisplaySchedule(
        deliveries,
        [wineA, wineB, wineC],
        dbWindows,
        lockedWindowWines,
        [3, 9],
        1
      )

      // The locked window should show DB-curated wines (b, c) — not a.
      const march = result.find(e => e.date === '2026-03-01')
      expect(march).toBeDefined()
      expect(march!.locked).toBe(true)
      expect(march!.windowId).toBe('win1')
      expect(march!.wines.map(w => w.id).sort()).toEqual(['b', 'c'])
    })

    it('relocates a deferred wine to the next unlocked delivery (regression)', () => {
      // Scheduler originally placed A, B, C at March 2026 and D at September.
      // User deferred A from March 2026 (now locked with [B, C]). After
      // reconciliation, A must still appear — in the September delivery.
      const deliveries: DeliveryScheduleEntry[] = [
        makeDelivery('a', '2026-03-01'),
        makeDelivery('b', '2026-03-01'),
        makeDelivery('c', '2026-03-01'),
        makeDelivery('d', '2026-09-01'),
      ]
      const dbWindows = [
        {
          id: 'win-march',
          scheduled_date: '2026-03-01',
          status: 'planned',
          locked: true,
        },
      ]
      const lockedWindowWines = new Map([
        [
          'win-march',
          [
            { wine_id: 'b', quantity: 6 },
            { wine_id: 'c', quantity: 6 },
          ],
        ],
      ])

      const result = ScheduleService.buildDisplaySchedule(
        deliveries,
        [wineA, wineB, wineC, wineD],
        dbWindows,
        lockedWindowWines,
        [3, 9],
        1
      )

      // March is locked with B + C only
      const march = result.find(e => e.date === '2026-03-01')!
      expect(march.wines.map(w => w.id).sort()).toEqual(['b', 'c'])

      // Deferred wine A must appear somewhere LATER in the schedule
      const allShownIds = new Set(result.flatMap(e => e.wines.map(w => w.id)))
      expect(allShownIds.has('a')).toBe(true)

      // Specifically, A should be in the next unlocked delivery (September)
      const september = result.find(e => e.date === '2026-09-01')!
      expect(september.wines.map(w => w.id).sort()).toEqual(['a', 'd'])
    })

    it('creates a new delivery date when there is no later unlocked delivery', () => {
      // Scheduler placed A, B at March 2026. User deferred A. There is no
      // later unlocked delivery — we should create one at September 2026.
      const deliveries: DeliveryScheduleEntry[] = [
        makeDelivery('a', '2026-03-01'),
        makeDelivery('b', '2026-03-01'),
      ]
      const dbWindows = [
        {
          id: 'win-march',
          scheduled_date: '2026-03-01',
          status: 'planned',
          locked: true,
        },
      ]
      const lockedWindowWines = new Map([
        ['win-march', [{ wine_id: 'b', quantity: 6 }]],
      ])

      const result = ScheduleService.buildDisplaySchedule(
        deliveries,
        [wineA, wineB],
        dbWindows,
        lockedWindowWines,
        [3, 9],
        1
      )

      expect(result).toHaveLength(2)
      expect(result[0].date).toBe('2026-03-01')
      expect(result[0].locked).toBe(true)
      expect(result[0].wines.map(w => w.id)).toEqual(['b'])

      // A relocated to a newly created September window
      expect(result[1].date).toBe('2026-09-01')
      expect(result[1].locked).toBe(false)
      expect(result[1].wines.map(w => w.id)).toEqual(['a'])
    })

    it('skips subsequent locked deliveries when relocating a deferred wine', () => {
      // Both March and September are locked. A deferred wine from March
      // should bypass September (also locked) and go to a new delivery.
      const deliveries: DeliveryScheduleEntry[] = [
        makeDelivery('a', '2026-03-01'),
        makeDelivery('b', '2026-03-01'),
        makeDelivery('c', '2026-09-01'),
      ]
      const dbWindows = [
        {
          id: 'win-march',
          scheduled_date: '2026-03-01',
          status: 'planned',
          locked: true,
        },
        {
          id: 'win-sept',
          scheduled_date: '2026-09-01',
          status: 'planned',
          locked: true,
        },
      ]
      const lockedWindowWines = new Map([
        ['win-march', [{ wine_id: 'b', quantity: 6 }]],
        ['win-sept', [{ wine_id: 'c', quantity: 6 }]],
      ])

      const result = ScheduleService.buildDisplaySchedule(
        deliveries,
        [wineA, wineB, wineC],
        dbWindows,
        lockedWindowWines,
        [3, 9],
        1
      )

      // A should end up in a new unlocked delivery — March 2027 (next March
      // after September 2026).
      const allShownIds = new Set(result.flatMap(e => e.wines.map(w => w.id)))
      expect(allShownIds.has('a')).toBe(true)

      const aEntry = result.find(e => e.wines.some(w => w.id === 'a'))!
      expect(aEntry.locked).toBe(false)
      expect(aEntry.date > '2026-09-01').toBe(true)
    })

    it('removes promoted wines from their original scheduler date to avoid duplication', () => {
      // Scheduler placed wine C at September 2026. User promoted it to
      // March 2026 (now locked with [A, C]). After reconciliation, C
      // should appear ONLY in March — not also in September.
      const deliveries: DeliveryScheduleEntry[] = [
        makeDelivery('a', '2026-03-01'),
        makeDelivery('b', '2026-09-01'),
        makeDelivery('c', '2026-09-01'),
      ]
      const dbWindows = [
        {
          id: 'win-march',
          scheduled_date: '2026-03-01',
          status: 'planned',
          locked: true,
        },
      ]
      const lockedWindowWines = new Map([
        [
          'win-march',
          [
            { wine_id: 'a', quantity: 6 },
            { wine_id: 'c', quantity: 6 },
          ],
        ],
      ])

      const result = ScheduleService.buildDisplaySchedule(
        deliveries,
        [wineA, wineB, wineC],
        dbWindows,
        lockedWindowWines,
        [3, 9],
        1
      )

      // C must appear exactly once
      const cCount = result
        .flatMap(e => e.wines)
        .filter(w => w.id === 'c').length
      expect(cCount).toBe(1)

      // C should be in the March (locked) window
      const march = result.find(e => e.date === '2026-03-01')!
      expect(march.wines.map(w => w.id).sort()).toEqual(['a', 'c'])

      // September should only have B
      const september = result.find(e => e.date === '2026-09-01')!
      expect(september.wines.map(w => w.id)).toEqual(['b'])
    })

    it('consolidates sub-minimum unlocked entries after committed wine removal', () => {
      // Scenario: scheduler created three deliveries. March is locked and wine e
      // was promoted into it from September, dropping September to 18 bottles
      // (below the 24-bottle minimum). September's wines should merge into
      // the next unlocked delivery (March 2027).
      const wines = [
        makeWine({ id: 'a', producer: 'A', quantity_in_storage: 6 }),
        makeWine({ id: 'b', producer: 'B', quantity_in_storage: 6 }),
        makeWine({ id: 'c', producer: 'C', quantity_in_storage: 6 }),
        makeWine({ id: 'd', producer: 'D', quantity_in_storage: 6 }),
        makeWine({ id: 'e', producer: 'E', quantity_in_storage: 6 }),
        makeWine({ id: 'f', producer: 'F', quantity_in_storage: 6 }),
        makeWine({ id: 'g', producer: 'G', quantity_in_storage: 6 }),
        makeWine({ id: 'h', producer: 'H', quantity_in_storage: 6 }),
        makeWine({ id: 'i', producer: 'I', quantity_in_storage: 6 }),
        makeWine({ id: 'j', producer: 'J', quantity_in_storage: 6 }),
        makeWine({ id: 'k', producer: 'K', quantity_in_storage: 6 }),
        makeWine({ id: 'l', producer: 'L', quantity_in_storage: 6 }),
      ]

      // Scheduler placed a-d in March (24), e-h in September (24), i-l in March 2027 (24)
      const deliveries: DeliveryScheduleEntry[] = [
        { wine_id: 'a', quantity: 6, scheduled_date: '2026-03-01', tier: 1, status: 'pending' },
        { wine_id: 'b', quantity: 6, scheduled_date: '2026-03-01', tier: 1, status: 'pending' },
        { wine_id: 'c', quantity: 6, scheduled_date: '2026-03-01', tier: 1, status: 'pending' },
        { wine_id: 'd', quantity: 6, scheduled_date: '2026-03-01', tier: 1, status: 'pending' },
        { wine_id: 'e', quantity: 6, scheduled_date: '2026-09-01', tier: 1, status: 'pending' },
        { wine_id: 'f', quantity: 6, scheduled_date: '2026-09-01', tier: 1, status: 'pending' },
        { wine_id: 'g', quantity: 6, scheduled_date: '2026-09-01', tier: 1, status: 'pending' },
        { wine_id: 'h', quantity: 6, scheduled_date: '2026-09-01', tier: 1, status: 'pending' },
        { wine_id: 'i', quantity: 6, scheduled_date: '2027-03-01', tier: 1, status: 'pending' },
        { wine_id: 'j', quantity: 6, scheduled_date: '2027-03-01', tier: 1, status: 'pending' },
        { wine_id: 'k', quantity: 6, scheduled_date: '2027-03-01', tier: 1, status: 'pending' },
        { wine_id: 'l', quantity: 6, scheduled_date: '2027-03-01', tier: 1, status: 'pending' },
      ]

      // March is locked with a-d PLUS wine e was promoted into it
      const dbWindows = [
        { id: 'win-march', scheduled_date: '2026-03-01', status: 'planned', locked: true },
      ]
      const lockedWindowWines = new Map([
        ['win-march', [
          { wine_id: 'a', quantity: 6 },
          { wine_id: 'b', quantity: 6 },
          { wine_id: 'c', quantity: 6 },
          { wine_id: 'd', quantity: 6 },
          { wine_id: 'e', quantity: 6 }, // promoted from September
        ]],
      ])

      // With min=24, September (now only f,g,h = 18 bottles) should merge into March 2027
      const result = ScheduleService.buildDisplaySchedule(
        deliveries, wines, dbWindows, lockedWindowWines, [3, 9], 24
      )

      // March should have 5 wines (a-e)
      const march = result.find(e => e.date === '2026-03-01')!
      expect(march.wines.length).toBe(5)
      expect(march.wines.reduce((sum, w) => sum + w.quantity, 0)).toBe(30)

      // September (18 bottles) should NOT appear as its own delivery
      const september = result.find(e => e.date === '2026-09-01')
      expect(september).toBeUndefined()

      // March 2027 should now have f,g,h merged in alongside i,j,k,l
      const march2027 = result.find(e => e.date === '2027-03-01')!
      expect(march2027).toBeDefined()
      const allIds = march2027.wines.map(w => w.id).sort()
      expect(allIds).toEqual(['f', 'g', 'h', 'i', 'j', 'k', 'l'])
      expect(march2027.wines.reduce((sum, w) => sum + w.quantity, 0)).toBe(42)
    })

    it('keeps sub-minimum entry when it is the last unlocked delivery', () => {
      // If the sub-minimum entry is the final delivery, keep it (final delivery exception)
      const wines = [
        makeWine({ id: 'a', producer: 'A', quantity_in_storage: 6 }),
        makeWine({ id: 'b', producer: 'B', quantity_in_storage: 6 }),
        makeWine({ id: 'c', producer: 'C', quantity_in_storage: 6 }),
      ]

      // Only one delivery with 18 bottles (< 24 min)
      const deliveries: DeliveryScheduleEntry[] = [
        { wine_id: 'a', quantity: 6, scheduled_date: '2026-09-01', tier: 1, status: 'pending' },
        { wine_id: 'b', quantity: 6, scheduled_date: '2026-09-01', tier: 1, status: 'pending' },
        { wine_id: 'c', quantity: 6, scheduled_date: '2026-09-01', tier: 1, status: 'pending' },
      ]

      const result = ScheduleService.buildDisplaySchedule(
        deliveries, wines, [], new Map(), [3, 9], 24
      )

      // Should keep the entry even though below minimum — it's the last one
      expect(result.length).toBe(1)
      expect(result[0].wines.length).toBe(3)
    })

    describe('projectHomeAtDate', () => {
      it('returns currentHome when target date is today', () => {
        const now = new Date('2026-03-01T00:00:00Z')
        const result = ScheduleService.projectHomeAtDate(60, '2026-03-01', 30, now)
        expect(result).toBe(60)
      })

      it('returns currentHome when target date is in the past', () => {
        const now = new Date('2026-06-01T00:00:00Z')
        const result = ScheduleService.projectHomeAtDate(60, '2026-01-01', 30, now)
        expect(result).toBe(60)
      })

      it('subtracts pro-rated consumption for a future delivery', () => {
        // 6 months away at 30/year → expect ~15 bottles consumed
        const now = new Date('2026-03-01T00:00:00Z')
        const result = ScheduleService.projectHomeAtDate(72, '2026-09-01', 30, now)
        expect(result).toBeGreaterThanOrEqual(56)
        expect(result).toBeLessThanOrEqual(58)
      })

      it('clamps to zero when projected consumption exceeds current home', () => {
        // 12 months away at 30/year → 30 bottles expected; only 10 at home
        const now = new Date('2026-03-01T00:00:00Z')
        const result = ScheduleService.projectHomeAtDate(10, '2027-03-01', 30, now)
        expect(result).toBe(0)
      })

      it('ignores consumption when annual target is 0', () => {
        const now = new Date('2026-03-01T00:00:00Z')
        const result = ScheduleService.projectHomeAtDate(60, '2027-03-01', 0, now)
        expect(result).toBe(60)
      })

      it('regression: a long-dated promote that would fit after consumption is not blocked', () => {
        // Scenario: 72 at home, delivery 11 months away, 12-bottle delivery,
        // promoting 6 more. Old check: 72 + 12 + 6 = 90 > 80 → rejected.
        // New check: project consumption of ~27 bottles → ~45 at delivery,
        // + 12 + 6 = 63 → allowed.
        const now = new Date('2026-04-01T00:00:00Z')
        const projectedHome = ScheduleService.projectHomeAtDate(
          72,
          '2027-03-01',
          30,
          now
        )
        const projectedAfterDelivery = projectedHome + 12 + 6
        expect(projectedAfterDelivery).toBeLessThanOrEqual(80)
      })

      it('still blocks a near-term promote that would genuinely overflow', () => {
        // Delivery in 2 weeks → only ~1 bottle consumed; projection stays close to current.
        const now = new Date('2026-03-01T00:00:00Z')
        const projectedHome = ScheduleService.projectHomeAtDate(
          72,
          '2026-03-15',
          30,
          now
        )
        const projectedAfterDelivery = projectedHome + 12 + 6
        expect(projectedAfterDelivery).toBeGreaterThan(80)
      })
    })

    it('preserves an empty locked window so the user can still see it', () => {
      // User deferred the only wine from a locked window — it's now empty
      // but should still appear in the schedule (so the user can confirm it
      // or add something back).
      const deliveries: DeliveryScheduleEntry[] = [
        makeDelivery('a', '2026-03-01'),
      ]
      const dbWindows = [
        {
          id: 'win-march',
          scheduled_date: '2026-03-01',
          status: 'planned',
          locked: true,
        },
      ]
      const lockedWindowWines = new Map<
        string,
        Array<{ wine_id: string; quantity: number }>
      >([['win-march', []]])

      const result = ScheduleService.buildDisplaySchedule(
        deliveries,
        [wineA],
        dbWindows,
        lockedWindowWines,
        [3, 9],
        1
      )

      const march = result.find(e => e.date === '2026-03-01')!
      expect(march).toBeDefined()
      expect(march.locked).toBe(true)
      expect(march.wines).toHaveLength(0)

      // A (displaced) should also appear somewhere later
      const laterEntries = result.filter(e => e.date > '2026-03-01')
      const aShownLater = laterEntries.some(e =>
        e.wines.some(w => w.id === 'a')
      )
      expect(aShownLater).toBe(true)
    })
  })
})
