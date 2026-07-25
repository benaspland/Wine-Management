import type { ReactNode } from 'react'
import { useLongPress } from '../hooks/useLongPress'

/**
 * A button with two actions: tap, and press-and-hold. The hold fills
 * visibly as you go — without that feedback the gesture is invisible,
 * and a user who starts holding has no idea anything is happening.
 *
 * Keyboard activation always runs the tap action, so the hold is never
 * the only way to reach something.
 */

interface HoldButtonProps {
  onTap: () => void
  onHold: () => void
  children: ReactNode
  /** How the hold renders: a sweep around a round button, or a bar. */
  progressStyle?: 'ring' | 'fill'
  progressColor?: string
  durationMs?: number
  disabled?: boolean
  className?: string
  title?: string
  'aria-label': string
  'data-testid'?: string
}

export default function HoldButton({
  onTap,
  onHold,
  children,
  progressStyle = 'ring',
  progressColor = 'rgba(255, 255, 255, 0.45)',
  durationMs,
  disabled,
  className = '',
  title,
  'aria-label': ariaLabel,
  'data-testid': testId,
}: HoldButtonProps) {
  const { progress, handlers } = useLongPress({ onTap, onLongPress: onHold, durationMs, disabled })

  const { style: gestureStyle, ...events } = handlers

  return (
    <button
      {...events}
      type="button"
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      data-testid={testId}
      style={gestureStyle}
      className={`relative overflow-hidden ${className}`}
    >
      {progress > 0 && (
        <span
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={
            progressStyle === 'ring'
              ? {
                  background: `conic-gradient(${progressColor} ${progress * 360}deg, transparent 0deg)`,
                }
              : {
                  background: progressColor,
                  transform: `scaleX(${progress})`,
                  transformOrigin: 'left',
                }
          }
        />
      )}
      <span className="relative flex items-center justify-center gap-2">{children}</span>
    </button>
  )
}
