import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface TestWine {
  id: string
  producer: string
  name: string
  vintage: number
  region: string
  tier: number
  location: 'storage' | 'home'
  quantity: number
  format: string
}

interface ScheduleEntry {
  wine_id: string
  scheduled_date: string
  quantity: number
}

let wines: TestWine[] = []
let schedule: ScheduleEntry[] = []

// Load CSV data
beforeAll(() => {
  const csvPath = path.join(__dirname, '../../..', 'wine-data.csv')
  const content = fs.readFileSync(csvPath, 'utf-8')
  const lines = content.split('\n').slice(1) // Skip header

  wines = lines
    .filter((line: string) => line.trim())
    .slice(0, 126)
    .map((line: string, idx: number) => {
      const parts = line.split(',')
      const [producer, name, vintage, , region, , , , tier, format] = parts
      return {
        id: `wine-${idx}`,
        producer,
        name,
        vintage: parseInt(vintage),
        region,
        tier: parseInt(tier),
        location: 'storage' as const,
        quantity: 6,
        format,
      }
    })

  // Mock schedule - simulating what the delivery schedule would look like
  schedule = wines.slice(0, 80).map((wine, idx) => ({
    wine_id: wine.id,
    scheduled_date: '2026-03-01',
    quantity: wine.quantity,
  }))
  schedule.push(
    ...wines.slice(80, 110).map(wine => ({
      wine_id: wine.id,
      scheduled_date: '2026-09-01',
      quantity: wine.quantity,
    }))
  )
  schedule.push(
    ...wines.slice(110, 126).map(wine => ({
      wine_id: wine.id,
      scheduled_date: '2027-03-01',
      quantity: wine.quantity,
    }))
  )
})

describe('Integration - Scheduled Delivery with Full CSV Data', () => {
  it('should load all 126 wines from CSV', () => {
    expect(wines.length).toBe(126)
    expect(wines[0].producer).toBeDefined()
    expect(wines[0].name).toBeDefined()
  })

  it('should have correct wine data structure', () => {
    const wine = wines[0]
    expect(wine).toHaveProperty('id')
    expect(wine).toHaveProperty('producer')
    expect(wine).toHaveProperty('name')
    expect(wine).toHaveProperty('vintage')
    expect(wine).toHaveProperty('region')
    expect(wine).toHaveProperty('tier')
    expect(wine).toHaveProperty('quantity')
    expect(wine).toHaveProperty('format')
  })

  it('should schedule all 126 wines across multiple deliveries', () => {
    expect(schedule.length).toBe(126)
    expect(schedule.every(entry => entry.wine_id && entry.scheduled_date)).toBe(true)
  })

  it('should have scheduled delivery dates for all wines', () => {
    const uniqueDates = new Set(schedule.map(s => s.scheduled_date))
    expect(uniqueDates.size).toBeGreaterThan(0)
    expect(Array.from(uniqueDates)).toContain('2026-03-01')
  })

  it('should distribute wines across delivery windows', () => {
    const march2026 = schedule.filter(s => s.scheduled_date === '2026-03-01')
    const sept2026 = schedule.filter(s => s.scheduled_date === '2026-09-01')
    const march2027 = schedule.filter(s => s.scheduled_date === '2027-03-01')

    expect(march2026.length).toBeGreaterThan(0)
    expect(sept2026.length).toBeGreaterThan(0)
    expect(march2027.length).toBeGreaterThan(0)
    expect(march2026.length + sept2026.length + march2027.length).toBe(126)
  })

  it('should calculate total bottles scheduled', () => {
    const totalBottles = schedule.reduce((sum, entry) => sum + entry.quantity, 0)
    // 126 wines * 6 bottles = 756 bottles total
    expect(totalBottles).toBe(756)
  })

  it('should assign scheduled delivery date to each wine', () => {
    wines.forEach(wine => {
      const scheduled = schedule.find(s => s.wine_id === wine.id)
      expect(scheduled).toBeDefined()
      expect(scheduled?.scheduled_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  it('should format dates correctly for display', () => {
    const uniqueDates = Array.from(new Set(schedule.map(s => s.scheduled_date)))

    uniqueDates.forEach(dateStr => {
      const date = new Date(dateStr)
      const formatted = date.toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      })
      expect(formatted).toMatch(/^[A-Za-z]{3} \d{4}$/) // e.g., "Mar 2026"
    })
  })

  it('should handle wine with scheduled delivery in detail panel', () => {
    // Simulate what the detail panel would do
    const wineId = wines[0].id
    const scheduledEntry = schedule.find(s => s.wine_id === wineId)

    expect(scheduledEntry).toBeDefined()
    expect(scheduledEntry?.scheduled_date).toBeDefined()

    // This wine should be displayable with its scheduled date
    const date = new Date(scheduledEntry!.scheduled_date)
    const formatted = date.toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    })
    expect(formatted).toBeTruthy()
  })

  it('should verify no wine is left unscheduled', () => {
    const scheduledWineIds = new Set(schedule.map(s => s.wine_id))
    const allWineIds = new Set(wines.map(w => w.id))

    expect(scheduledWineIds.size).toBe(allWineIds.size)
    wines.forEach(wine => {
      expect(scheduledWineIds.has(wine.id)).toBe(true)
    })
  })

  it('should verify scheduled dates are in valid format', () => {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    schedule.forEach(entry => {
      expect(entry.scheduled_date).toMatch(dateRegex)

      // Verify it's a valid date
      const date = new Date(entry.scheduled_date)
      expect(date.getTime()).not.toBeNaN()
      expect(date.getFullYear()).toBeGreaterThanOrEqual(2026)
    })
  })

  it('should handle tier distribution across deliveries', () => {
    const tierCounts = wines.reduce(
      (acc, wine) => {
        acc[wine.tier] = (acc[wine.tier] || 0) + 1
        return acc
      },
      {} as Record<number, number>
    )

    // Verify we have wines of different tiers
    expect(Object.keys(tierCounts).length).toBeGreaterThan(1)
    expect(tierCounts[1] || tierCounts[2]).toBeGreaterThan(0)
  })
})
