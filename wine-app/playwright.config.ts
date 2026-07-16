import { defineConfig } from '@playwright/test'

/**
 * E2E tests run against the Vite dev server with a real Chromium —
 * the same engine an installed Android PWA uses. Each test gets a
 * fresh browser context, so IndexedDB/localStorage start empty.
 *
 * First run on a new machine: npx playwright install chromium
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
