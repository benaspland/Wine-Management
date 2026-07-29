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
