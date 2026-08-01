/**
 * wineDisplayName — kills the "Chateau Meyney Meyney" effect wherever
 * producer and name are shown on one line. The importer derives name
 * from producer for château-style wines, so naive concatenation
 * duplicates the suffix.
 */

import { describe, it, expect } from 'vitest'
import {
  wineDisplayName,
  wineTileName,
  criticRatingsOf,
  WineService,
  drinkingWindowSummary,
  drinkingWindowYears,
  formatCriticRatings,
  parseCriticRatings,
  formatDeliveryMonth,
} from '../wine.service'
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

  it('holds before the window opens, naming the year', () => {
    expect(WineService.getDrinkingWindowLabel(at(2028, 2040), 2026)).toBe('Hold (2028)')
  })

  it('names the year to drink by, through the body of the window', () => {
    expect(WineService.getDrinkingWindowLabel(at(2020, 2040), 2026)).toBe('Drink (2040)')
    expect(WineService.getDrinkingWindowLabel(at(2026, 2040), 2026)).toBe('Drink (2040)')
  })

  it('reaches Peak and Last Year, which it previously never could', () => {
    expect(WineService.getDrinkingWindowLabel(at(2020, 2027), 2026)).toBe('Peak (2027)')
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
      'Hold (2024)',
      'Drink (2028)',
      'Drink (2028)',
      'Peak (2028)',
      'Last Year',
      'Past Peak',
    ])
  })
})

/**
 * The schedule's window subtitle. Its verb has to come from the same
 * state machine as the cellar's chip — two screens describing one fact
 * in two vocabularies is what this shares the machinery to prevent.
 */
describe('drinkingWindowSummary', () => {
  const at = (start: number, end: number) =>
    ({ drinking_window_start: start, drinking_window_end: end }) as Wine

  it('leads with the same verb the badge shows, then the whole window', () => {
    expect(drinkingWindowSummary(at(2024, 2029), 2026)).toBe('Drink · 2024–2029')
    expect(drinkingWindowSummary(at(2028, 2040), 2026)).toBe('Hold · 2028–2040')
    expect(drinkingWindowSummary(at(2020, 2027), 2026)).toBe('Peak · 2020–2027')
    expect(drinkingWindowSummary(at(2020, 2026), 2026)).toBe('Last Year · 2020–2026')
    expect(drinkingWindowSummary(at(2015, 2024), 2026)).toBe('Past Peak · 2015–2024')
  })

  it('drops the badge year, since the full window follows it', () => {
    // "Drink (2029) · 2024-2029" would say 2029 twice
    expect(drinkingWindowSummary(at(2024, 2029), 2026)).not.toContain('(')
  })

  it('gives just the years for a wine that cannot be acted on', () => {
    expect(drinkingWindowYears(at(2030, 2040))).toBe('2030–2040')
  })
})

/**
 * Critic scores round-trip through the form. The field was in the form's
 * state from the start but had no input, so a score could only ever
 * arrive by CSV — and the format has to match the one the importer
 * reads, or a wine edited by hand would stop matching one imported.
 */
describe('critic ratings round-trip', () => {
  it('renders the same shape the CSV column uses', () => {
    expect(formatCriticRatings({ js: 97, rp: 96 })).toBe('JS 97 : RP 96')
  })

  it('reads a score stored as JSON by the importer', () => {
    expect(formatCriticRatings('{"js":97,"rp":96}')).toBe('JS 97 : RP 96')
  })

  it('parses what it renders', () => {
    expect(parseCriticRatings('JS 97 : RP 96')).toEqual({ js: 97, rp: 96 })
  })

  it('keeps the score from a qualified rating like RP 94+', () => {
    expect(parseCriticRatings('RP 94+')).toEqual({ rp: 94 })
  })

  it('ignores anything that is not a score, rather than storing rubbish', () => {
    expect(parseCriticRatings('lovely stuff : JS 97')).toEqual({ js: 97 })
    expect(parseCriticRatings('')).toEqual({})
  })

  it('gives an empty string for a wine with no scores', () => {
    expect(formatCriticRatings(undefined)).toBe('')
  })
})

/**
 * A delivery window is a month, so its date is shown as one. Written
 * from a fixed table because en-GB abbreviates September to "Sept" —
 * four letters where every other month is three.
 */
describe('formatDeliveryMonth', () => {
  it('gives month and year, without the day', () => {
    expect(formatDeliveryMonth('2032-03-01')).toBe('Mar 2032')
  })

  it('says Sep, not Sept', () => {
    expect(formatDeliveryMonth('2032-09-01')).toBe('Sep 2032')
  })

  it('renders every month in three letters', () => {
    const lengths = Array.from({ length: 12 }, (_, m) =>
      formatDeliveryMonth(new Date(2032, m, 1)).split(' ')[0].length
    )
    expect(new Set(lengths)).toEqual(new Set([3]))
  })

  it('returns nothing for an unparseable date rather than "Invalid Date"', () => {
    expect(formatDeliveryMonth('not a date')).toBe('')
  })
})
