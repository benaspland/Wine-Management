/**
 * WineForm component tests — the form's single quantity + location pair
 * must translate correctly into the split quantity_in_storage /
 * quantity_at_home fields. A regression here once imported wines with
 * undefined quantities, so the mapping is pinned for both add and edit
 * modes.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import WineForm from '../WineForm'
import type { Wine } from '../../types/index'

function setField(name: string, value: string) {
  const field = document.querySelector(`[name="${name}"]`)
  expect(field, `form field: ${name}`).not.toBeNull()
  fireEvent.change(field!, { target: { value } })
}

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
    drinking_window_start: 2020,
    drinking_window_end: 2040,
    quantity_in_storage: 10,
    quantity_at_home: 2,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('WineForm - add mode quantity mapping', () => {
  let onSubmit: Mock<(wine: Omit<Wine, 'id' | 'created_at' | 'updated_at'>) => Promise<void>>
  let onClose: Mock<() => void>

  beforeEach(() => {
    onSubmit = vi.fn().mockResolvedValue(undefined)
    onClose = vi.fn()
    render(<WineForm isOpen={true} onClose={onClose} onSubmit={onSubmit} />)
  })

  it('maps quantity to storage when location is Storage (default)', async () => {
    setField('producer', 'Château Test')
    setField('name', 'Cuvée Test')
    setField('quantity', '6')

    fireEvent.click(screen.getByText('Save Wine'))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const submitted = onSubmit.mock.calls[0][0]
    expect(submitted.quantity_in_storage).toBe(6)
    expect(submitted.quantity_at_home).toBe(0)
    // The form-only fields must not leak into the Wine record
    expect(submitted).not.toHaveProperty('location')
    expect(submitted).not.toHaveProperty('quantity')
    expect(onClose).toHaveBeenCalled()
  })

  it('maps quantity to home when location is Home', async () => {
    setField('producer', 'Château Test')
    setField('name', 'Cuvée Test')
    setField('quantity', '4')
    setField('location', 'home')

    fireEvent.click(screen.getByText('Save Wine'))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const submitted = onSubmit.mock.calls[0][0]
    expect(submitted.quantity_in_storage).toBe(0)
    expect(submitted.quantity_at_home).toBe(4)
  })

  it('requires a producer, but not a separate wine name', async () => {
    // happy-dom does not implement alert; stub the global the form calls
    const alertStub = vi.fn()
    vi.stubGlobal('alert', alertStub)

    fireEvent.click(screen.getByText('Save Wine'))

    await waitFor(() =>
      expect(alertStub).toHaveBeenCalledWith('A producer is required')
    )
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  /**
   * The second field holds different things depending on the wine. An
   * estate is its own wine, so what goes there is the appellation and it
   * is optional; anything else needs a cuvée or it cannot be told apart
   * from its siblings. Required by the form only — imported wines are
   * allowed to lack one.
   */
  it('labels the second field Appellation for an estate, and lets it be blank', async () => {
    const alertStub = vi.fn()
    vi.stubGlobal('alert', alertStub)

    setField('producer', 'Chateau Meyney')
    expect(screen.queryByText('Appellation')).not.toBeNull()
    expect(screen.queryByText('Wine Name')).toBeNull()

    fireEvent.click(screen.getByText('Save Wine'))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(alertStub).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('labels it Wine Name for everything else, and requires one', async () => {
    const alertStub = vi.fn()
    vi.stubGlobal('alert', alertStub)

    setField('producer', 'Massolino')
    expect(screen.queryByText('Wine Name')).not.toBeNull()
    expect(screen.queryByText('Appellation')).toBeNull()

    fireEvent.click(screen.getByText('Save Wine'))

    await waitFor(() => expect(alertStub).toHaveBeenCalledWith('A wine name is required'))
    expect(onSubmit).not.toHaveBeenCalled()

    // Supplying one lets it through
    setField('name', 'Barolo Margheria')
    fireEvent.click(screen.getByText('Save Wine'))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    vi.unstubAllGlobals()
  })

  it('treats a Bordeaux wine as an estate even without a château prefix', async () => {
    setField('producer', 'Some Bordeaux Estate')
    setField('region', 'Bordeaux')
    expect(screen.queryByText('Appellation')).not.toBeNull()
  })

  it('saves a producer-only wine, as a Bordeaux château has no cuvée', async () => {
    const alertStub = vi.fn()
    vi.stubGlobal('alert', alertStub)

    fireEvent.change(screen.getByPlaceholderText('e.g., Château Margaux'), {
      target: { value: 'Chateau Meyney' },
    })
    fireEvent.click(screen.getByText('Save Wine'))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const submitted = onSubmit.mock.calls[0][0]
    expect(submitted.producer).toBe('Chateau Meyney')
    expect(submitted.name).toBe('')
    expect(alertStub).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('WineForm - purchase price', () => {
  it('maps a positive price to purchase_price', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<WineForm isOpen={true} onClose={vi.fn()} onSubmit={onSubmit} />)

    setField('producer', 'Château Test')
    setField('name', 'Cuvée Test')
    setField('purchase_price', '32.50')
    fireEvent.click(screen.getByText('Save Wine'))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].purchase_price).toBe(32.5)
  })

  it('leaves the price unset when the field is empty', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<WineForm isOpen={true} onClose={vi.fn()} onSubmit={onSubmit} />)

    setField('producer', 'Château Test')
    setField('name', 'Cuvée Test')
    fireEvent.click(screen.getByText('Save Wine'))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].purchase_price).toBeUndefined()
  })

  it('shows the stored price when editing', () => {
    render(
      <WineForm
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        initialWine={makeWine({ purchase_price: 45 })}
      />
    )
    const field = document.querySelector('[name="purchase_price"]') as HTMLInputElement
    expect(field.value).toBe('45')
  })
})

