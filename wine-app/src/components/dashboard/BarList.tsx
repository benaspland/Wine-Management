/**
 * Horizontal bar list: label · thin bar · direct value label. Single
 * hue on purpose — bar length carries the magnitude, so color has no
 * job here (identity lives in the row labels).
 */

export interface BarListRow {
  label: string
  value: number
}

interface BarListProps {
  rows: BarListRow[]
  /** Fill color; defaults to the theme accent. */
  color?: string
}

export default function BarList({ rows, color = '#ffbf00' }: BarListProps) {
  const max = Math.max(1, ...rows.map(r => r.value))

  return (
    <ul className="space-y-2.5">
      {rows.map(row => (
        <li key={row.label} className="grid grid-cols-[minmax(72px,30%)_1fr_auto] items-center gap-3 text-sm">
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
        </li>
      ))}
    </ul>
  )
}
