/**
 * ActiveFilters — the row that makes a narrowed collection legible.
 *
 * The count badge on the filter drawer says only "1". Arriving from a
 * dashboard tap-through, that leaves you on a collection quietly hiding
 * four fifths of your wines with nothing naming the rule that did it.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { act } from 'react'
import ActiveFilters from '../ActiveFilters'
import { useWineStore } from '../../store/wineStore'

function setFilters(updates: Parameters<typeof useWineStore.setState>[0]) {
  act(() => {
    useWineStore.setState(updates)
  })
}

describe('ActiveFilters', () => {
  beforeEach(() => {
    setFilters({
      wines: [],
      filteredWines: [],
      locationFilter: 'all',
      tierFilter: null,
      regionFilter: null,
      countryFilter: null,
      wineTypeFilter: null,
      formatFilter: null,
      windowFilter: 'all',
      searchTerm: '',
    })
  })

  it('renders nothing when no filter is applied', () => {
    const { container } = render(<ActiveFilters />)
    expect(container).toBeEmptyDOMElement()
  })

  it('names every applied filter in words, not a count', () => {
    setFilters({ windowFilter: 'ready', locationFilter: 'storage', tierFilter: 4 })
    render(<ActiveFilters />)

    expect(screen.getByText('Ready to drink')).toBeInTheDocument()
    expect(screen.getByText('In storage')).toBeInTheDocument()
    expect(screen.getByText('Premium')).toBeInTheDocument()
  })

  it('clears just the filter whose chip was tapped', () => {
    setFilters({ windowFilter: 'ready', regionFilter: 'Bordeaux' })
    render(<ActiveFilters />)

    fireEvent.click(screen.getByLabelText('Remove filter: Bordeaux'))

    expect(useWineStore.getState().regionFilter).toBeNull()
    expect(useWineStore.getState().windowFilter).toBe('ready')
  })

  it('offers Clear all only once there is more than one filter to clear', () => {
    setFilters({ windowFilter: 'ready' })
    const { rerender } = render(<ActiveFilters />)
    expect(screen.queryByText('Clear all')).not.toBeInTheDocument()

    setFilters({ wineTypeFilter: 'Red' })
    rerender(<ActiveFilters />)
    fireEvent.click(screen.getByText('Clear all'))

    expect(useWineStore.getState().windowFilter).toBe('all')
    expect(useWineStore.getState().wineTypeFilter).toBeNull()
  })

  it('leaves the search term alone — that is the user typing, not a hidden rule', () => {
    setFilters({ windowFilter: 'ready', regionFilter: 'Bordeaux', searchTerm: 'lauer' })
    render(<ActiveFilters />)

    fireEvent.click(screen.getByText('Clear all'))

    expect(useWineStore.getState().searchTerm).toBe('lauer')
  })
})
