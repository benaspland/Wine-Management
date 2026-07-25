/**
 * Tap versus press-and-hold. The interesting cases are not the happy
 * path but the ways a hold must NOT fire: a finger that drags because
 * the user is scrolling the list the button sits in, a release before
 * the threshold, and the click the browser delivers after a hold —
 * which would otherwise run both actions on one press.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import HoldButton from '../HoldButton'

function setup(props: Partial<React.ComponentProps<typeof HoldButton>> = {}) {
  const onTap = vi.fn()
  const onHold = vi.fn()
  render(
    <HoldButton onTap={onTap} onHold={onHold} aria-label="Drink" {...props}>
      Drink
    </HoldButton>
  )
  return { onTap, onHold, button: screen.getByLabelText('Drink') }
}

const press = (button: HTMLElement, extra: Record<string, number> = {}) =>
  fireEvent.pointerDown(button, { button: 0, clientX: 0, clientY: 0, ...extra })

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('HoldButton', () => {
  it('runs the tap action on a quick press and release', () => {
    const { onTap, onHold, button } = setup()

    press(button)
    act(() => {
      vi.advanceTimersByTime(100)
    })
    fireEvent.pointerUp(button)

    expect(onTap).toHaveBeenCalledTimes(1)
    expect(onHold).not.toHaveBeenCalled()
  })

  it('runs the hold action once the threshold passes', () => {
    const { onTap, onHold, button } = setup()

    press(button)
    act(() => {
      vi.advanceTimersByTime(600)
    })

    expect(onHold).toHaveBeenCalledTimes(1)
    expect(onTap).not.toHaveBeenCalled()
  })

  it('does not also tap when the press is released after a hold', () => {
    const { onTap, onHold, button } = setup()

    press(button)
    act(() => {
      vi.advanceTimersByTime(600)
    })
    fireEvent.pointerUp(button)
    // The browser still delivers a click after the pointer sequence
    fireEvent.click(button, { detail: 1 })

    expect(onHold).toHaveBeenCalledTimes(1)
    expect(onTap).not.toHaveBeenCalled()
  })

  it('cancels the hold when the finger drags away, as when scrolling', () => {
    const { onTap, onHold, button } = setup()

    press(button)
    fireEvent.pointerMove(button, { clientX: 0, clientY: 40 })
    act(() => {
      vi.advanceTimersByTime(600)
    })
    fireEvent.pointerUp(button)

    expect(onHold).not.toHaveBeenCalled()
    // A cancelled hold is not a tap either — the user was scrolling
    expect(onTap).not.toHaveBeenCalled()
  })

  it('tolerates small movement, since fingers are never still', () => {
    const { onHold, button } = setup()

    press(button)
    fireEvent.pointerMove(button, { clientX: 3, clientY: 2 })
    act(() => {
      vi.advanceTimersByTime(600)
    })

    expect(onHold).toHaveBeenCalledTimes(1)
  })

  it('cancels when the pointer is interrupted', () => {
    const { onTap, onHold, button } = setup()

    press(button)
    fireEvent.pointerCancel(button)
    act(() => {
      vi.advanceTimersByTime(600)
    })

    expect(onHold).not.toHaveBeenCalled()
    expect(onTap).not.toHaveBeenCalled()
  })

  it('runs the tap action for keyboard activation, which has no hold', () => {
    const { onTap, onHold, button } = setup()

    // detail === 0 marks a synthesised click from Enter/Space
    fireEvent.click(button, { detail: 0 })

    expect(onTap).toHaveBeenCalledTimes(1)
    expect(onHold).not.toHaveBeenCalled()
  })

  it('does nothing at all when disabled', () => {
    const { onTap, onHold, button } = setup({ disabled: true })

    press(button)
    act(() => {
      vi.advanceTimersByTime(600)
    })
    fireEvent.pointerUp(button)
    fireEvent.click(button, { detail: 0 })

    expect(onTap).not.toHaveBeenCalled()
    expect(onHold).not.toHaveBeenCalled()
  })

  it('does not fire a pending hold after unmounting', () => {
    const onHold = vi.fn()
    const { unmount } = render(
      <HoldButton onTap={vi.fn()} onHold={onHold} aria-label="Drink">
        Drink
      </HoldButton>
    )
    press(screen.getByLabelText('Drink'))

    unmount()
    act(() => {
      vi.advanceTimersByTime(600)
    })

    expect(onHold).not.toHaveBeenCalled()
  })
})
