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

/**
 * Sorting has two halves now: what the list is ordered by, and which way
 * round. Every comparator is written ascending on its own value and the
 * direction flips it, so the toggle means the same thing for each key —
 * but each key opens on its own useful end, since newest vintage and
 * A–Z are not the same direction.
 */
describe('sort direction', () => {
  const bought = (name: string, purchase_date?: string) =>
    wine({ name, purchase_date })

  it('opens each sort at its useful end', () => {
    const store = useWineStore.getState()
    store.setSortBy('vintage')
    expect(useWineStore.getState().sortDirection).toBe('desc')
    store.setSortBy('producer')
    expect(useWineStore.getState().sortDirection).toBe('asc')
    store.setSortBy('window')
    expect(useWineStore.getState().sortDirection).toBe('asc')
    store.setSortBy('purchased')
    expect(useWineStore.getState().sortDirection).toBe('desc')
  })

  it('reverses the order without changing what it sorts by', () => {
    useWineStore.getState().setSortBy('window')
    expect(useWineStore.getState().filteredWines.map(w => w.name))
      .toEqual(['Urgent', 'Relaxed', 'Future'])

    useWineStore.getState().toggleSortDirection()
    expect(useWineStore.getState().sortBy).toBe('window')
    expect(useWineStore.getState().filteredWines.map(w => w.name))
      .toEqual(['Future', 'Relaxed', 'Urgent'])
  })

  it('starts a newly chosen sort at its own default, not the last direction', () => {
    // Reversing the vintages must not leave Producer running Z–A
    useWineStore.getState().setSortBy('vintage')
    useWineStore.getState().toggleSortDirection()
    expect(useWineStore.getState().sortDirection).toBe('asc')

    useWineStore.getState().setSortBy('producer')
    expect(useWineStore.getState().sortDirection).toBe('asc')
  })

  it('sorts by purchase date, most recent first', () => {
    useWineStore.setState({
      wines: [
        bought('Middle', '2024-06-01'),
        bought('Newest', '2025-11-30'),
        bought('Oldest', '2019-01-15'),
      ],
    })
    useWineStore.getState().setSortBy('purchased')
    expect(useWineStore.getState().filteredWines.map(w => w.name))
      .toEqual(['Newest', 'Middle', 'Oldest'])

    useWineStore.getState().toggleSortDirection()
    expect(useWineStore.getState().filteredWines.map(w => w.name))
      .toEqual(['Oldest', 'Middle', 'Newest'])
  })

  it('keeps wines with no purchase date last, whichever way round', () => {
    useWineStore.setState({
      wines: [bought('Undated'), bought('Dated', '2024-06-01'), bought('Older', '2020-02-02')],
    })
    useWineStore.getState().setSortBy('purchased')
    expect(useWineStore.getState().filteredWines.map(w => w.name))
      .toEqual(['Dated', 'Older', 'Undated'])

    // Reversing must not promote the wines you know least about
    useWineStore.getState().toggleSortDirection()
    expect(useWineStore.getState().filteredWines.map(w => w.name))
      .toEqual(['Older', 'Dated', 'Undated'])
  })
})

/**
 * Searching a cellar that holds several vintages of the same wine.
 *
 * The obvious way to find the one you just added is to type the producer
 * and the year. That found nothing: the search tested one field at a
 * time for the whole phrase, over name, producer and region only — so no
 * field contains "meyney 2018", and the year was not searched at all.
 */
describe('search', () => {
  const meyney2018 = wine({ producer: 'Chateau Meyney', name: 'Saint-Estephe', vintage: 2018, region: 'Bordeaux' })
  const meyney2020 = wine({ producer: 'Chateau Meyney', name: 'Saint-Estephe', vintage: 2020, region: 'Bordeaux' })
  const other = wine({ producer: 'Massolino', name: 'Barolo', vintage: 2018, region: 'Piedmont' })

  beforeEach(() => {
    useWineStore.setState({ wines: [meyney2018, meyney2020, other] })
    useWineStore.getState().clearFilters()
  })

  const found = () => useWineStore.getState().filteredWines.map(w => `${w.producer} ${w.vintage}`)

  it('finds one vintage among several of the same wine', () => {
    useWineStore.getState().setSearchTerm('meyney 2018')
    expect(found()).toEqual(['Chateau Meyney 2018'])
  })

  it('finds a wine by its vintage alone', () => {
    useWineStore.getState().setSearchTerm('2020')
    expect(found()).toEqual(['Chateau Meyney 2020'])
  })

  it('still finds every vintage when only the producer is given', () => {
    useWineStore.getState().setSearchTerm('meyney')
    expect(found().sort()).toEqual(['Chateau Meyney 2018', 'Chateau Meyney 2020'])
  })

  it('requires every word, so terms narrow rather than widen', () => {
    useWineStore.getState().setSearchTerm('massolino bordeaux')
    expect(found()).toEqual([])
  })

  it('searches country, classification and varietal too', () => {
    useWineStore.setState({
      wines: [wine({ producer: 'X', country: 'Spain', classification: 'DOCa', varietal: 'Tempranillo' })],
    })
    for (const term of ['spain', 'doca', 'tempranillo']) {
      useWineStore.getState().setSearchTerm(term)
      expect(useWineStore.getState().filteredWines).toHaveLength(1)
    }
  })

  it('ignores stray whitespace rather than matching nothing', () => {
    useWineStore.getState().setSearchTerm('  meyney   2018  ')
    expect(found()).toEqual(['Chateau Meyney 2018'])
  })
})
