/**
 * Entries written before the field existed carry no reason at all. They
 * have to read as "drank" — that is what logging a bottle meant at the
 * time, and inferring anything else would put words in the record.
 */

import { describe, it, expect } from 'vitest'
import {
  reasonOf,
  reasonChip,
  reasonVerb,
  REASON_ORDER,
  CONSUMPTION_REASONS,
} from '../consumptionReason.service'

describe('consumption reasons', () => {
  it('reads a missing reason as drank', () => {
    expect(reasonOf(undefined)).toBe('drank')
    expect(reasonOf('')).toBe('drank')
  })

  it('falls back to drank rather than trusting an unknown value', () => {
    expect(reasonOf('teleported')).toBe('drank')
  })

  it('says nothing in a history row when the bottle was drunk', () => {
    // The common case needs no label; only the exceptions do
    expect(reasonChip(undefined)).toBe('')
    expect(reasonChip('drank')).toBe('')
    expect(reasonChip('gifted')).toBe('Gifted')
  })

  it('gives the toast a verb for every reason', () => {
    for (const key of REASON_ORDER) {
      expect(reasonVerb(key).length).toBeGreaterThan(0)
    }
    expect(reasonVerb(undefined)).toBe('consumed')
    expect(reasonVerb('gifted')).toBe('logged as gifted')
  })

  it('opens the dropdown on drank, and offers every reason once', () => {
    expect(REASON_ORDER[0]).toBe('drank')
    expect(new Set(REASON_ORDER).size).toBe(REASON_ORDER.length)
    expect(REASON_ORDER.sort()).toEqual(Object.keys(CONSUMPTION_REASONS).sort())
  })
})
