import { defineConfig } from '@playwright/test'

/**
 * Production-path smoke: the app built exactly as it deploys to GitHub
 * Pages (base /Wine-Management/) and served with vite preview. Catches
 * subpath regressions — router basename, asset URLs, service worker
 * scope — that the dev-server E2E suite (base /) can never see.
 *
 * Run with: npm run test:e2e:ghpages
 */
export default defineConfig({
  testDir: './e2e-ghpages',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build:ghpages && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/Wine-Management/',
    env: { GITHUB_PAGES: 'true' },
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
