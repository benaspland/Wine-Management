/**
 * wineDisplayName — kills the "Chateau Meyney Meyney" effect wherever
 * producer and name are shown on one line. The importer derives name
 * from producer for château-style wines, so naive concatenation
 * duplicates the suffix.
 */

import { describe, it, expect } from 'vitest'
import { wineDisplayName, wineTileName, criticRatingsOf, WineService } from '../wine.service'
import type { Wine } from '../../types/index'

describe('wineDisplayName', () => {
  it('drops the name when the producer already ends with it', () => {
    expect(wineDisplayName('Chateau Meyney', 'Meyney')).toBe('Chateau Meyney')
    expect(wineDisplayName('Chateau Les Ormes de Pez', 'Les Ormes de Pez')).toBe(
      'Chateau Les Ormes de Pez'
    )
  })

  it('is case-insensitive about the suffix match', () => {
    expect(wineDisplayName('Chateau MEYNEY', 'Meyney')).toBe('Chateau MEYNEY')
  })

  it('concatenates when producer and name are distinct', () => {
    expect(wineDisplayName('Massolino', 'Barolo Margheria')).toBe('Massolino Barolo Margheria')
    expect(wineDisplayName('Peter Lauer', 'Kupp Riesling #8')).toBe('Peter Lauer Kupp Riesling #8')
  })

  it('handles missing pieces gracefully', () => {
    expect(wineDisplayName(undefined, 'Barolo')).toBe('Barolo')
    expect(wineDisplayName('', 'Barolo')).toBe('Barolo')
    expect(wineDisplayName('Producer', '')).toBe('Producer')
  })
})

/**
 * The compact surfaces drop an appellation but keep a cuvée. The
 * appellation is geography the region line beside it already carries,
 * and "Chateau Tronquoy Saint-Estephe" reads as one long name; a cuvée
 * is the only thing telling two wines from the same estate apart.
 */
describe('wineTileName', () => {
  it('shows the estate alone when the second line is an appellation', () => {
    expect(wineTileName('Chateau Tronquoy', 'Saint-Estephe', 'Bordeaux')).toBe('Chateau Tronquoy')
    expect(wineTileName('Clos Mogador', 'Priorat', 'Priorat')).toBe('Clos Mogador')
  })

  it('keeps the cuvée for everything else', () => {
    expect(wineTileName('Peter Lauer', 'Kupp Riesling #18', 'Saar')).toBe(
      'Peter Lauer Kupp Riesling #18'
    )
    expect(wineTileName('Massolino', 'Barolo Margheria', 'Piedmont')).toBe(
      'Massolino Barolo Margheria'
    )
    expect(wineTileName('Domaine Latour-Giraud', "Meursault 'Boucheres'", 'Burgundy')).toBe(
      "Domaine Latour-Giraud Meursault 'Boucheres'"
    )
  })

  it('still collapses a name that merely repeats the producer', () => {
    expect(wineTileName('Chateau Meyney', 'Meyney', 'Bordeaux')).toBe('Chateau Meyney')
  })

  it('falls back to the name when there is no producer', () => {
    expect(wineTileName(undefined, 'Barolo', 'Piedmont')).toBe('Barolo')
  })
})

describe('criticRatingsOf', () => {
  it('parses the JSON string the importer stores', () => {
    expect(criticRatingsOf('{"js":97,"rp":96}')).toEqual({ js: 97, rp: 96 })
  })

  it('passes an object through unchanged', () => {
    expect(criticRatingsOf({ js: 97 })).toEqual({ js: 97 })
  })

  it('never enumerates a raw string by character', () => {
    // The bug this guards: Object.entries on the unparsed string yields
    // {0: '{', 1: '"', ...}, which corrupted every CSV export.
    const entries = Object.entries(criticRatingsOf('{"js":97}'))
    expect(entries).toEqual([['js', 97]])
  })

  it('returns no ratings for empty, malformed or non-object values', () => {
    expect(criticRatingsOf(undefined)).toEqual({})
    expect(criticRatingsOf('')).toEqual({})
    expect(criticRatingsOf('not json')).toEqual({})
    expect(criticRatingsOf('null')).toEqual({})
    expect(criticRatingsOf('42')).toEqual({})
  })
})

/**
 * The drinking-window states.
 *
 * The guard that matters: this used to test "inside the window" before
 * "at its peak" and "in its final year", both of which are also inside
 * the window — so those branches sat under a condition that had already
 * caught them and could never run. Three of five states were dead, and
 * the badge colours built on them were decoration for cases that never
 * appeared.
 */
describe('getDrinkingWindowLabel', () => {
  const at = (start: number, end: number) =>
    ({ drinking_window_start: start, drinking_window_end: end }) as Wine

  it('waits before the window opens, naming the year', () => {
    expect(WineService.getDrinkingWindowLabel(at(2028, 2040), 2026)).toBe('Wait (2028)')
  })

  it('is ready through the body of the window', () => {
    expect(WineService.getDrinkingWindowLabel(at(2020, 2040), 2026)).toBe('Ready to Drink')
    expect(WineService.getDrinkingWindowLabel(at(2026, 2040), 2026)).toBe('Ready to Drink')
  })

  it('reaches Peak and Last Year, which it previously never could', () => {
    expect(WineService.getDrinkingWindowLabel(at(2020, 2027), 2026)).toBe('Peak')
    expect(WineService.getDrinkingWindowLabel(at(2020, 2026), 2026)).toBe('Last Year')
  })

  it('is past peak once the window has closed', () => {
    expect(WineService.getDrinkingWindowLabel(at(2015, 2025), 2026)).toBe('Past Peak')
  })

  it('walks the whole ramp for one wine, year by year', () => {
    const wine = at(2024, 2028)
    const walk = [2023, 2024, 2026, 2027, 2028, 2029].map(year =>
      WineService.getDrinkingWindowLabel(wine, year)
    )
    expect(walk).toEqual([
      'Wait (2024)',
      'Ready to Drink',
      'Ready to Drink',
      'Peak',
      'Last Year',
      'Past Peak',
    ])
  })
})
