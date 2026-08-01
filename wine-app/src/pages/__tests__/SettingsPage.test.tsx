/**
 * The cellar settings are numbers you edit by hand, and every one of
 * them refused to be cleared: they were parsed on each keystroke with
 * `parseInt(value) || default`, so backspacing the last digit produced
 * an empty string, then NaN, then the default. Clearing "12" to type
 * "15" put 30 in the box instead — a value you never chose, saved as
 * though you had.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SettingsPage from '../SettingsPage'
import * as db from '../../services/database'

vi.mock('../../store/wineStore', () => ({
  useWineStore: (selector: (s: unknown) => unknown) =>
    selector({
      wines: [],
      loadWines: vi.fn(),
      triggerScheduleUpdate: vi.fn(),
    }),
}))

vi.mock('../../store/toastStore', () => ({
  useToastStore: (selector: (s: unknown) => unknown) => selector({ show: vi.fn() }),
}))

const labelled = (text: string) =>
  screen
    .getByText(new RegExp(text))
    .parentElement!.querySelector('input') as HTMLInputElement

describe('SettingsPage - numeric fields', () => {
  beforeEach(async () => {
    vi.spyOn(db, 'getCellarConfig').mockResolvedValue({
      id: 1,
      max_home_capacity: 80,
      annual_consumption_target: 12,
      min_delivery_bottles: 24,
      updated_at: '2026-01-01T00:00:00.000Z',
    })
    vi.spyOn(db, 'updateCellarConfig').mockResolvedValue(undefined as never)
    render(<SettingsPage />)
    await waitFor(() => expect(labelled('Annual Consumption Target').value).toBe('12'))
  })

  afterEach(() => vi.restoreAllMocks())

  it.each([
    ['Annual Consumption Target', '12'],
    ['Maximum Cellar Capacity', '80'],
    ['Minimum Delivery', '24'],
  ])('lets %s be emptied and stay empty', (label, initial) => {
    const field = labelled(label)
    expect(field.value).toBe(initial)

    fireEvent.change(field, { target: { value: '' } })
    expect(field.value).toBe('')
  })

  it('keeps what you type next, rather than a default', () => {
    const field = labelled('Annual Consumption Target')
    fireEvent.change(field, { target: { value: '' } })
    fireEvent.change(field, { target: { value: '1' } })
    fireEvent.change(field, { target: { value: '15' } })
    expect(field.value).toBe('15')
  })

  it('saves the numbers actually typed', async () => {
    fireEvent.change(labelled('Annual Consumption Target'), { target: { value: '' } })
    fireEvent.change(labelled('Annual Consumption Target'), { target: { value: '15' } })
    fireEvent.click(screen.getByText(/Save Settings/))

    await waitFor(() => expect(db.updateCellarConfig).toHaveBeenCalledTimes(1))
    expect(vi.mocked(db.updateCellarConfig).mock.calls[0][0]).toMatchObject({
      max_home_capacity: 80,
      annual_consumption_target: 15,
      min_delivery_bottles: 24,
    })
  })

  it('refuses to save a blank rather than inventing a default', async () => {
    fireEvent.change(labelled('Annual Consumption Target'), { target: { value: '' } })
    fireEvent.click(screen.getByText(/Save Settings/))

    await waitFor(() => expect(screen.getByText(/needs a number/)).toBeTruthy())
    expect(db.updateCellarConfig).not.toHaveBeenCalled()
  })
})
