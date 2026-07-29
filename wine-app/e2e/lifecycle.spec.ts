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

/**
 * The delete confirmation opens from inside the detail panel. On a phone
 * that panel is full-width, so a dialog at the same stacking level is
 * buried by it entirely and the confirm button cannot be pressed — the
 * delete silently did nothing on a device while passing at desktop
 * width, where the 480px panel leaves the dialog reachable. Hence the
 * explicit narrow viewport.
 */
test('delete works at phone width, where the panel is full-screen', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 })

  await page.goto('/cellar')
  await page.getByText('Add Wine').first().click()
  await page.fill('input[name="producer"]', 'Chateau Phone')
  await page.fill('input[name="vintage"]', '2020')
  await page.fill('input[name="region"]', 'Bordeaux')
  await page.fill('input[name="quantity"]', '3')
  await page.locator('button:has-text("Save Wine")').click()
  await expect(page.getByText('Chateau Phone').first()).toBeVisible()

  await page.getByText('Chateau Phone').first().click()
  await page.locator('aside button:has-text("Delete")').click()
  await expect(page.getByText('Delete Chateau Phone 2020?')).toBeVisible()

  const confirm = page.getByLabel('Delete', { exact: true })
  // The confirm button must be the topmost element at its own centre;
  // a hold aimed there would otherwise land on the panel behind it
  const reachable = await confirm.evaluate(button => {
    const box = button.getBoundingClientRect()
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
    return button === top || button.contains(top as Node)
  })
  expect(reachable).toBe(true)

  const box = (await confirm.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(1200)
  await page.mouse.up()

  await expect(page.getByText('Chateau Phone')).toHaveCount(0)
})
