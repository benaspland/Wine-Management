/**
 * Part-to-whole donut for a small (≤5) set of categories. Colors come
 * from a CVD-validated categorical palette (see dashboard page) and are
 * assigned to categories in fixed canonical order — never by rank — so
 * a category keeps its color as the data changes. Identity is never
 * color-alone: the legend carries labels and values.
 */

import { Link } from 'react-router-dom'

export interface DonutSegment {
  label: string
  value: number
  color: string
  /** When set, the legend row is a link (e.g. to a pre-filtered cellar view). */
  to?: string
  onClick?: () => void
}

interface DonutChartProps {
  segments: DonutSegment[]
  /** Text in the middle of the donut, e.g. the total. */
  centerValue: string
  centerLabel: string
}

const SIZE = 160
const STROKE = 22
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
/** 2px visual gap between segments, per mark-spacing rules. */
const GAP = 2

export default function DonutChart({ segments, centerValue, centerLabel }: DonutChartProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  if (total === 0) return null

  // Gaps only make sense between 2+ segments
  const gap = segments.length > 1 ? GAP : 0

  const arcs = segments.map((segment, i) => {
    const fraction = segment.value / total
    const length = Math.max(0, fraction * CIRCUMFERENCE - gap)
    const offset = segments
      .slice(0, i)
      .reduce((sum, s) => sum + (s.value / total) * CIRCUMFERENCE, 0)
    return { ...segment, length, offset }
  })

  return (
    <div className="flex items-center gap-6">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`${centerLabel}: ${segments.map(s => `${s.label} ${s.value}`).join(', ')}`}
        className="shrink-0 -rotate-90"
      >
        {arcs.map(arc => (
          <circle
            key={arc.label}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={arc.color}
            strokeWidth={STROKE}
            strokeDasharray={`${arc.length} ${CIRCUMFERENCE - arc.length}`}
            strokeDashoffset={-arc.offset}
          >
            <title>{`${arc.label}: ${arc.value}`}</title>
          </circle>
        ))}
        <g className="rotate-90" style={{ transformOrigin: 'center' }}>
          <text
            x="50%"
            y="47%"
            textAnchor="middle"
            className="fill-on-surface font-sans font-semibold"
            fontSize="26"
          >
            {centerValue}
          </text>
          <text x="50%" y="61%" textAnchor="middle" className="fill-outline" fontSize="10">
            {centerLabel}
          </text>
        </g>
      </svg>

      <ul className="space-y-2 min-w-0">
        {segments.map(segment => {
          const cells = (
            <>
              <span
                className="w-3 h-3 rounded-sm shrink-0"
                style={{ backgroundColor: segment.color }}
                aria-hidden="true"
              />
              <span className="text-on-surface-variant truncate">{segment.label}</span>
              <span className="text-on-surface font-medium ml-auto pl-3">{segment.value}</span>
            </>
          )
          return (
            <li key={segment.label}>
              {segment.to ? (
                <Link
                  to={segment.to}
                  onClick={segment.onClick}
                  aria-label={`Show ${segment.label} wines`}
                  className="flex items-center gap-2 text-sm rounded-lg -mx-2 px-2 py-0.5 hover:bg-surface-container-high/60 transition-colors"
                >
                  {cells}
                </Link>
              ) : (
                <div className="flex items-center gap-2 text-sm">{cells}</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
