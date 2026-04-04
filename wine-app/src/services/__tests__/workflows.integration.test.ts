/**
 * Integration/Regression Tests for Workflows
 * Tests complete workflows end-to-end to ensure all operations work together
 */

import { describe, it, expect, beforeEach } from 'vitest'
import * as db from '../database'
import * as workflows from '../workflows.service'
import type { ImportWineRow } from '../workflows.service'

// Mock localStorage for tests
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

describe('Workflows - Integration/Regression Tests', () => {
  beforeEach(async () => {
    localStorage.clear()
    await db.initializeDatabase()
  })

  // =========================================================================
  // WORKFLOW 1: LOAD WINE COLLECTION
  // =========================================================================

  describe('Workflow 1: Load Wine Collection', () => {
    it('should import multiple wines successfully', async () => {
      const wines: ImportWineRow[] = [
        {
          name: 'Château Margaux',
          vintage: 2015,
          tier: 1,
          region: 'Bordeaux',
          producer: 'Château Margaux',
          country: 'France',
          wine_type: 'Red',
          drinking_window_start: 2020,
          drinking_window_end: 2045,
          quantity_in_storage: 12,
          quantity_at_home: 0,
        },
        {
          name: 'Opus One',
          vintage: 2019,
          tier: 2,
          region: 'Napa Valley',
          producer: 'Opus One',
          country: 'USA',
          wine_type: 'Red',
          drinking_window_start: 2024,
          drinking_window_end: 2040,
          quantity_in_storage: 6,
          quantity_at_home: 2,
        },
      ]

      const result = await workflows.importWineCollection(wines)

      expect(result.imported).toBe(2)
      expect(result.skipped).toBe(0)
      expect(result.failed.length).toBe(0)

      const stored = await db.getAllWines()
      expect(stored.length).toBe(2)
    })

    it('should skip duplicate wines', async () => {
      const wine: ImportWineRow = {
        name: 'Château Margaux',
        vintage: 2015,
        tier: 1,
        region: 'Bordeaux',
        producer: 'Château Margaux',
        country: 'France',
        wine_type: 'Red',
        drinking_window_start: 2020,
        drinking_window_end: 2045,
        quantity_in_storage: 12,
        quantity_at_home: 0,
      }

      const wines = [wine, wine]

      const result = await workflows.importWineCollection(wines)

      expect(result.imported).toBe(1)
      expect(result.skipped).toBe(1)
      expect(result.failed.length).toBe(0)
    })

    it('should reject invalid wines', async () => {
      const wines: ImportWineRow[] = [
        {
          name: '',
          vintage: 2015,
          tier: 1,
          region: 'Bordeaux',
          drinking_window_start: 2020,
          drinking_window_end: 2045,
          quantity_in_storage: 12,
          quantity_at_home: 0,
        } as any,
        {
          name: 'Invalid Vintage',
          vintage: 1500,
          tier: 1,
          region: 'Bordeaux',
          drinking_window_start: 2020,
          drinking_window_end: 2045,
          quantity_in_storage: 12,
          quantity_at_home: 0,
        },
      ]

      const result = await workflows.importWineCollection(wines)

      expect(result.imported).toBe(0)
      expect(result.failed.length).toBe(2)
    })
  })

  // =========================================================================
  // WORKFLOW 2A: EDIT WINE DETAILS
  // =========================================================================

  describe('Workflow 2A: Edit Wine Details', () => {
    it('should edit wine details successfully', async () => {
      const wine = await db.createWine({
        name: 'Original Name',
        vintage: 2015,
        tier: 1,
        region: 'Original Region',
        drinking_window_start: 2020,
        drinking_window_end: 2045,
        quantity_in_storage: 12,
        quantity_at_home: 0,
      })

      await workflows.editWineDetails(wine.id, {
        name: 'Updated Name',
        region: 'Updated Region',
      })

      const updated = await db.getWineById(wine.id)

      expect(updated?.name).toBe('Updated Name')
      expect(updated?.region).toBe('Updated Region')
    })

    it('should validate drinking window updates', async () => {
      const wine = await db.createWine({
        name: 'Test',
        vintage: 2015,
        tier: 1,
        region: 'Test',
        drinking_window_start: 2020,
        drinking_window_end: 2045,
        quantity_in_storage: 12,
        quantity_at_home: 0,
      })

      await expect(
        workflows.editWineDetails(wine.id, {
          drinking_window_start: 2050,
          drinking_window_end: 2045,
        })
      ).rejects.toThrow()
    })

    it('should validate tier range', async () => {
      const wine = await db.createWine({
        name: 'Test',
        vintage: 2015,
        tier: 1,
        region: 'Test',
        drinking_window_start: 2020,
        drinking_window_end: 2045,
        quantity_in_storage: 12,
        quantity_at_home: 0,
      })

      await expect(workflows.editWineDetails(wine.id, { tier: 6 as any })).rejects.toThrow()
    })
  })

  // =========================================================================
  // WORKFLOW 2B: ADD BOTTLES
  // =========================================================================

  describe('Workflow 2B: Add Bottles', () => {
    it('should add bottles to storage', async () => {
      const wine = await db.createWine({
        name: 'Test',
        vintage: 2015,
        tier: 1,
        region: 'Test',
        drinking_window_start: 2020,
        drinking_window_end: 2045,
        quantity_in_storage: 10,
        quantity_at_home: 0,
      })

      await workflows.addBottles(wine.id, 5, 'storage')

      const updated = await db.getWineById(wine.id)

      expect(updated?.quantity_in_storage).toBe(15)
      expect(updated?.quantity_at_home).toBe(0)
    })

    it('should add bottles to home with capacity check', async () => {
      const config = await db.getCellarConfig()
      await db.updateCellarConfig({ max_home_capacity: 20 })

      const wine = await db.createWine({
        name: 'Test',
        vintage: 2015,
        tier: 1,
        region: 'Test',
        drinking_window_start: 2020,
        drinking_window_end: 2045,
        quantity_in_storage: 30,
        quantity_at_home: 10,
      })

      // Should succeed: 10 + 10 = 20 (at capacity)
      await workflows.addBottles(wine.id, 10, 'home')

      const updated = await db.getWineById(wine.id)
      expect(updated?.quantity_at_home).toBe(20)
    })

    it('should reject if home capacity exceeded', async () => {
      await db.updateCellarConfig({ max_home_capacity: 20 })

      const wine = await db.createWine({
        name: 'Test',
        vintage: 2015,
        tier: 1,
        region: 'Test',
        drinking_window_start: 2020,
        drinking_window_end: 2045,
        quantity_in_storage: 30,
        quantity_at_home: 15,
      })

      // Should fail: 15 + 10 = 25 > 20
      await expect(workflows.addBottles(wine.id, 10, 'home')).rejects.toThrow()
    })
  })

  // =========================================================================
  // WORKFLOW 2C: CONSUME WINE
  // =========================================================================

  describe('Workflow 2C: Consume Wine', () => {
    it('should log wine consumption', async () => {
      const wine = await db.createWine({
        name: 'Test',
        vintage: 2015,
        tier: 1,
        region: 'Test',
        drinking_window_start: 2020,
        drinking_window_end: 2045,
        quantity_in_storage: 10,
        quantity_at_home: 5,
      })

      // Simulate delivery first
      const window = await db.createDeliveryWindow({
        scheduled_date: '2026-01-01',
        locked: false,
        status: 'completed',
      })

      await db.createDeliveryCompletion({
        wine_id: wine.id,
        delivery_window_id: window.id,
        quantity_delivered: 5,
        delivered_date: '2026-01-01',
        status: 'completed',
      })

      // Now consume
      const today = new Date().toISOString().split('T')[0]
      await workflows.consumeWine(wine.id, today, 'Great dinner!')

      const updated = await db.getWineById(wine.id)
      expect(updated?.quantity_at_home).toBe(4)

      const log = await db.getConsumptionLogByWineId(wine.id)
      expect(log.length).toBe(1)
      expect(log[0].notes).toBe('Great dinner!')
    })

    it('should reject consumption before delivery', async () => {
      const wine = await db.createWine({
        name: 'Test',
        vintage: 2015,
        tier: 1,
        region: 'Test',
        drinking_window_start: 2020,
        drinking_window_end: 2045,
        quantity_in_storage: 10,
        quantity_at_home: 5,
      })

      const window = await db.createDeliveryWindow({
        scheduled_date: '2026-03-01',
        locked: false,
        status: 'completed',
      })

      await db.createDeliveryCompletion({
        wine_id: wine.id,
        delivery_window_id: window.id,
        quantity_delivered: 5,
        delivered_date: '2026-03-01',
        status: 'completed',
      })

      await expect(workflows.consumeWine(wine.id, '2026-02-01')).rejects.toThrow()
    })

    it('should reject consumption of wine at home count zero', async () => {
      const wine = await db.createWine({
        name: 'Test',
        vintage: 2015,
        tier: 1,
        region: 'Test',
        drinking_window_start: 2020,
        drinking_window_end: 2045,
        quantity_in_storage: 10,
        quantity_at_home: 0,
      })

      const today = new Date().toISOString().split('T')[0]

      await expect(workflows.consumeWine(wine.id, today)).rejects.toThrow()
    })
  })

  // =========================================================================
  // WORKFLOW 2D: MOVE TO HOME
  // =========================================================================

  describe('Workflow 2D: Move to Home', () => {
    it('should move bottles from storage to home', async () => {
      const wine = await db.createWine({
        name: 'Test',
        vintage: 2015,
        tier: 1,
        region: 'Test',
        drinking_window_start: 2020,
        drinking_window_end: 2045,
        quantity_in_storage: 10,
        quantity_at_home: 2,
      })

      await workflows.moveToHome(wine.id, 5)

      const updated = await db.getWineById(wine.id)

      expect(updated?.quantity_in_storage).toBe(5)
      expect(updated?.quantity_at_home).toBe(7)
    })

    it('should reject move if storage is empty', async () => {
      const wine = await db.createWine({
        name: 'Test',
        vintage: 2015,
        tier: 1,
        region: 'Test',
        drinking_window_start: 2020,
        drinking_window_end: 2045,
        quantity_in_storage: 0,
        quantity_at_home: 5,
      })

      await expect(workflows.moveToHome(wine.id, 1)).rejects.toThrow()
    })

    it('should reject move if exceeds home capacity', async () => {
      await db.updateCellarConfig({ max_home_capacity: 10 })

      const wine = await db.createWine({
        name: 'Test',
        vintage: 2015,
        tier: 1,
        region: 'Test',
        drinking_window_start: 2020,
        drinking_window_end: 2045,
        quantity_in_storage: 10,
        quantity_at_home: 8,
      })

      await expect(workflows.moveToHome(wine.id, 5)).rejects.toThrow()
    })
  })

  // =========================================================================
  // WORKFLOW 3: UPDATE CELLAR CONFIGURATION
  // =========================================================================

  describe('Workflow 3: Update Cellar Configuration', () => {
    it('should update cellar config values', async () => {
      await workflows.updateCellarConfig({
        max_home_capacity: 150,
        annual_consumption_target: 60,
      })

      const config = await db.getCellarConfig()

      expect(config.max_home_capacity).toBe(150)
      expect(config.annual_consumption_target).toBe(60)
    })

    it('should reject invalid capacity', async () => {
      await expect(
        workflows.updateCellarConfig({ max_home_capacity: 0 })
      ).rejects.toThrow()
    })

    it('should reject invalid consumption target', async () => {
      await expect(
        workflows.updateCellarConfig({ annual_consumption_target: -10 })
      ).rejects.toThrow()
    })
  })

  // =========================================================================
  // WORKFLOW 4: GENERATE DELIVERY SCHEDULE
  // =========================================================================

  describe('Workflow 4: Generate Delivery Schedule', () => {
    it('should generate delivery schedule for storage wines', async () => {
      await db.createWine({
        name: 'Wine 1',
        vintage: 2020,
        tier: 1,
        region: 'Bordeaux',
        drinking_window_start: 2025,
        drinking_window_end: 2040,
        quantity_in_storage: 12,
        quantity_at_home: 0,
      })

      await db.createWine({
        name: 'Wine 2',
        vintage: 2019,
        tier: 2,
        region: 'Burgundy',
        drinking_window_start: 2024,
        drinking_window_end: 2039,
        quantity_in_storage: 6,
        quantity_at_home: 0,
      })

      const schedule = await workflows.generateDeliverySchedule()

      expect(schedule.length).toBe(2)
      expect(schedule[0].quantity).toBeGreaterThan(0)
      expect(schedule[1].quantity).toBeGreaterThan(0)
    })

    it('should return empty schedule if no storage wines', async () => {
      const schedule = await workflows.generateDeliverySchedule()

      expect(schedule.length).toBe(0)
    })
  })

  // =========================================================================
  // WORKFLOW 5 & 5B: LOCK/UNLOCK DELIVERY WINDOW
  // =========================================================================

  describe('Workflow 5 & 5B: Lock/Unlock Delivery Window', () => {
    it('should lock a delivery window', async () => {
      const wine = await db.createWine({
        name: 'Test',
        vintage: 2015,
        tier: 1,
        region: 'Test',
        drinking_window_start: 2020,
        drinking_window_end: 2045,
        quantity_in_storage: 10,
        quantity_at_home: 0,
      })

      const window = await db.createDeliveryWindow({
        scheduled_date: '2026-05-04',
        locked: false,
        status: 'planned',
      })

      const schedule = [
        {
          wine_id: wine.id,
          quantity: 5,
          scheduled_date: '2026-05-04',
          tier: 1 as const,
          region: 'Test',
          status: 'pending' as const,
        },
      ]

      await workflows.lockDeliveryWindow(window.id, schedule)

      const locked = await db.getDeliveryWindowById(window.id)
      expect(locked?.locked).toBe(true)

      const windowWines = await db.getDeliveryWindowWines(window.id)
      expect(windowWines.length).toBe(1)
    })

    it('should unlock a delivery window', async () => {
      const window = await db.createDeliveryWindow({
        scheduled_date: '2026-05-04',
        locked: true,
        status: 'planned',
      })

      const wine = await db.createWine({
        name: 'Test',
        vintage: 2015,
        tier: 1,
        region: 'Test',
        drinking_window_start: 2020,
        drinking_window_end: 2045,
        quantity_in_storage: 10,
        quantity_at_home: 0,
      })

      await db.addWineToDeliveryWindow(window.id, wine.id, 5)

      await workflows.unlockDeliveryWindow(window.id)

      const unlocked = await db.getDeliveryWindowById(window.id)
      expect(unlocked?.locked).toBe(false)

      const windowWines = await db.getDeliveryWindowWines(window.id)
      expect(windowWines.length).toBe(0)
    })
  })

  // =========================================================================
  // WORKFLOW 6: PROMOTE WINE TO DELIVERY
  // =========================================================================

  describe('Workflow 6: Promote Wine to Delivery', () => {
    it('should promote wine to current delivery window', async () => {
      const wine = await db.createWine({
        name: 'Test',
        vintage: 2015,
        tier: 1,
        region: 'Test',
        drinking_window_start: 2020,
        drinking_window_end: 2045,
        quantity_in_storage: 10,
        quantity_at_home: 0,
      })

      await workflows.promoteWineToDelivery(wine.id, 5)

      const window = await db.getCurrentDeliveryWindow()
      expect(window?.locked).toBe(true)

      const wines = await db.getDeliveryWindowWines(window!.id)
      expect(wines.length).toBe(1)
      expect(wines[0].wine_id).toBe(wine.id)
      expect(wines[0].quantity).toBe(5)
    })

    it('should reject promotion if wine not in storage', async () => {
      const wine = await db.createWine({
        name: 'Test',
        vintage: 2015,
        tier: 1,
        region: 'Test',
        drinking_window_start: 2020,
        drinking_window_end: 2045,
        quantity_in_storage: 0,
        quantity_at_home: 5,
      })

      await expect(workflows.promoteWineToDelivery(wine.id, 1)).rejects.toThrow()
    })
  })

  // =========================================================================
  // WORKFLOW 7: DELAY WINE FROM DELIVERY
  // =========================================================================

  describe('Workflow 7: Delay Wine from Delivery', () => {
    it('should delay wine from locked window', async () => {
      const wine = await db.createWine({
        name: 'Test',
        vintage: 2015,
        tier: 1,
        region: 'Test',
        drinking_window_start: 2020,
        drinking_window_end: 2045,
        quantity_in_storage: 10,
        quantity_at_home: 0,
      })

      const window = await db.createDeliveryWindow({
        scheduled_date: '2026-05-04',
        locked: true,
        status: 'planned',
      })

      await db.addWineToDeliveryWindow(window.id, wine.id, 5)

      await workflows.delayWineFromDelivery(window.id, wine.id)

      const wines = await db.getDeliveryWindowWines(window.id)
      expect(wines.length).toBe(0)
    })
  })

  // =========================================================================
  // WORKFLOW 8: MARK DELIVERY COMPLETE
  // =========================================================================

  describe('Workflow 8: Mark Delivery Complete', () => {
    it('should mark delivery as complete and move wines to home', async () => {
      const wine = await db.createWine({
        name: 'Test',
        vintage: 2015,
        tier: 1,
        region: 'Test',
        drinking_window_start: 2020,
        drinking_window_end: 2045,
        quantity_in_storage: 10,
        quantity_at_home: 0,
      })

      const window = await db.createDeliveryWindow({
        scheduled_date: '2026-05-04',
        locked: true,
        status: 'planned',
      })

      await db.addWineToDeliveryWindow(window.id, wine.id, 5)

      await workflows.markDeliveryComplete(window.id)

      const updated = await db.getWineById(wine.id)
      expect(updated?.quantity_in_storage).toBe(5)
      expect(updated?.quantity_at_home).toBe(5)

      const completedWindow = await db.getDeliveryWindowById(window.id)
      expect(completedWindow?.status).toBe('completed')

      const completions = await db.getDeliveryCompletionByWineId(wine.id)
      expect(completions.length).toBe(1)
    })

    it('should reject if delivery exceeds home capacity', async () => {
      await db.updateCellarConfig({ max_home_capacity: 3 })

      const wine = await db.createWine({
        name: 'Test',
        vintage: 2015,
        tier: 1,
        region: 'Test',
        drinking_window_start: 2020,
        drinking_window_end: 2045,
        quantity_in_storage: 10,
        quantity_at_home: 2,
      })

      const window = await db.createDeliveryWindow({
        scheduled_date: '2026-05-04',
        locked: true,
        status: 'planned',
      })

      await db.addWineToDeliveryWindow(window.id, wine.id, 5)

      await expect(workflows.markDeliveryComplete(window.id)).rejects.toThrow()
    })
  })

  // =========================================================================
  // WORKFLOW 9: GENERATE CONSUMPTION SCHEDULE
  // =========================================================================

  describe('Workflow 9: Generate Consumption Schedule', () => {
    it('should generate consumption schedule for home wines', async () => {
      await db.createWine({
        name: 'Wine 1',
        vintage: 2020,
        tier: 1,
        region: 'Bordeaux',
        drinking_window_start: 2025,
        drinking_window_end: 2040,
        quantity_in_storage: 0,
        quantity_at_home: 12,
      })

      await db.createWine({
        name: 'Wine 2',
        vintage: 2019,
        tier: 2,
        region: 'Burgundy',
        drinking_window_start: 2024,
        drinking_window_end: 2039,
        quantity_in_storage: 0,
        quantity_at_home: 6,
      })

      const schedule = await workflows.generateConsumptionSchedule()

      expect(schedule.length).toBeGreaterThan(0)
      expect(schedule[0].planned_consumption_month).toBeDefined()
      expect(schedule[0].quantity).toBeGreaterThan(0)
    })

    it('should return empty schedule if no home wines', async () => {
      const schedule = await workflows.generateConsumptionSchedule()

      expect(schedule.length).toBe(0)
    })
  })

  // =========================================================================
  // WORKFLOW 10: RECORD WINE CONSUMPTION
  // =========================================================================

  describe('Workflow 10: Record Wine Consumption', () => {
    it('should record wine consumption with default date', async () => {
      const wine = await db.createWine({
        name: 'Test',
        vintage: 2015,
        tier: 1,
        region: 'Test',
        drinking_window_start: 2020,
        drinking_window_end: 2045,
        quantity_in_storage: 10,
        quantity_at_home: 5,
      })

      const window = await db.createDeliveryWindow({
        scheduled_date: '2026-01-01',
        locked: false,
        status: 'completed',
      })

      await db.createDeliveryCompletion({
        wine_id: wine.id,
        delivery_window_id: window.id,
        quantity_delivered: 5,
        delivered_date: '2026-01-01',
        status: 'completed',
      })

      await workflows.recordWineConsumption(wine.id, undefined, 'Lovely wine')

      const updated = await db.getWineById(wine.id)
      expect(updated?.quantity_at_home).toBe(4)

      const log = await db.getConsumptionLogByWineId(wine.id)
      expect(log.length).toBe(1)
      expect(log[0].notes).toBe('Lovely wine')
    })
  })

  // =========================================================================
  // END-TO-END WORKFLOW SCENARIO
  // =========================================================================

  describe('End-to-End Workflow Scenario', () => {
    it('should complete full wine management cycle', async () => {
      // 1. Import wines
      const wines: ImportWineRow[] = [
        {
          name: 'Château Margaux',
          vintage: 2015,
          tier: 1,
          region: 'Bordeaux',
          producer: 'Château Margaux',
          country: 'France',
          wine_type: 'Red',
          drinking_window_start: 2020,
          drinking_window_end: 2045,
          quantity_in_storage: 12,
          quantity_at_home: 0,
        },
      ]

      const importResult = await workflows.importWineCollection(wines)
      expect(importResult.imported).toBe(1)

      const allWines = await db.getAllWines()
      const wine = allWines[0]

      // 2. Generate delivery schedule
      const schedule = await workflows.generateDeliverySchedule()
      expect(schedule.length).toBeGreaterThan(0)

      // 3. Create delivery window and promote wine
      await workflows.promoteWineToDelivery(wine.id, 6)

      // 4. Lock the window
      const currentWindow = await db.getCurrentDeliveryWindow()
      const windowWines = await db.getDeliveryWindowWines(currentWindow!.id)

      await workflows.lockDeliveryWindow(currentWindow!.id, [
        {
          wine_id: wine.id,
          quantity: 6,
          scheduled_date: currentWindow!.scheduled_date,
          tier: 1 as const,
          region: wine.region,
          status: 'pending' as const,
        },
      ])

      // 5. Mark delivery complete
      await workflows.markDeliveryComplete(currentWindow!.id)

      const delivered = await db.getWineById(wine.id)
      expect(delivered?.quantity_at_home).toBe(6)
      expect(delivered?.quantity_in_storage).toBe(6)

      // 6. Generate consumption schedule
      const consumptionSchedule = await workflows.generateConsumptionSchedule()
      expect(consumptionSchedule.length).toBeGreaterThan(0)

      // 7. Record consumption
      const today = new Date().toISOString().split('T')[0]
      await workflows.recordWineConsumption(wine.id, today, 'Excellent!')

      const final = await db.getWineById(wine.id)
      expect(final?.quantity_at_home).toBe(5)

      const consumptionLog = await db.getConsumptionLogByWineId(wine.id)
      expect(consumptionLog.length).toBe(1)
    })
  })
})
