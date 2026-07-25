/**
 * Format normalisation — the collection is imported from several
 * sources that each describe the same bottle differently, so this is
 * the guard against the format filter fragmenting into near-duplicates.
 */

import { describe, it, expect } from 'vitest'
import {
  normalizeFormat,
  bottlesPerCase,
  isMagnumOrLarger,
  BOTTLE_FORMATS,
} from '../format.service'

describe('normalizeFormat', () => {
  it('collapses every standard-bottle spelling onto "Bottle"', () => {
    for (const input of ['750ml', '75cl', '0.75L', '0,75 l', '750 ML', 'Bottle', 'btl', '75 cl']) {
      expect(normalizeFormat(input)).toBe('Bottle')
    }
  })

  it('collapses every half-bottle spelling onto "Half Bottle"', () => {
    for (const input of ['375ml', '37.5cl', 'half', 'Half Bottle', 'HALF BOTTLE', 'demi', '0.375L']) {
      expect(normalizeFormat(input)).toBe('Half Bottle')
    }
  })

  it('collapses every magnum spelling onto "Magnum"', () => {
    for (const input of ['Magnum', 'magnum', '1.5L', '1.5L (Magnum)', '150cl', '1500ml', 'magnums']) {
      expect(normalizeFormat(input)).toBe('Magnum')
    }
  })

  it('recognises 3L formats as Double Magnum', () => {
    for (const input of ['3L', '3000ml', '300cl', 'Double Magnum', 'double magnum', 'Jeroboam']) {
      expect(normalizeFormat(input)).toBe('Double Magnum')
    }
  })

  it('reads "Half Bottle" as half, not as bottle', () => {
    // Ordering trap: the string contains "bottle"
    expect(normalizeFormat('Half Bottle')).toBe('Half Bottle')
    expect(normalizeFormat('Double Magnum')).toBe('Double Magnum')
  })

  it('absorbs near-miss volumes rather than treating them as unknown', () => {
    expect(normalizeFormat('70cl')).toBe('Bottle')
    expect(normalizeFormat('700ml')).toBe('Bottle')
  })

  it('tolerates minor typos in the trade names', () => {
    expect(normalizeFormat('bottel')).toBe('Bottle')
    expect(normalizeFormat('magnun')).toBe('Magnum')
    expect(normalizeFormat('Bottl')).toBe('Bottle')
  })

  it('treats blank and placeholder values as unrecorded', () => {
    expect(normalizeFormat(undefined)).toBeUndefined()
    expect(normalizeFormat('')).toBeUndefined()
    expect(normalizeFormat('   ')).toBeUndefined()
    expect(normalizeFormat('-')).toBeUndefined()
  })

  it('preserves an unrecognised value rather than guessing', () => {
    expect(normalizeFormat('Imperial 6L')).toBe('Imperial 6L')
    expect(normalizeFormat('mystery cask')).toBe('mystery cask')
  })

  it('is idempotent — normalising a trade name returns it unchanged', () => {
    for (const format of BOTTLE_FORMATS) {
      expect(normalizeFormat(format)).toBe(format)
    }
  })

  it('maps every Size value in the committed collection onto a trade name', () => {
    // The four spellings wine-data.csv actually contains
    expect(['750ml', '75cl', 'Magnum', '1.5L (Magnum)'].map(s => normalizeFormat(s))).toEqual([
      'Bottle',
      'Bottle',
      'Magnum',
      'Magnum',
    ])
  })
})

describe('bottlesPerCase', () => {
  it('sizes cases by format, however the format is spelled', () => {
    expect(bottlesPerCase('750ml')).toBe(6)
    expect(bottlesPerCase('75cl')).toBe(6)
    expect(bottlesPerCase('Bottle')).toBe(6)
    expect(bottlesPerCase('Half Bottle')).toBe(12)
    expect(bottlesPerCase('375ml')).toBe(12)
    expect(bottlesPerCase('Magnum')).toBe(3)
    expect(bottlesPerCase('1.5L (Magnum)')).toBe(3)
    expect(bottlesPerCase('Double Magnum')).toBe(1)
  })

  it('falls back to a standard case for missing or unknown formats', () => {
    expect(bottlesPerCase(undefined)).toBe(6)
    expect(bottlesPerCase('mystery cask')).toBe(6)
  })
})

describe('isMagnumOrLarger', () => {
  it('flags large formats regardless of spelling', () => {
    expect(isMagnumOrLarger('Magnum')).toBe(true)
    expect(isMagnumOrLarger('1.5L (Magnum)')).toBe(true)
    expect(isMagnumOrLarger('150cl')).toBe(true)
    expect(isMagnumOrLarger('3L')).toBe(true)
  })

  it('does not flag standard or half bottles', () => {
    expect(isMagnumOrLarger('750ml')).toBe(false)
    expect(isMagnumOrLarger('75cl')).toBe(false)
    expect(isMagnumOrLarger('Half Bottle')).toBe(false)
    expect(isMagnumOrLarger(undefined)).toBe(false)
  })
})
