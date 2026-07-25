import { test, expect } from '@playwright/test'

/**
 * The core inventory journey: add a wine through the form, verify it
 * survives a reload via IndexedDB, open its detail panel, and delete it.
 */

test('add a wine, persist it across reload, then delete it', async ({ page }) => {
  // The Overview dashboard is the landing page; the collection lives at /cellar
  await page.goto('/')
  await expect(page.getByText('Cellar Overview').first()).toBeVisible()

  await page.goto('/cellar')
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

  // Open the detail panel and delete the wine. Deleting is irreversible,
  // so it takes a confirmation dialog and then a deliberate press-and-hold
  // — a plain tap on the confirm button is refused.
  await page.getByText('Smoke Cuvée').first().click()
  await page.locator('button:has-text("Delete")').first().click()
  await expect(page.getByText('Delete Château Test Smoke Cuvée 2018?')).toBeVisible()

  const confirmDelete = page.getByLabel('Delete', { exact: true })
  await confirmDelete.click()
  await expect(page.getByText('Keep holding to confirm')).toBeVisible()
  await expect(page.getByText('Smoke Cuvée').first()).toBeVisible()

  const box = (await confirmDelete.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(1200)
  await page.mouse.up()
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
  await expect(page.getByText('Upcoming Deliveries').first()).toBeVisible()

  await page.goto('/schedule')
  await expect(page.getByText('Drinking Schedule').first()).toBeVisible()
})
