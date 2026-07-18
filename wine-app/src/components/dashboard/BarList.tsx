/**
 * Horizontal bar list: label · thin bar · direct value label. Single
 * hue on purpose — bar length carries the magnitude, so color has no
 * job here (identity lives in the row labels).
 */

import { Link } from 'react-router-dom'

export interface BarListRow {
  label: string
  value: number
  /** When set, the row is a link (e.g. to a pre-filtered cellar view). */
  to?: string
  onClick?: () => void
}

interface BarListProps {
  rows: BarListRow[]
  /** Fill color; defaults to the theme accent. */
  color?: string
}

const ROW_GRID = 'grid grid-cols-[minmax(72px,30%)_1fr_auto] items-center gap-3 text-sm'

export default function BarList({ rows, color = '#ffbf00' }: BarListProps) {
  const max = Math.max(1, ...rows.map(r => r.value))

  return (
    <ul className="space-y-2.5">
      {rows.map(row => {
        const cells = (
          <>
            <span className="text-on-surface-variant truncate" title={row.label}>
              {row.label}
            </span>
            <span className="h-2 rounded-full bg-surface-container-high overflow-hidden">
              <span
                className="block h-full rounded-full"
                style={{ width: `${(row.value / max) * 100}%`, backgroundColor: color }}
                title={`${row.label}: ${row.value}`}
              />
            </span>
            <span className="text-on-surface font-medium tabular-nums">{row.value}</span>
          </>
        )

        return (
          <li key={row.label}>
            {row.to ? (
              <Link
                to={row.to}
                onClick={row.onClick}
                aria-label={`Show ${row.label} wines`}
                className={`${ROW_GRID} rounded-lg -mx-2 px-2 py-0.5 hover:bg-surface-container-high/60 transition-colors`}
              >
                {cells}
              </Link>
            ) : (
              <div className={ROW_GRID}>{cells}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
