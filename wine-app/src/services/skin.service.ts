/**
 * Skins: named token sets defined in src/styles/skins.css and selected
 * by a data-skin attribute on <html>.
 *
 * The choice lives in localStorage rather than IndexedDB on purpose —
 * it has to be readable synchronously at boot, before the database
 * opens, or the app paints in the wrong skin and then jumps.
 */

export const SKIN_STORAGE_KEY = 'wine-app-skin'

export interface Skin {
  id: string
  name: string
  description: string
  /** Swatch preview: background, surface, accent. */
  swatch: [string, string, string]
  /**
   * Tints the phone's status bar. Without this the bar keeps the
   * maroon it was hardcoded to and sits above every skin looking like
   * it belongs to a different app.
   */
  statusBar: string
}

export const SKINS: Skin[] = [
  {
    id: 'slate-brass',
    name: 'Slate & Brass',
    description: 'Cool grey with warm brass',
    swatch: ['#181a1d', '#22252a', '#c2a15a'],
    statusBar: '#131518',
  },
  {
    id: 'ink-copper',
    name: 'Ink & Copper',
    description: 'Warm near-black with copper',
    swatch: ['#16181a', '#201d1b', '#b5714a'],
    statusBar: '#101112',
  },
  {
    id: 'charcoal-verdant',
    name: 'Charcoal & Verdant',
    description: 'Vineyard green, gold for readiness',
    swatch: ['#161918', '#1e2422', '#7a9a6f'],
    statusBar: '#101312',
  },
  {
    id: 'burgundy-gold',
    name: 'Burgundy & Gold',
    description: 'Deep wine red with gold',
    swatch: ['#1c1614', '#241d1a', '#c9a04e'],
    statusBar: '#150f0e',
  },
]

export const DEFAULT_SKIN = SKINS[0].id

export function isSkinId(value: string | null | undefined): value is string {
  return !!value && SKINS.some(skin => skin.id === value)
}

/** The stored choice, or the default when absent or no longer valid. */
export function storedSkin(): string {
  try {
    const saved = localStorage.getItem(SKIN_STORAGE_KEY)
    return isSkinId(saved) ? saved : DEFAULT_SKIN
  } catch {
    return DEFAULT_SKIN
  }
}

/** Paints the skin and remembers it. Safe to call before React mounts. */
export function applySkin(id: string): void {
  const skin = isSkinId(id) ? id : DEFAULT_SKIN
  document.documentElement.dataset.skin = skin

  const bar = SKINS.find(s => s.id === skin)?.statusBar
  const meta = document.querySelector('meta[name="theme-color"]')
  if (bar && meta) meta.setAttribute('content', bar)
  try {
    localStorage.setItem(SKIN_STORAGE_KEY, skin)
  } catch {
    // A private-mode browser can refuse to store; the skin still applies
    // for this session, which is better than failing the render.
  }
}
