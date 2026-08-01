/**
 * WineCard component tests — the labeled Drink action and the
 * home/storage location badge (the at-a-glance inventory state).
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import WineCard from '../WineCard'
import type { Wine } from '../../types/index'

function makeWine(overrides: Partial<Wine> = {}): Wine {
  return {
    id: 'wine-1',
    name: 'Vina Tondonia',
    producer: 'R. Lopez de Heredia',
    vintage: 2010,
    tier: 3,
    region: 'Rioja',
    country: 'Spain',
    wine_type: 'Red',
    varietal: 'Tempranillo',
    format: '750ml',
    drinking_window_start: 2020,
    drinking_window_end: 2040,
    quantity_in_storage: 10,
    quantity_at_home: 2,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function renderCard(wine: Wine) {
  const handlers = {
    onSelect: vi.fn(),
    onConsume: vi.fn().mockResolvedValue(undefined),
    onConsumeDetailed: vi.fn(),
  }
  render(<WineCard wine={wine} {...handlers} />)
  return handlers
}

describe('WineCard - Drink action', () => {
  it('consumes without opening the detail panel', async () => {
    const handlers = renderCard(makeWine({ quantity_at_home: 2 }))

    // Icon only, so it is found by its accessible name rather than
    // visible text — the same control as the list and schedule views
    fireEvent.click(screen.getByLabelText(/^Drink /))

    await waitFor(() => expect(handlers.onConsume).toHaveBeenCalledWith('wine-1'))
    expect(handlers.onSelect).not.toHaveBeenCalled()
  })

  it('offers no Drink action when no bottles are at home', () => {
    // Shown-but-disabled read as a broken control: it invited taps and
    // explained nothing. Bottles in storage are brought home from the
    // detail panel instead.
    renderCard(makeWine({ quantity_at_home: 0, quantity_in_storage: 6 }))

    expect(screen.queryByLabelText(/^Drink /)).toBeNull()
  })

  it('opens the detail panel when the card body is clicked', () => {
    const handlers = renderCard(makeWine())

    fireEvent.click(screen.getByText('Rioja', { exact: false }))
    expect(handlers.onSelect).toHaveBeenCalled()
  })
})

describe('WineCard - location badge', () => {
  it('shows the home and storage counts separately', () => {
    renderCard(makeWine({ quantity_at_home: 2, quantity_in_storage: 10 }))

    // The home count doubles as the consume control, so its description
    // has to carry both the count and what tapping it does — turning it
    // into a button must not cost the fact it was there to show.
    expect(screen.queryByTitle(/^2 at home\b/)).not.toBeNull()
    expect(screen.queryByTitle('10 in storage')).not.toBeNull()
  })

  it('is a plain count, not a control, when nothing is at home', () => {
    renderCard(makeWine({ quantity_at_home: 0, quantity_in_storage: 10 }))

    expect(screen.queryByTitle('0 at home')).not.toBeNull()
    expect(screen.queryByLabelText(/^Drink /)).toBeNull()
  })
})
