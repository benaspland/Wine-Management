/**
 * Skins. The stored id drives a data attribute on <html>, so a bad or
 * stale value must degrade to the default rather than leave the app
 * with no palette at all — every colour in the build resolves through
 * these tokens.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SKINS, DEFAULT_SKIN, applySkin, storedSkin, isSkinId, SKIN_STORAGE_KEY } from '../skin.service'

describe('skin.service', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.skin
  })

  it('ships every skin with a distinct id and a full swatch', () => {
    expect(SKINS.length).toBeGreaterThan(1)
    expect(new Set(SKINS.map(s => s.id)).size).toBe(SKINS.length)
    for (const skin of SKINS) {
      expect(skin.swatch).toHaveLength(3)
      expect(skin.statusBar).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('defaults when nothing is stored', () => {
    expect(storedSkin()).toBe(DEFAULT_SKIN)
  })

  it('round-trips a chosen skin', () => {
    applySkin('burgundy-gold')
    expect(document.documentElement.dataset.skin).toBe('burgundy-gold')
    expect(storedSkin()).toBe('burgundy-gold')
  })

  it('falls back to the default for an id that no longer exists', () => {
    // A skin removed in a later release must not leave the app unpainted
    localStorage.setItem(SKIN_STORAGE_KEY, 'sunset-lilac')
    expect(storedSkin()).toBe(DEFAULT_SKIN)

    applySkin('sunset-lilac')
    expect(document.documentElement.dataset.skin).toBe(DEFAULT_SKIN)
  })

  it('retints the status bar to match', () => {
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    meta.setAttribute('content', '#722F37')
    document.head.appendChild(meta)

    applySkin('ink-copper')
    expect(meta.getAttribute('content')).toBe(
      SKINS.find(s => s.id === 'ink-copper')!.statusBar
    )

    meta.remove()
  })

  it('recognises only ids it ships', () => {
    expect(isSkinId('slate-brass')).toBe(true)
    expect(isSkinId('nope')).toBe(false)
    expect(isSkinId(null)).toBe(false)
  })
})
