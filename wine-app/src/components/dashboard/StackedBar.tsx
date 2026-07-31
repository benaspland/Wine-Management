import { Link } from 'react-router-dom'

/**
 * One horizontal bar showing how a whole divides, with a legend naming
 * each part.
 *
 * It replaced a donut, which cost a third of the card's width to say
 * the same thing and clipped its own labels; and it replaced a meter
 * pointed at the home-storage split, which framed a plain division as a
 * score out of an arbitrary ceiling.
 */

export interface BarSegment {
  label: string
  value: number
  /** Any CSS colour — callers pass skin tokens, e.g. rgb(var(--wine-red)). */
  color: string
  to?: string
  onClick?: () => void
}

interface StackedBarProps {
  segments: BarSegment[]
  /** Appended to each legend count, e.g. "bottles". */
  unit?: string
  ariaLabel: string
}

/** A segment this thin is invisible; a cellar with one rosé still owns it. */
const MIN_VISIBLE_PERCENT = 1.5

export default function StackedBar({ segments, unit, ariaLabel }: StackedBarProps) {
  const present = segments.filter(segment => segment.value > 0)
  const total = present.reduce((sum, segment) => sum + segment.value, 0)
  if (total === 0) return null

  const widths = present.map(segment =>
    Math.max((segment.value / total) * 100, MIN_VISIBLE_PERCENT)
  )
  const scale = 100 / widths.reduce((sum, width) => sum + width, 0)

  return (
    <div>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-surface-container-highest"
        role="img"
        aria-label={ariaLabel}
      >
        {present.map((segment, i) => (
          <div
            key={segment.label}
            style={{ width: `${widths[i] * scale}%`, backgroundColor: segment.color }}
            title={`${segment.label}: ${segment.value}`}
          />
        ))}
      </div>

      <ul className="mt-4 space-y-2.5">
        {present.map(segment => {
          const row = (
            <>
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: segment.color }}
              />
              <span className="truncate min-w-0">{segment.label}</span>
              <span className="ml-auto shrink-0 tabular-nums text-on-surface font-medium">
                {segment.value}
                {unit ? <span className="text-outline font-normal"> {unit}</span> : null}
              </span>
            </>
          )

          return (
            <li key={segment.label} className="text-sm text-on-surface-variant">
              {segment.to ? (
                <Link
                  to={segment.to}
                  onClick={segment.onClick}
                  className="flex items-center gap-2.5 hover:text-on-surface transition-colors"
                >
                  {row}
                </Link>
              ) : (
                <div className="flex items-center gap-2.5">{row}</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
