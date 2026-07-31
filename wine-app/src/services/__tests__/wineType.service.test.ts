/**
 * Wine colour detection.
 *
 * This value now tints the thumbnail on every list row, so a wrong
 * answer is visible on screen rather than merely wrong in a filter. The
 * previous heuristic knew thirteen grapes and called everything else
 * Red — which covered this collection's Chardonnay and Riesling and got
 * its Muscadet, Txakolina, Godello and Vintage Port wrong.
 */

import { describe, it, expect } from 'vitest'
import { detectWineType, normalizeWineType } from '../wineType.service'

describe('detectWineType', () => {
  it('reads the grape when it names a colour', () => {
    expect(detectWineType('Cabernet Sauvignon : Merlot')).toBe('Red')
    expect(detectWineType('Riesling')).toBe('White')
    expect(detectWineType('Nebbiolo')).toBe('Red')
  })

  it('knows the whites the old thirteen-grape list called Red', () => {
    expect(detectWineType('Melon de Bourgogne')).toBe('White')
    expect(detectWineType('Hondarrabi Zuri')).toBe('White')
    expect(detectWineType('Godello')).toBe('White')
    expect(detectWineType('Furmint')).toBe('White')
    expect(detectWineType('Assyrtiko')).toBe('White')
  })

  it('falls back to the name when the grape is silent', () => {
    // An appellation states the colour even when the blend does not
    expect(detectWineType('', 'Chablis 1er Cru Montee de Tonnerre')).toBe('White')
    expect(detectWineType(undefined, 'Oxer Bastegieta Marko Terlegiz Txakolina')).toBe('White')
    expect(detectWineType('', 'Sancerre')).toBe('White')
  })

  it('picks the more specific style over the grape it is made from', () => {
    // Champagne is Chardonnay and Pinot Noir, so reading the grape
    // first calls it White. What it was made into beats what it was
    // made from.
    expect(detectWineType('Chardonnay : Pinot Noir', 'Champagne Grand Cru')).toBe('Sparkling')
    expect(detectWineType('', 'Champagne Blanc de Blancs')).toBe('Sparkling')
    expect(detectWineType('Touriga Nacional', 'Quinta do Noval Vintage Port')).toBe('Fortified')
    expect(detectWineType('Grenache', 'Cotes de Provence Rosé')).toBe('Rosé')
  })

  it('does not match a term inside a longer word', () => {
    // "port" must not fire on Portugieser
    expect(detectWineType('Blauer Portugieser')).not.toBe('Fortified')
  })

  it('returns undefined rather than guessing Red when nothing is recognised', () => {
    expect(detectWineType('Unobtainium', 'Mystery Bottle')).toBeUndefined()
    expect(detectWineType('', '')).toBeUndefined()
    expect(detectWineType()).toBeUndefined()
  })
})

describe('normalizeWineType', () => {
  it('accepts the canonical values in any case', () => {
    expect(normalizeWineType('red')).toBe('Red')
    expect(normalizeWineType('SPARKLING')).toBe('Sparkling')
    expect(normalizeWineType('Rosé')).toBe('Rosé')
  })

  it('accepts an unaccented or foreign spelling', () => {
    expect(normalizeWineType('rose')).toBe('Rosé')
    expect(normalizeWineType('blanc')).toBe('White')
    expect(normalizeWineType('tinto')).toBe('Red')
  })

  it('ignores an empty or unrecognised cell so detection still runs', () => {
    expect(normalizeWineType('')).toBeUndefined()
    expect(normalizeWineType('   ')).toBeUndefined()
    expect(normalizeWineType('orange')).toBeUndefined()
  })
})
