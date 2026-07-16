import { test, expect } from '@playwright/test'

/**
 * The core inventory journey: add a wine through the form, verify it
 * survives a reload via IndexedDB, open its detail panel, and delete it.
 */

test('add a wine, persist it across reload, then delete it', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Private Collection').first()).toBeVisible()

  // Add a wine via the form
  await page.getByText('Add Wine').first().click()
  await page.fill('input[name="producer"]', 'Château Test')
  await page.fill('input[name="name"]', 'Smoke Cuvée')
  await page.fill('input[name="vintage"]', '2018')
  await page.fill('input[name="region"]', 'Bordeaux')
  await page.fill('input[name="country"]', 'France')
  await page.fill('input[name="quantity"]', '6')
  await page.locator('button:has-text("Save Wine")').click()
  await expect(page.getByText('Smoke Cuvée').first()).toBeVisible()

  // Data must survive a reload (IndexedDB persistence)
  await page.reload()
  await expect(page.getByText('Smoke Cuvée').first()).toBeVisible({ timeout: 15_000 })

  // IndexedDB is the store actually in use, not a localStorage fallback
  const idbExists = await page.evaluate(async () => {
    const dbs = await indexedDB.databases()
    return dbs.some((d) => d.name === 'wine-app')
  })
  expect(idbExists).toBe(true)

  // Open the detail panel and delete the wine
  page.on('dialog', (dialog) => void dialog.accept())
  await page.getByText('Smoke Cuvée').first().click()
  await page.locator('button:has-text("Delete")').first().click()
  await expect(page.getByText('Smoke Cuvée')).toHaveCount(0)

  // Deletion also persists (domcontentloaded: blocked third-party requests
  // must not stall the assertion, which only needs the DOM)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Private Collection').first()).toBeVisible()
  await expect(page.getByText('Smoke Cuvée')).toHaveCount(0)
})

test('delivery and drinking schedule pages render', async ({ page }) => {
  await page.goto('/deliveries')
  await expect(page.getByText('Delivery Schedule').first()).toBeVisible()
  await expect(page.getByText('Home Cellar Capacity').first()).toBeVisible()

  await page.goto('/schedule')
  await expect(page.getByText('Drinking Schedule').first()).toBeVisible()
})
