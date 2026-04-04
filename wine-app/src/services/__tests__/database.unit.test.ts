/**
 * Unit Tests for Database Layer
 * Tests all database operations in isolation using in-memory storage
 */

import { describe, it, expect, beforeEach } from 'vitest'
import * as db from '../database'
import type { Wine, CellarConfig, DeliveryWindow } from '../../types/index'

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

describe('Database Layer - Unit Tests', () => {
  beforeEach(async () => {
    localStorage.clear()
    // Re-initialize database for each test
    await db.initializeDatabase()
  })

  // =========================================================================
  // WINE OPERATIONS
  // =========================================================================

  describe('Wine Operations', () => {
    it('should create a wine record', async () => {
      const wineData = {
        name: 'Château Margaux',
        vintage: 2015,
        tier: 1 as const,
        region: 'Bordeaux',
        producer: 'Château Margaux',
        drinking_window_start: 2020,
        drinking_window_end: 2045,
        quantity_in_storage: 12,
        quantity_at_home: 0,
      }

      const wine = await db.createWine(wineData)

      expect(wine).toBeDefined()
      expect(wine.id).toBeDefined()
      expect(wine.name).toBe('Château Margaux')
      expect(wine.vintage).toBe(2015)
      expect(wine.tier).toBe(1)
      expect(wine.created_at).toBeDefined()
    })

    it('should retrieve a wine by ID', async () => {
      const wineData = {
        name: 'Test Wine',
        vintage: 2020,
        tier: 2 as const,
        region: 'Napa Valley',
        drinking_window_start: 2025,
        drinking_window_end: 2035,
        quantity_in_storage: 6,
        quantity_at_home: 3,
      }

      const created = await db.createWine(wineData)
      const retrieved = await db.getWineById(created.id)

      expect(retrieved).toBeDefined()
      expect(retrieved?.name).toBe('Test Wine')
      expect(retrieved?.quantity_in_storage).toBe(6)
      expect(retrieved?.quantity_at_home).toBe(3)
    })

    it('should retrieve all wines', async () => {
      const wines = [
        {
          name: 'Wine 1',
          vintage: 2020,
          tier: 1 as const,
          region: 'Region 1',
          drinking_window_start: 2025,
          drinking_window_end: 2035,
          quantity_in_storage: 10,
          quantity_at_home: 5,
        },
        {
          name: 'Wine 2',
          vintage: 2019,
          tier: 2 as const,
          region: 'Region 2',
          drinking_window_start: 2024,
          drinking_window_end: 2034,
          quantity_in_storage: 8,
          quantity_at_home: 2,
        },
      ]

      for (const wineData of wines) {
        await db.createWine(wineData)
      }

      const allWines = await db.getAllWines()

      expect(allWines.length).toBe(2)
      expect(allWines[0].name).toBe('Wine 1')
      expect(allWines[1].name).toBe('Wine 2')
    })

    it('should update a wine', async () => {
      const wine = await db.createWine({
        name: 'Original Name',
        vintage: 2020,
        tier: 1 as const,
        region: 'Original Region',
        drinking_window_start: 2025,
        drinking_window_end: 2035,
        quantity_in_storage: 10,
        quantity_at_home: 5,
      })

      await db.updateWine(wine.id, {
        name: 'Updated Name',
        quantity_in_storage: 8,
      })

      const updated = await db.getWineById(wine.id)

      expect(updated?.name).toBe('Updated Name')
      expect(updated?.quantity_in_storage).toBe(8)
      expect(updated?.quantity_at_home).toBe(5) // unchanged
    })

    it('should delete a wine', async () => {
      const wine = await db.createWine({
        name: 'Delete Me',
        vintage: 2020,
        tier: 1 as const,
        region: 'Test',
        drinking_window_start: 2025,
        drinking_window_end: 2035,
        quantity_in_storage: 10,
        quantity_at_home: 0,
      })

      await db.deleteWine(wine.id)
      const deleted = await db.getWineById(wine.id)

      expect(deleted).toBeNull()
    })
  })

  // =========================================================================
  // CELLAR CONFIG OPERATIONS
  // =========================================================================

  describe('Cellar Config Operations', () => {
    it('should get default cellar config', async () => {
      const config = await db.getCellarConfig()

      expect(config).toBeDefined()
      expect(config.id).toBe(1)
      expect(config.max_home_capacity).toBe(80)
      expect(config.annual_consumption_target).toBe(30)
    })

    it('should update cellar config', async () => {
      await db.updateCellarConfig({
        max_home_capacity: 100,
        annual_consumption_target: 45,
      })

      const updated = await db.getCellarConfig()

      expect(updated.max_home_capacity).toBe(100)
      expect(updated.annual_consumption_target).toBe(45)
    })

    it('should only allow single config record', async () => {
      const config1 = await db.getCellarConfig()
      expect(config1.id).toBe(1)

      await db.updateCellarConfig({ max_home_capacity: 120 })
      const config2 = await db.getCellarConfig()

      expect(config2.id).toBe(1)
      expect(config2.max_home_capacity).toBe(120)
    })
  })

  // =========================================================================
  // CONSUMPTION LOG OPERATIONS
  // =========================================================================

  describe('Consumption Log Operations', () => {
    it('should create consumption log entry', async () => {
      const wine = await db.createWine({
        name: 'Test Wine',
        vintage: 2020,
        tier: 1 as const,
        region: 'Test',
        drinking_window_start: 2025,
        drinking_window_end: 2035,
        quantity_in_storage: 10,
        quantity_at_home: 5,
      })

      const entry = await db.createConsumptionEntry({
        wine_id: wine.id,
        consumed_date: '2026-04-04',
        notes: 'Dinner',
      })

      expect(entry.id).toBeDefined()
      expect(entry.wine_id).toBe(wine.id)
      expect(entry.consumed_date).toBe('2026-04-04')
      expect(entry.notes).toBe('Dinner')
    })

    it('should retrieve consumption log by wine ID', async () => {
      const wine = await db.createWine({
        name: 'Test Wine',
        vintage: 2020,
        tier: 1 as const,
        region: 'Test',
        drinking_window_start: 2025,
        drinking_window_end: 2035,
        quantity_in_storage: 10,
        quantity_at_home: 5,
      })

      await db.createConsumptionEntry({
        wine_id: wine.id,
        consumed_date: '2026-04-01',
      })

      await db.createConsumptionEntry({
        wine_id: wine.id,
        consumed_date: '2026-04-04',
      })

      const log = await db.getConsumptionLogByWineId(wine.id)

      expect(log.length).toBe(2)
      expect(log[0].wine_id).toBe(wine.id)
    })

    it('should retrieve consumption log by year', async () => {
      const wine = await db.createWine({
        name: 'Test Wine',
        vintage: 2020,
        tier: 1 as const,
        region: 'Test',
        drinking_window_start: 2025,
        drinking_window_end: 2035,
        quantity_in_storage: 10,
        quantity_at_home: 5,
      })

      await db.createConsumptionEntry({
        wine_id: wine.id,
        consumed_date: '2026-04-04',
      })

      const log = await db.getConsumptionLogByYear(2026)

      expect(log.length).toBeGreaterThan(0)
      expect(log[0].wine_id).toBe(wine.id)
    })
  })

  // =========================================================================
  // DELIVERY WINDOW OPERATIONS
  // =========================================================================

  describe('Delivery Window Operations', () => {
    it('should create delivery window', async () => {
      const window = await db.createDeliveryWindow({
        scheduled_date: '2026-05-04',
        locked: false,
        status: 'planned',
      })

      expect(window.id).toBeDefined()
      expect(window.scheduled_date).toBe('2026-05-04')
      expect(window.locked).toBe(false)
      expect(window.status).toBe('planned')
    })

    it('should retrieve delivery window by ID', async () => {
      const created = await db.createDeliveryWindow({
        scheduled_date: '2026-05-04',
        locked: false,
        status: 'planned',
      })

      const retrieved = await db.getDeliveryWindowById(created.id)

      expect(retrieved).toBeDefined()
      expect(retrieved?.scheduled_date).toBe('2026-05-04')
    })

    it('should get current delivery window', async () => {
      await db.createDeliveryWindow({
        scheduled_date: '2026-05-04',
        locked: false,
        status: 'completed',
      })

      const current = await db.createDeliveryWindow({
        scheduled_date: '2026-06-04',
        locked: false,
        status: 'planned',
      })

      const retrieved = await db.getCurrentDeliveryWindow()

      expect(retrieved?.id).toBe(current.id)
      expect(retrieved?.status).toBe('planned')
    })

    it('should update delivery window', async () => {
      const window = await db.createDeliveryWindow({
        scheduled_date: '2026-05-04',
        locked: false,
        status: 'planned',
      })

      await db.updateDeliveryWindow(window.id, { locked: true, status: 'in_transit' })

      const updated = await db.getDeliveryWindowById(window.id)

      expect(updated?.locked).toBe(true)
      expect(updated?.status).toBe('in_transit')
    })
  })

  // =========================================================================
  // DELIVERY WINDOW WINES OPERATIONS
  // =========================================================================

  describe('Delivery Window Wines Operations', () => {
    it('should add wine to delivery window', async () => {
      const wine = await db.createWine({
        name: 'Test Wine',
        vintage: 2020,
        tier: 1 as const,
        region: 'Test',
        drinking_window_start: 2025,
        drinking_window_end: 2035,
        quantity_in_storage: 10,
        quantity_at_home: 0,
      })

      const window = await db.createDeliveryWindow({
        scheduled_date: '2026-05-04',
        locked: true,
        status: 'planned',
      })

      const windowWine = await db.addWineToDeliveryWindow(window.id, wine.id, 5)

      expect(windowWine.id).toBeDefined()
      expect(windowWine.delivery_window_id).toBe(window.id)
      expect(windowWine.wine_id).toBe(wine.id)
      expect(windowWine.quantity).toBe(5)
      expect(windowWine.status).toBe('pending')
    })

    it('should get delivery window wines', async () => {
      const wine1 = await db.createWine({
        name: 'Wine 1',
        vintage: 2020,
        tier: 1 as const,
        region: 'Test',
        drinking_window_start: 2025,
        drinking_window_end: 2035,
        quantity_in_storage: 10,
        quantity_at_home: 0,
      })

      const wine2 = await db.createWine({
        name: 'Wine 2',
        vintage: 2021,
        tier: 2 as const,
        region: 'Test',
        drinking_window_start: 2024,
        drinking_window_end: 2034,
        quantity_in_storage: 8,
        quantity_at_home: 0,
      })

      const window = await db.createDeliveryWindow({
        scheduled_date: '2026-05-04',
        locked: true,
        status: 'planned',
      })

      await db.addWineToDeliveryWindow(window.id, wine1.id, 5)
      await db.addWineToDeliveryWindow(window.id, wine2.id, 3)

      const wines = await db.getDeliveryWindowWines(window.id)

      expect(wines.length).toBe(2)
      expect(wines[0].wine_id).toBe(wine1.id)
      expect(wines[1].wine_id).toBe(wine2.id)
    })

    it('should remove wine from delivery window', async () => {
      const wine = await db.createWine({
        name: 'Test Wine',
        vintage: 2020,
        tier: 1 as const,
        region: 'Test',
        drinking_window_start: 2025,
        drinking_window_end: 2035,
        quantity_in_storage: 10,
        quantity_at_home: 0,
      })

      const window = await db.createDeliveryWindow({
        scheduled_date: '2026-05-04',
        locked: true,
        status: 'planned',
      })

      await db.addWineToDeliveryWindow(window.id, wine.id, 5)
      await db.removeWineFromDeliveryWindow(window.id, wine.id)

      const wines = await db.getDeliveryWindowWines(window.id)

      expect(wines.length).toBe(0)
    })
  })

  // =========================================================================
  // DELIVERY COMPLETION LOG OPERATIONS
  // =========================================================================

  describe('Delivery Completion Log Operations', () => {
    it('should create delivery completion log entry', async () => {
      const wine = await db.createWine({
        name: 'Test Wine',
        vintage: 2020,
        tier: 1 as const,
        region: 'Test',
        drinking_window_start: 2025,
        drinking_window_end: 2035,
        quantity_in_storage: 10,
        quantity_at_home: 0,
      })

      const window = await db.createDeliveryWindow({
        scheduled_date: '2026-05-04',
        locked: false,
        status: 'planned',
      })

      const completion = await db.createDeliveryCompletion({
        wine_id: wine.id,
        delivery_window_id: window.id,
        quantity_delivered: 5,
        delivered_date: '2026-05-04',
        status: 'delivered',
      })

      expect(completion.id).toBeDefined()
      expect(completion.wine_id).toBe(wine.id)
      expect(completion.quantity_delivered).toBe(5)
      expect(completion.status).toBe('delivered')
    })

    it('should get first delivery date for wine', async () => {
      const wine = await db.createWine({
        name: 'Test Wine',
        vintage: 2020,
        tier: 1 as const,
        region: 'Test',
        drinking_window_start: 2025,
        drinking_window_end: 2035,
        quantity_in_storage: 10,
        quantity_at_home: 0,
      })

      const window = await db.createDeliveryWindow({
        scheduled_date: '2026-05-04',
        locked: false,
        status: 'planned',
      })

      await db.createDeliveryCompletion({
        wine_id: wine.id,
        delivery_window_id: window.id,
        quantity_delivered: 5,
        delivered_date: '2026-05-04',
        status: 'delivered',
      })

      const firstDate = await db.getFirstDeliveryDateForWine(wine.id)

      expect(firstDate).toBe('2026-05-04')
    })
  })

  // =========================================================================
  // AUDIT LOG OPERATIONS
  // =========================================================================

  describe('Audit Log Operations', () => {
    it('should create audit log entry', async () => {
      const entry = await db.createAuditLog({
        action: 'test_action',
        details: { test: 'data' },
      })

      expect(entry.id).toBeDefined()
      expect(entry.action).toBe('test_action')
      expect(entry.details.test).toBe('data')
    })

    it('should retrieve audit log with details JSON parsing', async () => {
      await db.createAuditLog({
        action: 'edit_wine_details',
        wine_id: 'test-wine-id',
        details: { field: 'name', old: 'Old', new: 'New' },
      })

      const logs = await db.getAuditLog(10)

      expect(logs.length).toBeGreaterThan(0)
      expect(logs[0].action).toBe('edit_wine_details')
      expect(logs[0].details.field).toBe('name')
    })
  })
})
