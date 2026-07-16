/**
 * Drinking-window filtering and urgency sort in the wine store — the
 * mechanics behind the "Drink Soon" surfacing.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useWineStore } from '../wineStore'
import type { Wine } from '../../types/index'

let seq = 0
function wine(overrides: Partial<Wine>): Wine {
  seq += 1
  return {
    id: `w-${seq}`,
    name: `Wine ${seq}`,
    producer: `Producer ${seq}`,
    vintage: 2018,
    tier: 2,
    region: 'Rioja',
    wine_type: 'Red',
    drinking_window_start: 2020,
    drinking_window_end: 2040,
    quantity_in_storage: 6,
    quantity_at_home: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const YEAR = new Date().getFullYear()

// Relative to "now" so the tests stay correct in any year
const urgent = wine({ name: 'Urgent', drinking_window_start: YEAR - 5, drinking_window_end: YEAR + 1 })
const relaxed = wine({ name: 'Relaxed', drinking_window_start: YEAR - 5, drinking_window_end: YEAR + 15 })
const future = wine({ name: 'Future', drinking_window_start: YEAR + 4, drinking_window_end: YEAR + 20 })

beforeEach(() => {
  useWineStore.setState({ wines: [urgent, relaxed, future] })
  useWineStore.getState().clearFilters()
})

describe('windowFilter', () => {
  it('ready keeps only wines inside their drinking window', () => {
    useWineStore.getState().setWindowFilter('ready')
    const names = useWineStore.getState().filteredWines.map(w => w.name)
    expect(names.sort()).toEqual(['Relaxed', 'Urgent'])
  })

  it('closing keeps only in-window wines near their window end', () => {
    useWineStore.getState().setWindowFilter('closing')
    const names = useWineStore.getState().filteredWines.map(w => w.name)
    expect(names).toEqual(['Urgent'])
  })

  it('waiting keeps only wines whose window has not opened', () => {
    useWineStore.getState().setWindowFilter('waiting')
    const names = useWineStore.getState().filteredWines.map(w => w.name)
    expect(names).toEqual(['Future'])
  })

  it('clearFilters resets the window filter', () => {
    useWineStore.getState().setWindowFilter('closing')
    useWineStore.getState().clearFilters()
    expect(useWineStore.getState().windowFilter).toBe('all')
    expect(useWineStore.getState().filteredWines).toHaveLength(3)
  })
})

describe('sortBy window', () => {
  it('orders by window end, most urgent first', () => {
    useWineStore.getState().setSortBy('window')
    const names = useWineStore.getState().filteredWines.map(w => w.name)
    expect(names).toEqual(['Urgent', 'Relaxed', 'Future'])
  })
})
