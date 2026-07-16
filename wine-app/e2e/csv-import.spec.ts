import { test, expect } from '@playwright/test'
import * as path from 'path'

/**
 * CSV ingestion through the real Settings UI, using the committed
 * collection file (126 rows, one exact duplicate).
 */

test('imports the full collection CSV through the Settings page', async ({ page }) => {
  await page.goto('/settings')

  const csvPath = path.join(__dirname, '../..', 'wine-data.csv')
  await page.setInputFiles('input[type="file"]', csvPath)

  await expect(
    page.getByText('Imported 125 wines successfully, 1 skipped as duplicates')
  ).toBeVisible({ timeout: 20_000 })

  // The export button reflects the live store count
  await expect(page.locator('button:has-text("Export 125 Wines")')).toBeVisible()

  // Imported wines render in the collection
  await page.goto('/cellar')
  await expect(page.getByText('Barolo Margheria').first()).toBeVisible()
})
