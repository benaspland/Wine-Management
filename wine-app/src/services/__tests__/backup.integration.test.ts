/**
 * Backup & restore tests — the full-snapshot safety net for a database
 * that exists only on the user's device. A restore must round-trip
 * every table, and malformed files must be rejected before any data
 * is touched.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import * as db from '../database'
import * as workflows from '../workflows.service'

// Mock localStorage for tests (same pattern as the other integration suites)
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

async function seedRealisticState() {
  const wine = await db.createWine({
    name: 'Vina Tondonia',
    producer: 'R. Lopez de Heredia',
    vintage: 2010,
    tier: 3,
    region: 'Rioja',
    purchase_price: 32.5,
    drinking_window_start: 2020,
    drinking_window_end: 2040,
    quantity_in_storage: 6,
    quantity_at_home: 3,
  })

  const window = await db.createDeliveryWindow({
    scheduled_date: '2026-01-01',
    locked: true,
    status: 'completed',
  })
  await db.createDeliveryCompletion({
    wine_id: wine.id,
    delivery_window_id: window.id,
    quantity_delivered: 3,
    delivered_date: '2026-01-01',
    status: 'completed',
  })

  const today = new Date().toISOString().split('T')[0]
  await workflows.consumeWine(wine.id, today, 'Backup test dinner')

  return wine
}

beforeEach(async () => {
  localStorage.clear()
  await db.initializeDatabase()
})

describe('exportDatabase', () => {
  it('captures every table plus format metadata', async () => {
    await seedRealisticState()

    const backup = await db.exportDatabase()

    expect(backup.format).toBe('wine-app-backup')
    expect(backup.version).toBe(1)
    expect(backup.exported_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(backup.tables.wines).toHaveLength(1)
    expect(backup.tables.cellar_config).toHaveLength(1)
    expect(backup.tables.consumption_log).toHaveLength(1)
    expect(backup.tables.delivery_window).toHaveLength(1)
    expect(backup.tables.delivery_completion_log).toHaveLength(1)
    expect(Array.isArray(backup.tables.audit_log)).toBe(true)
  })
})

describe('restoreDatabase', () => {
  it('round-trips the full application state', async () => {
    const wine = await seedRealisticState()
    await db.updateCellarConfig({ max_home_capacity: 55 })
    const backup = await db.exportDatabase()
    // Serialize/parse like the real file download/upload path
    const fileContents = JSON.parse(JSON.stringify(backup)) as unknown

    // Wipe everything, then restore
    localStorage.clear()
    await db.initializeDatabase()
    expect(await db.getAllWines()).toHaveLength(0)

    await db.restoreDatabase(fileContents)

    const wines = await db.getAllWines()
    expect(wines).toHaveLength(1)
    expect(wines[0].id).toBe(wine.id)
    expect(wines[0].quantity_at_home).toBe(2) // 3 delivered, 1 consumed
    // New schema fields ride through the backup untouched
    expect(wines[0].purchase_price).toBe(32.5)

    expect((await db.getCellarConfig()).max_home_capacity).toBe(55)
    expect(await db.getConsumptionLogByWineId(wine.id)).toHaveLength(1)

    const windows = await db.getAllDeliveryWindows()
    expect(windows).toHaveLength(1)
    // Restore goes through the same normalization as startup
    expect(windows[0].locked).toBe(true)

    // The consume-before-delivery validation still works on restored data
    await expect(workflows.consumeWine(wine.id, '2025-12-01')).rejects.toThrow(
      /before delivery date/
    )
  })

  it('replaces existing data rather than merging', async () => {
    await seedRealisticState()
    const backup = await db.exportDatabase()

    await db.createWine({
      name: 'Post-Backup Wine',
      vintage: 2022,
      tier: 1,
      region: 'Rioja',
      drinking_window_start: 2024,
      drinking_window_end: 2030,
      quantity_in_storage: 2,
      quantity_at_home: 0,
    })
    expect(await db.getAllWines()).toHaveLength(2)

    await db.restoreDatabase(backup)

    const wines = await db.getAllWines()
    expect(wines).toHaveLength(1)
    expect(wines.some(w => w.name === 'Post-Backup Wine')).toBe(false)
  })

  it('rejects files without the backup marker, leaving data untouched', async () => {
    await seedRealisticState()

    await expect(db.restoreDatabase({ tables: { wines: [] } })).rejects.toThrow(
      /missing wine-app-backup marker/
    )
    await expect(db.restoreDatabase('not even an object')).rejects.toThrow(/not a JSON object/)
    await expect(db.restoreDatabase(null)).rejects.toThrow(/not a JSON object/)

    // Nothing was lost
    expect(await db.getAllWines()).toHaveLength(1)
  })

  it('rejects a backup whose tables are malformed', async () => {
    await seedRealisticState()

    await expect(
      db.restoreDatabase({
        format: 'wine-app-backup',
        version: 1,
        exported_at: 'x',
        tables: { wines: 'not-an-array' },
      })
    ).rejects.toThrow(/not an array/)

    await expect(
      db.restoreDatabase({
        format: 'wine-app-backup',
        version: 1,
        exported_at: 'x',
        tables: { cellar_config: [] },
      })
    ).rejects.toThrow(/missing wines table/)

    expect(await db.getAllWines()).toHaveLength(1)
  })
})
