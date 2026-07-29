import { test, expect, type Page } from '@playwright/test'

const BASE = '/Wine-Management'

/** Same-origin requests that 404 mean a broken base path — fail loudly. */
function watchForAssetErrors(page: Page): string[] {
  const failures: string[] = []
  page.on('response', (response) => {
    const url = response.url()
    if (url.includes('localhost:4173') && response.status() === 404) {
      failures.push(`${response.status()} ${url}`)
    }
  })
  return failures
}

test('boots, persists, and loads every asset under the subpath', async ({ page }) => {
  const assetFailures = watchForAssetErrors(page)

  await page.goto(`${BASE}/`)
  await expect(page.getByText('Cellar Overview').first()).toBeVisible({ timeout: 15_000 })

  // Add a wine and verify IndexedDB persistence in the production build
  await page.goto(`${BASE}/cellar`)
  await expect(page.getByText('Private Collection').first()).toBeVisible()
  await page.getByText('Add Wine').first().click()
  // Not a château: see the note in e2e/lifecycle.spec.ts
  await page.fill('input[name="producer"]', 'Prod Estate')
  await page.fill('input[name="name"]', 'Base Path Cuvée')
  await page.fill('input[name="region"]', 'Rioja')
  await page.fill('input[name="quantity"]', '3')
  await page.locator('button:has-text("Save Wine")').click()
  await expect(page.getByText('Base Path Cuvée').first()).toBeVisible()

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Base Path Cuvée').first()).toBeVisible({ timeout: 15_000 })

  expect(assetFailures).toEqual([])
})

test('client-side routes work and survive a reload under the subpath', async ({ page }) => {
  const assetFailures = watchForAssetErrors(page)

  await page.goto(`${BASE}/`)
  await expect(page.getByText('Cellar Overview').first()).toBeVisible({ timeout: 15_000 })

  // Navigate via the top nav (desktop viewport)
  await page.getByRole('link', { name: 'Deliveries' }).click()
  await expect(page.getByText('Delivery Schedule').first()).toBeVisible()
  expect(page.url()).toContain(`${BASE}/deliveries`)

  // Deep reload on a nested route (preview serves the SPA fallback;
  // on GitHub Pages itself the 404.html redirect covers this)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Delivery Schedule').first()).toBeVisible({ timeout: 15_000 })

  await page.goto(`${BASE}/settings`)
  await expect(page.getByText('Backup & Restore').first()).toBeVisible()

  expect(assetFailures).toEqual([])
})

test('service worker registers with the subpath scope', async ({ page }) => {
  await page.goto(`${BASE}/`)
  await expect(page.getByText('Cellar Overview').first()).toBeVisible({ timeout: 15_000 })

  const scope = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'unsupported'
    const registration = await navigator.serviceWorker.ready
    return registration.scope
  })

  expect(scope).toContain(`${BASE}/`)
})
