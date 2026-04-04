/**
 * Integration Tests for DrinkingSchedulePage
 * Tests drinking schedule generation and wine consumption
 */

import { describe, it, expect, beforeEach } from 'vitest'
import * as db from '../../services/database'
import * as workflows from '../../services/workflows.service'
import { ScheduleService } from '../../services/schedule.service'

describe('DrinkingSchedulePage Integration Tests', () => {
  beforeEach(async () => {
    localStorage.clear()
    await db.initializeDatabase()
  })

  describe('Drinking Schedule Generation', () => {
    it('should generate drinking schedule for home wines', async () => {
      // Create wines at home
      const wine1 = await db.createWine({
        name: 'Ready Red',
        vintage: 2020,
        tier: 1,
        region: 'Bordeaux',
        drinking_window_start: 2024,
        drinking_window_end: 2030,
        quantity_in_storage: 0,
        quantity_at_home: 12,
      })

      const wine2 = await db.createWine({
        name: 'Ready White',
        vintage: 2022,
        tier: 2,
        region: 'Burgundy',
        drinking_window_start: 2024,
        drinking_window_end: 2032,
        quantity_in_storage: 0,
        quantity_at_home: 6,
      })

      // Generate drinking schedule
      const wines = await db.getAllWines()
      const schedule = ScheduleService.generateDrinkingSchedule(wines, undefined, new Date().getFullYear(), 3)

      // Verify schedule includes home wines
      expect(schedule.length).toBeGreaterThan(0)
      const wineIds = schedule.map(s => s.wineId)
      expect(wineIds).toContain(wine1.id)
      expect(wineIds).toContain(wine2.id)
    })

    it('should respect drinking window constraints', async () => {
      // Create wine outside drinking window
      const wine = await db.createWine({
        name: 'Future Wine',
        vintage: 2024,
        tier: 3,
        region: 'Bordeaux',
        drinking_window_start: 2030,
        drinking_window_end: 2050,
        quantity_in_storage: 0,
        quantity_at_home: 12,
      })

      // Generate schedule
      const wines = await db.getAllWines()
      const schedule = ScheduleService.generateDrinkingSchedule(wines, undefined, new Date().getFullYear(), 3)

      // Wine should not be scheduled before drinking window
      const scheduledWineIds = schedule.map(s => s.wineId)
      expect(scheduledWineIds).not.toContain(wine.id)
    })

    it('should distribute wines across years', async () => {
      // Create 30+ wines to test multi-year distribution
      const wines: any[] = []
      for (let i = 0; i < 35; i++) {
        wines.push(
          await db.createWine({
            name: `Wine ${i}`,
            vintage: 2010 + (i % 10),
            tier: ((i % 5) + 1) as any,
            region: `Region ${i % 5}`,
            drinking_window_start: 2024,
            drinking_window_end: 2050,
            quantity_in_storage: 0,
            quantity_at_home: 1,
          })
        )
      }

      // Generate schedule for 3 years
      const schedule = ScheduleService.generateDrinkingSchedule(wines, undefined, new Date().getFullYear(), 3)

      // Should have entries across multiple years
      const years = new Set(schedule.map(s => s.suggestedYear))
      expect(years.size).toBeGreaterThan(1)

      // Should have reasonable distribution
      expect(schedule.length).toBeGreaterThan(30)
    })

    it('should apply tier-based spacing for premium wines', async () => {
      // Create tier 4 (premium) wine
      const wine = await db.createWine({
        name: 'Premium Wine',
        vintage: 2015,
        tier: 4,
        region: 'Bordeaux',
        drinking_window_start: 2024,
        drinking_window_end: 2050,
        quantity_in_storage: 0,
        quantity_at_home: 3,
      })

      // Generate schedule
      const wines = await db.getAllWines()
      const schedule = ScheduleService.generateDrinkingSchedule(wines, undefined, new Date().getFullYear(), 5)

      // Premium wine should appear max once per year
      const byYear: Record<number, number> = {}
      for (const entry of schedule) {
        if (entry.wineId === wine.id) {
          byYear[entry.suggestedYear] = (byYear[entry.suggestedYear] || 0) + 1
        }
      }

      // Check that no year has more than allowed
      for (const count of Object.values(byYear)) {
        expect(count).toBeLessThanOrEqual(1)
      }
    })
  })

  describe('Consumption Tracking', () => {
    it('should track consumed wines', async () => {
      // Create wine
      const wine = await db.createWine({
        name: 'Consumable Wine',
        vintage: 2020,
        tier: 1,
        region: 'Bordeaux',
        drinking_window_start: 2024,
        drinking_window_end: 2030,
        quantity_in_storage: 0,
        quantity_at_home: 12,
      })

      // Consume wine
      const today = new Date().toISOString().split('T')[0]
      const log = await db.createConsumptionEntry({
        wine_id: wine.id,
        consumed_date: today,
        notes: 'Test consumption',
      })

      expect(log.id).toBeDefined()
      expect(log.wine_id).toBe(wine.id)
      expect(log.consumed_date).toBe(today)
    })

    it('should retrieve consumption logs by wine', async () => {
      // Create wine
      const wine = await db.createWine({
        name: 'Consumable Wine',
        vintage: 2020,
        tier: 1,
        region: 'Bordeaux',
        drinking_window_start: 2024,
        drinking_window_end: 2030,
        quantity_in_storage: 0,
        quantity_at_home: 12,
      })

      // Create multiple consumption logs
      const today = new Date().toISOString().split('T')[0]
      await db.createConsumptionEntry({
        wine_id: wine.id,
        consumed_date: today,
        notes: 'First bottle',
      })
      await db.createConsumptionEntry({
        wine_id: wine.id,
        consumed_date: today,
        notes: 'Second bottle',
      })

      // Retrieve logs
      const logs = await db.getConsumptionLogByWineId(wine.id)
      expect(logs.length).toBe(2)
      expect(logs.every(l => l.wine_id === wine.id)).toBe(true)
    })

    it('should retrieve consumption logs by year', async () => {
      // Create wines
      const wine1 = await db.createWine({
        name: 'Wine 1',
        vintage: 2020,
        tier: 1,
        region: 'Bordeaux',
        drinking_window_start: 2024,
        drinking_window_end: 2030,
        quantity_in_storage: 0,
        quantity_at_home: 12,
      })

      const wine2 = await db.createWine({
        name: 'Wine 2',
        vintage: 2021,
        tier: 1,
        region: 'Burgundy',
        drinking_window_start: 2024,
        drinking_window_end: 2030,
        quantity_in_storage: 0,
        quantity_at_home: 12,
      })

      // Create consumption logs
      const today = new Date()
      const thisYear = today.getFullYear()
      const thisYearDate = `${thisYear}-01-15`

      await db.createConsumptionEntry({
        wine_id: wine1.id,
        consumed_date: thisYearDate,
        notes: 'This year',
      })

      await db.createConsumptionEntry({
        wine_id: wine2.id,
        consumed_date: thisYearDate,
        notes: 'This year',
      })

      // Retrieve by year
      const logs = await db.getConsumptionLogByYear(thisYear)
      expect(logs.length).toBeGreaterThanOrEqual(2)
      expect(logs.map(l => l.wine_id)).toContain(wine1.id)
      expect(logs.map(l => l.wine_id)).toContain(wine2.id)
    })
  })

  describe('Wine Consumption Workflow', () => {
    it('should consume wine through workflow', async () => {
      // Create wine at home
      const wine = await db.createWine({
        name: 'Drinkable Wine',
        vintage: 2020,
        tier: 1,
        region: 'Bordeaux',
        drinking_window_start: 2024,
        drinking_window_end: 2030,
        quantity_in_storage: 0,
        quantity_at_home: 12,
      })

      // Consume through workflow
      const today = new Date().toISOString().split('T')[0]
      await workflows.consumeWine(wine.id, today, 'Workflow test')

      // Verify consumption logged
      const logs = await db.getConsumptionLogByWineId(wine.id)
      expect(logs.length).toBeGreaterThan(0)
      expect(logs[0].consumed_date).toBe(today)
    })

    it('should reject consumption before delivery window', async () => {
      // Create wine in storage
      const wine = await db.createWine({
        name: 'Stored Wine',
        vintage: 2020,
        tier: 1,
        region: 'Bordeaux',
        drinking_window_start: 2024,
        drinking_window_end: 2030,
        quantity_in_storage: 12,
        quantity_at_home: 0,
      })

      // Try to consume from storage
      const today = new Date().toISOString().split('T')[0]
      try {
        await workflows.consumeWine(wine.id, today)
        expect(true).toBe(false) // Should have thrown
      } catch (error) {
        expect((error as Error).message).toContain('No bottles at home')
      }
    })

    it('should decrement wine quantity on consumption', async () => {
      // Create wine at home
      const wine = await db.createWine({
        name: 'Consumable Wine',
        vintage: 2020,
        tier: 1,
        region: 'Bordeaux',
        drinking_window_start: 2024,
        drinking_window_end: 2030,
        quantity_in_storage: 0,
        quantity_at_home: 5,
      })

      const before = await db.getWineById(wine.id)
      expect(before?.quantity_at_home).toBe(5)

      // Consume
      const today = new Date().toISOString().split('T')[0]
      await workflows.consumeWine(wine.id, today)

      // Verify decreased
      const after = await db.getWineById(wine.id)
      expect(after?.quantity_at_home).toBe(4)
    })
  })
})
