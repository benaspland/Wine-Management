import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Tap vs press-and-hold on one control.
 *
 * Touch makes this fiddly in ways a naive setTimeout misses: the button
 * usually sits in a scrolling list, so a drag must abort the hold or
 * scrolling past it fires the long press; Android wants to select text
 * and raise a context menu on hold; and the browser still delivers a
 * click after the hold finishes, which would run both actions.
 *
 * `progress` (0-1) is exposed so the control can show the hold filling,
 * which is what tells the user the gesture exists at all.
 */

export interface LongPressOptions {
  onTap: () => void
  onLongPress: () => void
  /** Hold duration before the long press fires. */
  durationMs?: number
  /** Movement that cancels the hold, treating it as a scroll. */
  moveTolerancePx?: number
  disabled?: boolean
}

const DEFAULT_DURATION_MS = 500
const DEFAULT_MOVE_TOLERANCE_PX = 10
const PROGRESS_TICK_MS = 16

export function useLongPress({
  onTap,
  onLongPress,
  durationMs = DEFAULT_DURATION_MS,
  moveTolerancePx = DEFAULT_MOVE_TOLERANCE_PX,
  disabled = false,
}: LongPressOptions) {
  const [progress, setProgress] = useState(0)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null)
  const origin = useRef<{ x: number; y: number } | null>(null)
  // Set when the hold completes so the trailing click is ignored
  const longPressFired = useRef(false)

  const clearTimers = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (ticker.current) {
      clearInterval(ticker.current)
      ticker.current = null
    }
    setProgress(0)
  }, [])

  // A press in flight when the component unmounts must not fire
  useEffect(() => clearTimers, [clearTimers])

  const start = useCallback(
    (event: React.PointerEvent) => {
      if (disabled) return
      // Ignore secondary mouse buttons; touch and pen have button 0
      if (event.button !== 0) return

      longPressFired.current = false
      origin.current = { x: event.clientX, y: event.clientY }

      const startedAt = Date.now()
      ticker.current = setInterval(() => {
        setProgress(Math.min(1, (Date.now() - startedAt) / durationMs))
      }, PROGRESS_TICK_MS)

      timer.current = setTimeout(() => {
        longPressFired.current = true
        clearTimers()
        // Confirm the gesture physically; unsupported on iOS Safari
        navigator.vibrate?.(10)
        onLongPress()
      }, durationMs)
    },
    [clearTimers, disabled, durationMs, onLongPress]
  )

  const move = useCallback(
    (event: React.PointerEvent) => {
      if (!origin.current || !timer.current) return
      const dx = Math.abs(event.clientX - origin.current.x)
      const dy = Math.abs(event.clientY - origin.current.y)
      // Treat it as a scroll, not a hold
      if (dx > moveTolerancePx || dy > moveTolerancePx) clearTimers()
    },
    [clearTimers, moveTolerancePx]
  )

  const end = useCallback(() => {
    const wasPending = timer.current !== null
    clearTimers()
    origin.current = null
    // Released before the threshold: an ordinary tap
    if (wasPending && !longPressFired.current && !disabled) onTap()
  }, [clearTimers, disabled, onTap])

  const cancel = useCallback(() => {
    clearTimers()
    origin.current = null
  }, [clearTimers])

  return {
    /** 0-1 while held, for a fill or ring animation. */
    progress,
    handlers: {
      onPointerDown: start,
      onPointerMove: move,
      onPointerUp: end,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      // Keyboard and assistive tech never see the hold, so a plain
      // activation must still work — and must not double-fire after
      // the pointer sequence already handled it.
      onClick: (event: React.MouseEvent) => {
        event.preventDefault()
        // These buttons sit inside clickable cards and rows; without
        // this the trailing click also opens the detail panel
        event.stopPropagation()
        // detail === 0 means keyboard activation, which produces no
        // pointer sequence, so the tap action has not run yet
        if (event.detail === 0 && !disabled) onTap()
      },
      onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
      style: {
        touchAction: 'manipulation',
        WebkitTouchCallout: 'none',
        userSelect: 'none',
      } as React.CSSProperties,
    },
  }
}
