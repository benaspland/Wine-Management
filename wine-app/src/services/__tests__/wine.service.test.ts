/**
 * wineDisplayName — kills the "Chateau Meyney Meyney" effect wherever
 * producer and name are shown on one line. The importer derives name
 * from producer for château-style wines, so naive concatenation
 * duplicates the suffix.
 */

import { describe, it, expect } from 'vitest'
import { wineDisplayName, criticRatingsOf } from '../wine.service'

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
