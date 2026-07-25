/**
 * WineDetailPanel component tests — the destructive delete flow
 * (hold-to-confirm dialog) and the availability-dependent action buttons.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
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

/**
 * Deleting a wine is irreversible, so it takes a confirmation dialog
 * naming what is lost, and the commit is a press-and-hold rather than a
 * tap — a tap is the gesture used everywhere else and can be spent
 * before the dialog has been read.
 */
describe('WineDetailPanel - delete confirmation', () => {
  /** Hold the confirm button past the threshold. */
  function holdToConfirm() {
    const confirmButton = screen.getByLabelText('Delete')
    fireEvent.pointerDown(confirmButton, { button: 0, clientX: 0, clientY: 0 })
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    fireEvent.pointerUp(confirmButton)
  }

  it('asks before deleting, naming the wine and what is lost', () => {
    renderPanel(makeWine({ quantity_in_storage: 10, quantity_at_home: 2 }))

    fireEvent.click(screen.getByText('Delete'))

    expect(screen.queryByText('Delete R. Lopez de Heredia Vina Tondonia 2010?')).not.toBeNull()
    expect(screen.queryByText(/12 bottles will be removed/)).not.toBeNull()
  })

  it('deletes and closes once the hold completes', async () => {
    vi.useFakeTimers()
    try {
      const handlers = renderPanel(makeWine())
      fireEvent.click(screen.getByText('Delete'))

      holdToConfirm()

      await vi.waitFor(() => expect(handlers.onDelete).toHaveBeenCalledWith('wine-1'))
      expect(handlers.onClose).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not delete on a mere tap of the confirm button', async () => {
    vi.useFakeTimers()
    try {
      const handlers = renderPanel(makeWine())
      fireEvent.click(screen.getByText('Delete'))

      const confirmButton = screen.getByLabelText('Delete')
      fireEvent.pointerDown(confirmButton, { button: 0, clientX: 0, clientY: 0 })
      act(() => {
        vi.advanceTimersByTime(150)
      })
      fireEvent.pointerUp(confirmButton)

      await act(async () => {})
      expect(handlers.onDelete).not.toHaveBeenCalled()
      // ...and says why, rather than appearing broken
      expect(screen.queryByText('Keep holding to confirm')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('abandons the hold if the finger drags away, as when scrolling', async () => {
    vi.useFakeTimers()
    try {
      const handlers = renderPanel(makeWine())
      fireEvent.click(screen.getByText('Delete'))

      const confirmButton = screen.getByLabelText('Delete')
      fireEvent.pointerDown(confirmButton, { button: 0, clientX: 0, clientY: 0 })
      fireEvent.pointerMove(confirmButton, { clientX: 0, clientY: 40 })
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      fireEvent.pointerUp(confirmButton)

      await act(async () => {})
      expect(handlers.onDelete).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does nothing when the dialog is cancelled', async () => {
    const handlers = renderPanel(makeWine())

    fireEvent.click(screen.getByText('Delete'))
    fireEvent.click(screen.getByText('Cancel'))

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(handlers.onDelete).not.toHaveBeenCalled()
    expect(handlers.onClose).not.toHaveBeenCalled()
    expect(screen.queryByText(/will be removed/)).toBeNull()
  })

  it('keeps the panel open and alerts when the delete fails', async () => {
    vi.useFakeTimers()
    const alertStub = vi.fn()
    vi.stubGlobal('alert', alertStub)
    try {
      const handlers = {
        onClose: vi.fn(),
        onConsume: vi.fn(),
        onMoveToHome: vi.fn(),
        onEdit: vi.fn(),
        onDelete: vi.fn().mockRejectedValue(new Error('boom')),
      }
      render(<WineDetailPanel wine={makeWine()} {...handlers} />)
      fireEvent.click(screen.getByText('Delete'))

      holdToConfirm()

      await vi.waitFor(() => expect(alertStub).toHaveBeenCalledWith('Error: boom'))
      expect(handlers.onClose).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
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

describe('WineDetailPanel - dismissal', () => {
  it('closes from the close button (all viewports)', () => {
    const handlers = renderPanel(makeWine())
    fireEvent.click(screen.getByLabelText('Close panel'))
    expect(handlers.onClose).toHaveBeenCalled()
  })

  it('closes when the backdrop is clicked', () => {
    const handlers = renderPanel(makeWine())
    fireEvent.click(screen.getByTestId('panel-backdrop'))
    expect(handlers.onClose).toHaveBeenCalled()
  })

  it('closes on Escape', () => {
    const handlers = renderPanel(makeWine())
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(handlers.onClose).toHaveBeenCalled()
  })
})

describe('WineDetailPanel - move to home quantity', () => {
  it('defaults the stepper to everything in storage and passes the quantity', async () => {
    const handlers = renderPanel(makeWine({ quantity_in_storage: 6, quantity_at_home: 0 }))

    expect(screen.getByTestId('move-quantity').textContent).toBe('6')
    fireEvent.click(screen.getByText('Move to Home'))

    await waitFor(() => expect(handlers.onMoveToHome).toHaveBeenCalledWith('wine-1', 6))
  })

  it('steps the quantity down and clamps at 1', async () => {
    const handlers = renderPanel(makeWine({ quantity_in_storage: 2, quantity_at_home: 0 }))

    fireEvent.click(screen.getByLabelText('Fewer bottles'))
    expect(screen.getByTestId('move-quantity').textContent).toBe('1')
    // Already at the minimum; the decrement button is disabled
    expect((screen.getByLabelText('Fewer bottles') as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByText('Move to Home'))
    await waitFor(() => expect(handlers.onMoveToHome).toHaveBeenCalledWith('wine-1', 1))
  })

  it('never steps above the storage quantity', () => {
    renderPanel(makeWine({ quantity_in_storage: 3, quantity_at_home: 0 }))
    expect((screen.getByLabelText('More bottles') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('WineDetailPanel - consumption history', () => {
  it('lists recent consumption entries when provided', () => {
    const handlers = {
      onClose: vi.fn(),
      onConsume: vi.fn(),
      onMoveToHome: vi.fn(),
      onEdit: vi.fn(),
      onDelete: vi.fn(),
    }
    render(
      <WineDetailPanel
        wine={makeWine()}
        {...handlers}
        consumptionLog={[
          {
            id: 'log-1',
            wine_id: 'wine-1',
            consumed_date: '2026-03-15',
            notes: 'With the roast',
            created_at: '2026-03-15T20:00:00.000Z',
          },
        ]}
      />
    )

    expect(screen.queryByText('Consumption History')).not.toBeNull()
    expect(screen.queryByText('With the roast')).not.toBeNull()
  })

  it('omits the section when there is no history', () => {
    renderPanel(makeWine())
    expect(screen.queryByText('Consumption History')).toBeNull()
  })
})