describe('WineForm - edit mode quantity mapping', () => {
  it('shows the combined bottle count and keeps home bottles when reducing quantity', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <WineForm
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={onSubmit}
        initialWine={makeWine({ quantity_in_storage: 10, quantity_at_home: 2 })}
      />
    )

    // Storage 10 + home 2 render as a single quantity of 12
    const quantityField = document.querySelector('[name="quantity"]') as HTMLInputElement
    expect(quantityField.value).toBe('12')

    setField('quantity', '8')
    fireEvent.click(screen.getByText('Save Wine'))

    // Bottles at home stay at home; the reduction comes out of storage
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const submitted = onSubmit.mock.calls[0][0]
    expect(submitted.quantity_at_home).toBe(2)
    expect(submitted.quantity_in_storage).toBe(6)
  })

  it('caps home bottles at the new total when reducing below the home count', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <WineForm
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={onSubmit}
        initialWine={makeWine({ quantity_in_storage: 10, quantity_at_home: 2 })}
      />
    )

    setField('quantity', '1')
    fireEvent.click(screen.getByText('Save Wine'))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const submitted = onSubmit.mock.calls[0][0]
    expect(submitted.quantity_at_home).toBe(1)
    expect(submitted.quantity_in_storage).toBe(0)
  })

  it('surfaces a submit failure via alert and keeps the form open', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('capacity exceeded'))
    const onClose = vi.fn()
    const alertStub = vi.fn()
    vi.stubGlobal('alert', alertStub)

    render(
      <WineForm isOpen={true} onClose={onClose} onSubmit={onSubmit} initialWine={makeWine()} />
    )

    fireEvent.click(screen.getByText('Save Wine'))

    await waitFor(() => expect(alertStub).toHaveBeenCalledWith('Error: capacity exceeded'))
    expect(onClose).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

/**
 * Tier is chosen from a <select>, which hands back a string — and it was
 * the one numeric field missing from the form's parse list. The workflow
 * rejects a tier that is not an integer, so choosing a new tier threw,
 * the store swallowed the error, and the form closed as though it had
 * saved. Nothing changed and nothing said why.
 */
describe('WineForm - tier', () => {
  let onSubmit: Mock<(wine: Omit<Wine, 'id' | 'created_at' | 'updated_at'>) => Promise<void>>

  beforeEach(() => {
    onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<WineForm isOpen={true} onClose={vi.fn()} onSubmit={onSubmit} />)
  })

  it('submits the tier as a number, not the string the select gives', async () => {
    setField('producer', 'Château Test')
    setField('name', 'Cuvée Test')
    setField('tier', '5')

    fireEvent.click(screen.getByText('Save Wine'))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const submitted = onSubmit.mock.calls[0][0]
    expect(submitted.tier).toBe(5)
    expect(typeof submitted.tier).toBe('number')
    // Number.isInteger('5') is false, which is what rejected the edit
    expect(Number.isInteger(submitted.tier)).toBe(true)
  })
})

/**
 * Numbers are kept as typed and converted once, on save.
 *
 * Parsing on every keystroke meant an emptied field refilled itself with
 * 0 on the very keystroke that cleared it, so the zero could not be
 * deleted — and "13." collapsed to "13" before the decimal arrived.
 */
describe('WineForm - numeric fields', () => {
  let onSubmit: Mock<(wine: Omit<Wine, 'id' | 'created_at' | 'updated_at'>) => Promise<void>>

  beforeEach(() => {
    onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<WineForm isOpen={true} onClose={vi.fn()} onSubmit={onSubmit} />)
  })

  const field = (name: string) => document.querySelector(`[name="${name}"]`) as HTMLInputElement

  it('lets a numeric field be emptied and stay empty', () => {
    setField('alcohol_percent', '13')
    expect(field('alcohol_percent').value).toBe('13')

    setField('alcohol_percent', '')
    expect(field('alcohol_percent').value).toBe('')
  })

  it('keeps a decimal exactly as typed', () => {
    // Not asserting the half-typed "13." — a real <input type="number">
    // sanitises that away itself, and happy-dom does not, so the
    // assertion would describe the test environment rather than a browser
    setField('alcohol_percent', '13.5')
    expect(field('alcohol_percent').value).toBe('13.5')
  })

  it('stores a blank as unrecorded rather than zero', async () => {
    setField('producer', 'Château Test')
    setField('name', 'Cuvée Test')
    setField('alcohol_percent', '')

    fireEvent.click(screen.getByText('Save Wine'))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    // A wine with no ABV recorded must not claim to be 0%
    expect(onSubmit.mock.calls[0][0].alcohol_percent).toBeUndefined()
  })

  it('converts what was typed into numbers on save', async () => {
    setField('producer', 'Château Test')
    setField('name', 'Cuvée Test')
    setField('alcohol_percent', '13.5')
    setField('vintage', '2018')

    fireEvent.click(screen.getByText('Save Wine'))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const submitted = onSubmit.mock.calls[0][0]
    expect(submitted.alcohol_percent).toBe(13.5)
    expect(submitted.vintage).toBe(2018)
    expect(typeof submitted.vintage).toBe('number')
  })

  it('refuses a blank vintage rather than filing the wine under year zero', async () => {
    const alerted = vi.fn()
    vi.stubGlobal('alert', alerted)
    setField('producer', 'Château Test')
    setField('name', 'Cuvée Test')
    setField('vintage', '')

    fireEvent.click(screen.getByText('Save Wine'))

    await waitFor(() => expect(alerted).toHaveBeenCalled())
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
