/**
 * A single ratio against a real limit. The fill carries severity (accent
 * until near the limit, danger at/over it); the track is a dim step of
 * the same hue so the whole bar reads as one control.
 *
 * Only use this where the maximum is a genuine ceiling — a meter reads
 * as a score out of a target, so pointing one at a soft planning figure
 * turns an assumption into a grade.
 */

interface MeterProps {
  label: string
  value: number
  max: number
  /** Text after the numbers, e.g. "bottles". */
  unit?: string
  caption?: string
}

const ACCENT = '#ffbf00'
const DANGER = '#e66767'

export default function Meter({ label, value, max, unit, caption }: MeterProps) {
  const fraction = max > 0 ? Math.min(1, value / max) : 0
  const nearLimit = max > 0 && value / max >= 0.95
  const fill = nearLimit ? DANGER : ACCENT

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm text-on-surface-variant">{label}</span>
        <span className="text-sm text-on-surface font-semibold">
          {value} <span className="text-outline font-normal">/ {max}{unit ? ` ${unit}` : ''}</span>
        </span>
      </div>
      <div
        className="relative h-2.5 rounded-full overflow-hidden"
        style={{ backgroundColor: 'rgba(255, 191, 0, 0.14)' }}
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${fraction * 100}%`, backgroundColor: fill }}
        />
      </div>
      {caption && <p className="text-xs text-outline mt-1.5">{caption}</p>}
    </div>
  )
}
