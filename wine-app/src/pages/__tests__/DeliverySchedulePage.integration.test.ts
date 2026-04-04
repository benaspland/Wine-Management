/**
 * Integration Tests for DeliverySchedulePage
 * Tests delivery schedule generation and window management
 */

import { describe, it, expect, beforeEach } from 'vitest'
import * as db from '../../services/database'
import { ScheduleService } from '../../services/schedule.service'

describe('DeliverySchedulePage Integration Tests', () => {
  beforeEach(async () => {
    localStorage.clear()
    await db.initializeDatabase()
  })

  describe('Delivery Schedule Generation', () => {
    it('should generate delivery schedule for storage wines', async () => {
      // Create test wines
      const wine1 = await db.createWine({
        name: 'Test Red',
        vintage: 2020,
        tier: 1,
        region: 'Bordeaux',
        drinking_window_start: 2024,
        drinking_window_end: 2035,
        quantity_in_storage: 12,
        quantity_at_home: 0,
      })

      const wine2 = await db.createWine({
        name: 'Test White',
        vintage: 2021,
        tier: 2,
        region: 'Burgundy',
        drinking_window_start: 2024,
        drinking_window_end: 2030,
        quantity_in_storage: 6,
        quantity_at_home: 0,
      })

      // Generate delivery schedule
      const wines = await db.getAllWines()
      const schedule = ScheduleService.generateDeliverySchedule(wines, 80, 0)

      // Verify schedule exists
      expect(schedule.length).toBeGreaterThan(0)
      expect(schedule[0].wine_id).toBeDefined()
      expect(schedule[0].quantity).toBeGreaterThan(0)
      expect(schedule[0].scheduled_date).toBeDefined()
    })

    it('should respect cellar capacity constraints', async () => {
      // Create wines
      const wine1 = await db.createWine({
        name: 'Red Wine',
        vintage: 2020,
        tier: 1,
        region: 'Bordeaux',
        drinking_window_start: 2024,
        drinking_window_end: 2035,
        quantity_in_storage: 50,
        quantity_at_home: 0,
      })

      // Generate schedule with limited capacity
      const wines = await db.getAllWines()
      const schedule = ScheduleService.generateDeliverySchedule(wines, 20, 0)

      // Total delivered should respect capacity
      const totalDelivered = schedule.reduce((sum, s) => sum + s.quantity, 0)
      expect(totalDelivered).toBeLessThanOrEqual(20)
    })

    it('should consider current wines at home', async () => {
      // Create wines
      const wine = await db.createWine({
        name: 'Test Wine',
        vintage: 2020,
        tier: 1,
        region: 'Bordeaux',
        drinking_window_start: 2024,
        drinking_window_end: 2035,
        quantity_in_storage: 50,
        quantity_at_home: 60,
      })

      // With capacity 80 and 60 at home, only 20 can be delivered
      const wines = await db.getAllWines()
      const schedule = ScheduleService.generateDeliverySchedule(wines, 80, 60)

      const totalDelivered = schedule.reduce((sum, s) => sum + s.quantity, 0)
      expect(totalDelivered).toBeLessThanOrEqual(20)
    })
  })

  describe('Delivery Window Operations', () => {
    it('should create and manage delivery windows', async () => {
      // Create delivery window
      const window = await db.createDeliveryWindow({
        scheduled_date: '2026-05-15',
        locked: false,
        status: 'planned',
      })

      expect(window.id).toBeDefined()
      expect(window.scheduled_date).toBe('2026-05-15')
      expect(window.status).toBe('planned')
      expect(window.locked).toBe(false)

      // Retrieve window
      const retrieved = await db.getDeliveryWindowById(window.id)
      expect(retrieved?.id).toBe(window.id)
      expect(retrieved?.status).toBe('planned')
    })

    it('should list all delivery windows', async () => {
      // Create multiple windows
      const w1 = await db.createDeliveryWindow({
        scheduled_date: '2026-03-15',
        locked: false,
        status: 'planned',
      })
      const w2 = await db.createDeliveryWindow({
        scheduled_date: '2026-05-15',
        locked: false,
        status: 'planned',
      })

      // Get all windows
      const windows = await db.getAllDeliveryWindows()
      expect(windows.length).toBeGreaterThanOrEqual(2)
      expect(windows.some(w => w.id === w1.id)).toBe(true)
      expect(windows.some(w => w.id === w2.id)).toBe(true)
    })

    it('should update delivery window status', async () => {
      // Create window
      const window = await db.createDeliveryWindow({
        scheduled_date: '2026-05-15',
        locked: false,
        status: 'planned',
      })

      // Update status
      await db.updateDeliveryWindow(window.id, { status: 'in_transit' })

      // Verify update
      const updated = await db.getDeliveryWindowById(window.id)
      expect(updated?.status).toBe('in_transit')
    })

    it('should lock/unlock delivery windows', async () => {
      // Create window
      const window = await db.createDeliveryWindow({
        scheduled_date: '2026-05-15',
        locked: false,
        status: 'planned',
      })

      // Lock window
      await db.updateDeliveryWindow(window.id, { locked: true })
      let updated = await db.getDeliveryWindowById(window.id)
      expect(updated?.locked).toBe(true)

      // Unlock window
      await db.updateDeliveryWindow(window.id, { locked: false })
      updated = await db.getDeliveryWindowById(window.id)
      expect(updated?.locked).toBe(false)
    })
  })

  describe('Delivery Window Wine Management', () => {
    it('should add wines to delivery windows', async () => {
      // Create window and wine
      const window = await db.createDeliveryWindow({
        scheduled_date: '2026-05-15',
        locked: false,
        status: 'planned',
      })

      const wine = await db.createWine({
        name: 'Test Wine',
        vintage: 2020,
        tier: 1,
        region: 'Bordeaux',
        drinking_window_start: 2024,
        drinking_window_end: 2035,
        quantity_in_storage: 12,
        quantity_at_home: 0,
      })

      // Add wine to window
      await db.addWineToDeliveryWindow(window.id, wine.id, 6)

      // Verify wine was added
      const windowWines = await db.getDeliveryWindowWines(window.id)
      expect(windowWines.length).toBeGreaterThan(0)
      const windowWine = windowWines.find(w => w.wine_id === wine.id)
      expect(windowWine?.wine_id).toBe(wine.id)
      expect(windowWine?.quantity).toBe(6)
    })

    it('should retrieve wines in delivery window', async () => {
      // Create window and wines
      const window = await db.createDeliveryWindow({
        scheduled_date: '2026-05-15',
        locked: false,
        status: 'planned',
      })

      const wine1 = await db.createWine({
        name: 'Wine 1',
        vintage: 2020,
        tier: 1,
        region: 'Bordeaux',
        drinking_window_start: 2024,
        drinking_window_end: 2035,
        quantity_in_storage: 12,
        quantity_at_home: 0,
      })

      const wine2 = await db.createWine({
        name: 'Wine 2',
        vintage: 2021,
        tier: 2,
        region: 'Burgundy',
        drinking_window_start: 2024,
        drinking_window_end: 2030,
        quantity_in_storage: 6,
        quantity_at_home: 0,
      })

      // Add wines to window
      await db.addWineToDeliveryWindow(window.id, wine1.id, 6)
      await db.addWineToDeliveryWindow(window.id, wine2.id, 3)

      // Retrieve wines
      const windowWines = await db.getDeliveryWindowWines(window.id)
      expect(windowWines.length).toBe(2)
      expect(windowWines.map(w => w.wine_id)).toContain(wine1.id)
      expect(windowWines.map(w => w.wine_id)).toContain(wine2.id)
    })

    it('should update wine quantity in delivery window', async () => {
      // Create window and wine
      const window = await db.createDeliveryWindow({
        scheduled_date: '2026-05-15',
        locked: false,
        status: 'planned',
      })

      const wine = await db.createWine({
        name: 'Test Wine',
        vintage: 2020,
        tier: 1,
        region: 'Bordeaux',
        drinking_window_start: 2024,
        drinking_window_end: 2035,
        quantity_in_storage: 12,
        quantity_at_home: 0,
      })

      // Add wine
      await db.addWineToDeliveryWindow(window.id, wine.id, 6)

      // Update quantity
      await db.updateDeliveryWindowWine(window.id, wine.id, 3)

      // Verify update
      const updated = await db.getDeliveryWindowWines(window.id)
      expect(updated[0].quantity).toBe(3)
    })
  })
})
