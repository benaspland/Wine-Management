/**
 * The drinking schedule folds history away by default, so where history
 * begins decides what is on screen when the page opens. An off-by-one
 * here hides this month's wines — the ones the page exists to show.
 */

import { describe, it, expect } from 'vitest'
import { isPastPeriod, periodSummary } from '../schedulePeriod.service'

const SEPT_2026 = new Date('2026-09-22T12:00:00Z')

describe('isPastPeriod', () => {
  it('keeps the current month open, right up to its last day', () => {
    // A wine scheduled for this month is still this month's business on
    // the 30th; the boundary is the month, not the day
    expect(isPastPeriod(2026, 9, SEPT_2026)).toBe(false)
    expect(isPastPeriod(2026, 9, new Date('2026-09-30T23:00:00Z'))).toBe(false)
  })

  it('folds the month just gone', () => {
    expect(isPastPeriod(2026, 8, SEPT_2026)).toBe(true)
  })

  it('leaves the months still to come open', () => {
    expect(isPastPeriod(2026, 10, SEPT_2026)).toBe(false)
    expect(isPastPeriod(2027, 1, SEPT_2026)).toBe(false)
  })

  it('folds every month of a past year, including December', () => {
    // The year fold asks about December: if even that has passed, the
    // whole year is history
    expect(isPastPeriod(2025, 12, SEPT_2026)).toBe(true)
    expect(isPastPeriod(2025, 1, SEPT_2026)).toBe(true)
  })

  it('does not fold this year when asked about December', () => {
    expect(isPastPeriod(2026, 12, SEPT_2026)).toBe(false)
  })
})

describe('periodSummary', () => {
  it('calls it a record when every bottle was drunk', () => {
    expect(periodSummary([{ consumed: true }, { consumed: true }])).toBe('2 drunk')
  })

  it('calls it a list when any bottle was not', () => {
    // "2 drunk" would be a claim about bottles still in the rack
    expect(periodSummary([{ consumed: true }, { consumed: false }])).toBe('2 wines')
  })

  it('counts one wine as one', () => {
    expect(periodSummary([{ consumed: true }])).toBe('1 drunk')
    expect(periodSummary([{}])).toBe('1 wine')
  })

  it('says nothing was drunk rather than that everything was', () => {
    // An empty period trivially has "all" its bottles drunk; saying so
    // would be true and useless
    expect(periodSummary([])).toBe('0 wines')
  })
})
