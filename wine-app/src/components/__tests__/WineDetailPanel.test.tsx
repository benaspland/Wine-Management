/**
 * WineDetailPanel component tests — the destructive delete flow (native
 * confirm dialog) and the availability-dependent action buttons.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import WineDetailPanel from '../WineDetailPanel'
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
    drinking_window_start: 2020,
    drinking_window_end: 2040,
    quantity_in_storage: 10,
    quantity_at_home: 2,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function renderPanel(wine: Wine) {
  const handlers = {
    onClose: vi.fn(),
    onConsume: vi.fn().mockResolvedValue(undefined),
    onMoveToHome: vi.fn().mockResolvedValue(undefined),
    onEdit: vi.fn(),
    onDelete: vi.fn().mockResolvedValue(undefined),
  }
  render(<WineDetailPanel wine={wine} {...handlers} />)
  return handlers
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('WineDetailPanel - delete confirmation', () => {
  it('deletes and closes when the confirmation is accepted', async () => {
    // happy-dom does not implement confirm; stub the global the panel calls
    const confirmStub = vi.fn().mockReturnValue(true)
    vi.stubGlobal('confirm', confirmStub)
    const handlers = renderPanel(makeWine())

    fireEvent.click(screen.getByText('Delete'))

    await waitFor(() => expect(handlers.onDelete).toHaveBeenCalledWith('wine-1'))
    expect(confirmStub).toHaveBeenCalledWith(
      'Delete "R. Lopez de Heredia Vina Tondonia 2010"? This cannot be undone.'
    )
    expect(handlers.onClose).toHaveBeenCalled()
  })

  it('does nothing when the confirmation is dismissed', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false))
    const handlers = renderPanel(makeWine())

    fireEvent.click(screen.getByText('Delete'))

    // Give any (wrong) async delete a chance to fire before asserting
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(handlers.onDelete).not.toHaveBeenCalled()
    expect(handlers.onClose).not.toHaveBeenCalled()
  })

  it('keeps the panel open and alerts when the delete fails', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const alertStub = vi.fn()
    vi.stubGlobal('alert', alertStub)
    const handlers = {
      onClose: vi.fn(),
      onConsume: vi.fn(),
      onMoveToHome: vi.fn(),
      onEdit: vi.fn(),
      onDelete: vi.fn().mockRejectedValue(new Error('boom')),
    }
    render(<WineDetailPanel wine={makeWine()} {...handlers} />)

    fireEvent.click(screen.getByText('Delete'))

    await waitFor(() => expect(alertStub).toHaveBeenCalledWith('Error: boom'))
    expect(handlers.onClose).not.toHaveBeenCalled()
  })
})

describe('WineDetailPanel - availability-dependent actions', () => {
  it('shows Extract Bottle only when bottles are at home', () => {
    renderPanel(makeWine({ quantity_at_home: 0, quantity_in_storage: 5 }))
    expect(screen.queryByText('Extract Bottle')).toBeNull()
    expect(screen.queryByText('Move to Home')).not.toBeNull()
  })

  it('shows Move to Home only when bottles are in storage', () => {
    renderPanel(makeWine({ quantity_at_home: 3, quantity_in_storage: 0 }))
    expect(screen.queryByText('Extract Bottle')).not.toBeNull()
    expect(screen.queryByText('Move to Home')).toBeNull()
  })

  it('closes the panel after consuming the last bottle at home', async () => {
    const handlers = renderPanel(makeWine({ quantity_at_home: 1 }))

    fireEvent.click(screen.getByText('Extract Bottle'))

    await waitFor(() => expect(handlers.onConsume).toHaveBeenCalledWith('wine-1'))
    expect(handlers.onClose).toHaveBeenCalled()
  })

  it('keeps the panel open when more bottles remain after consuming', async () => {
    const handlers = renderPanel(makeWine({ quantity_at_home: 2 }))

    fireEvent.click(screen.getByText('Extract Bottle'))

    await waitFor(() => expect(handlers.onConsume).toHaveBeenCalledWith('wine-1'))
    expect(handlers.onClose).not.toHaveBeenCalled()
  })

  it('shows the combined bottle count', () => {
    renderPanel(makeWine({ quantity_in_storage: 10, quantity_at_home: 2 }))
    expect(screen.queryByText('12 Bottles')).not.toBeNull()
  })
})
