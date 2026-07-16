import { test, expect } from '@playwright/test'

/**
 * One-time migration: data written by the old localStorage layer must be
 * picked up into IndexedDB on first launch after the upgrade. This is
 * the "did I just lose my cellar" path for existing installs.
 */

const now = '2026-01-01T00:00:00.000Z'

function legacyWine(id: string, name: string, producer: string) {
  return {
    id,
    name,
    producer,
    vintage: 2019,
    tier: 3,
    region: 'Rioja',
    country: 'Spain',
    wine_type: 'Red',
    drinking_window_start: 2024,
    drinking_window_end: 2035,
    quantity_in_storage: 6,
    quantity_at_home: 0,
    created_at: now,
    updated_at: now,
  }
}

const LEGACY_SNAPSHOT = {
  wines: [
    legacyWine('legacy-1', 'Legacy Uno', 'Bodega Uno'),
    legacyWine('legacy-2', 'Legacy Due', 'Bodega Due'),
  ],
  cellar_config: [
    {
      id: 1,
      max_home_capacity: 60,
      annual_consumption_target: 30,
      min_delivery_bottles: 24,
      created_at: now,
      updated_at: now,
    },
  ],
  consumption_log: [],
  // The legacy SQL-string layer persisted booleans as 0/1
  delivery_window: [{ id: 'win-1', scheduled_date: '2026-09-01', locked: 1 }],
  delivery_window_wines: [],
  delivery_completion_log: [],
  audit_log: [],
}

test('migrates a legacy localStorage snapshot into IndexedDB on first launch', async ({
  page,
}) => {
  await page.addInitScript((snapshot) => {
    window.localStorage.setItem('wine-app-db', JSON.stringify(snapshot))
  }, LEGACY_SNAPSHOT)

  await page.goto('/')

  // Legacy wines render immediately
  await expect(page.getByText('Legacy Uno').first()).toBeVisible()
  await expect(page.getByText('Legacy Due').first()).toBeVisible()

  // The data now lives in IndexedDB, with legacy 0/1 booleans normalized
  const snapshot = await page.evaluate(
    () =>
      new Promise<Record<string, Array<Record<string, unknown>>>>((resolve, reject) => {
        const request = indexedDB.open('wine-app')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const get = db.transaction('tables', 'readonly').objectStore('tables').get('db')
          get.onerror = () => reject(get.error)
          get.onsuccess = () => resolve(get.result)
        }
      })
  )

  expect(snapshot.wines.map((w) => w.name).sort()).toEqual(['Legacy Due', 'Legacy Uno'])
  expect(snapshot.cellar_config[0].max_home_capacity).toBe(60)
  expect(snapshot.delivery_window[0].locked).toBe(true)
})
