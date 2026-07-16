import type { Wine } from '../types/index'
import LocationBadge from './LocationBadge'
import { Wine as WineIcon } from 'lucide-react'

interface WineListRowProps {
  wine: Wine
  onSelect: (wine: Wine) => void
  onConsume: (wineId: string) => Promise<void>
  isLoading?: boolean
}

const TIER_DOT: Record<number, string> = {
  5: 'bg-primary-container',
  4: 'bg-on-surface',
  3: 'bg-primary/60',
  2: 'bg-outline',
  1: 'bg-outline-variant',
}

/**
 * Compact row for the list view: scannable at 125-wine scale where the
 * card grid is not. One row ≈ one glance: what it is, where it is,
 * drink it now.
 */
export default function WineListRow({ wine, onSelect, onConsume, isLoading }: WineListRowProps) {
  const handleConsume = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (wine.quantity_at_home === 0) return
    await onConsume(wine.id)
  }

  return (
    <div
      onClick={() => onSelect(wine)}
      className="flex items-center gap-3 px-4 py-3 bg-surface-container-low hover:bg-surface-container rounded-2xl cursor-pointer transition-colors"
    >
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${TIER_DOT[wine.tier]}`}
        title={`Tier ${wine.tier}`}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-on-surface truncate">
          {wine.producer} {wine.name}
        </p>
        <p className="text-xs text-outline truncate">
          {wine.vintage} · {wine.region}
        </p>
      </div>
      <LocationBadge wine={wine} />
      <button
        onClick={handleConsume}
        disabled={wine.quantity_at_home === 0 || isLoading}
        title={wine.quantity_at_home === 0 ? 'No bottles at home to drink' : 'Mark one bottle as consumed'}
        aria-label={`Drink ${wine.producer} ${wine.name}`}
        className="min-h-11 min-w-11 shrink-0 flex items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant hover:bg-primary-container hover:text-on-primary disabled:opacity-40 disabled:hover:bg-surface-container-highest disabled:hover:text-on-surface-variant transition-colors"
      >
        <WineIcon size={18} aria-hidden="true" />
      </button>
    </div>
  )
}
