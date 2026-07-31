import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted fonts: bundled and precached by the service worker, so
// typography works offline and never blocks rendering on a CDN.
import '@fontsource-variable/inter'
import '@fontsource/noto-serif/400.css'
import '@fontsource/noto-serif/700.css'
import './index.css'
import App from './App.tsx'
import { applySkin, storedSkin } from './services/skin.service'

// Before the first render, so the app never paints in the default skin
// and then jumps to the chosen one.
applySkin(storedSkin())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
