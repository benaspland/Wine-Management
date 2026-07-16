# The Cellar — Deployment Guide

The app is a React + Vite **Progressive Web App**. It deploys as static
files to GitHub Pages and stores all data on-device in IndexedDB (with a
localStorage fallback). There is no server and no desktop (Electron)
target — the former Electron build was removed.

## Development

```bash
cd wine-app
npm install
npm run dev          # http://localhost:5173
```

First time on a new machine (for the E2E suite):

```bash
npx playwright install chromium
```

## Quality gates

| Command | What it runs |
|---|---|
| `npx tsc -b` | Typecheck |
| `npm run lint` | ESLint (must be clean — CI gates on it) |
| `npm test` | Vitest unit/component/integration suite |
| `npm run test:e2e` | Playwright E2E against the dev server |
| `npm run test:e2e:ghpages` | Production build served at `/Wine-Management/` — catches base-path, router and service-worker scope regressions |

CI (`.github/workflows/ci.yml`) runs all of these on every push and PR.

## Deploying to GitHub Pages

1. Make sure CI is green on the branch and it is merged to `main`.
2. Configure the image-search worker URL (one-time, see below):
   create `wine-app/.env` containing
   `VITE_IMAGE_WORKER_URL=https://wine-image-search.<account>.workers.dev`
3. Deploy:

```bash
cd wine-app
npm run deploy       # builds with GITHUB_PAGES=true and pushes dist/ to gh-pages
```

The app serves from `https://<user>.github.io/Wine-Management/`. The
service worker auto-updates installed clients on their next launch.

### Image search worker (Cloudflare, one-time setup)

```bash
cd wine-image-worker
npx wrangler secret put PIXABAY_API_KEY   # paste key from pixabay.com/api/docs
npx wrangler deploy
# verify:
curl "https://wine-image-search.<account>.workers.dev/?q=rioja"
```

## Data safety

All data lives **only on the device**. Before upgrading the installed
app (or testing risky changes):

1. Open **Settings → Backup & Restore → Download Backup**. This saves a
   full JSON snapshot — wines, delivery windows, consumption history and
   configuration. (The CSV export covers wines only.)
2. Keep the file somewhere off-device.
3. **Restore Backup** replaces all current data with a snapshot.

Upgrade/migration notes:

- The first launch after the storage refactor migrates legacy
  localStorage data into IndexedDB automatically. The legacy
  localStorage key is intentionally left in place, so rolling back to a
  pre-refactor build restores the pre-migration state.
- The app requests persistent storage (`navigator.storage.persist()`)
  on startup so the browser won't evict the database under pressure.

## Database management

- **Web/PWA**: IndexedDB, database `wine-app`, store `tables`, key `db`
  (single whole-database snapshot). Inspect via DevTools → Application →
  IndexedDB.
- **Full backup/restore**: Settings page (JSON, all tables).
- **CSV import/export**: Settings page (wines only; import skips
  duplicates and reports per-row errors).

## Troubleshooting

- **Blank page on GitHub Pages**: check the browser console for 404s on
  assets — usually a base-path problem. `npm run test:e2e:ghpages`
  reproduces this locally.
- **Deep links 404 on GitHub Pages**: `public/404.html` + the redirect
  script in `index.html` handle this; make sure `404.html` was deployed.
- **Stale app after deploy**: the service worker updates on next
  launch; force-close and reopen the installed app, or unregister the
  worker in DevTools.
- **CSV import fails**: the Settings page shows imported/skipped/failed
  counts; row-level errors are logged to the console.
