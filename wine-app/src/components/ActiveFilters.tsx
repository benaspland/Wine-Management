import { X } from 'lucide-react'
import { useWineStore } from '../store/wineStore'
import { TIER_LABELS } from '../types/index'
import type { Tier } from '../types/index'

/**
 * The filters currently narrowing the collection, each removable on its
 * own.
 *
 * Without this the only sign a filter is on is a count badge on the
 * drawer button — so a tap-through from the dashboard lands you on a
 * collection that is quietly hiding four fifths of your wines, with no
 * way to see which rule did it or undo it short of opening the drawer
 * and reading every control.
 */

interface Chip {
  id: string
  label: string
  clear: () => void
}

const LOCATION_LABELS = { home: 'At home', storage: 'In storage' } as const
const WINDOW_LABELS = {
  ready: 'Ready to drink',
  closing: 'Closing soon',
  waiting: 'Still waiting',
} as const

export default function ActiveFilters() {
  const locationFilter = useWineStore(state => state.locationFilter)
  const tierFilter = useWineStore(state => state.tierFilter)
  const regionFilter = useWineStore(state => state.regionFilter)
  const countryFilter = useWineStore(state => state.countryFilter)
  const wineTypeFilter = useWineStore(state => state.wineTypeFilter)
  const formatFilter = useWineStore(state => state.formatFilter)
  const windowFilter = useWineStore(state => state.windowFilter)

  const setLocationFilter = useWineStore(state => state.setLocationFilter)
  const setTierFilter = useWineStore(state => state.setTierFilter)
  const setRegionFilter = useWineStore(state => state.setRegionFilter)
  const setCountryFilter = useWineStore(state => state.setCountryFilter)
  const setWineTypeFilter = useWineStore(state => state.setWineTypeFilter)
  const setFormatFilter = useWineStore(state => state.setFormatFilter)
  const setWindowFilter = useWineStore(state => state.setWindowFilter)

  const chips: Chip[] = []
  if (locationFilter !== 'all') {
    chips.push({
      id: 'location',
      label: LOCATION_LABELS[locationFilter],
      clear: () => setLocationFilter('all'),
    })
  }
  if (windowFilter !== 'all') {
    chips.push({
      id: 'window',
      label: WINDOW_LABELS[windowFilter],
      clear: () => setWindowFilter('all'),
    })
  }
  if (tierFilter !== null) {
    // TIER_LABELS is upper-case for the card badges; a chip row reads as
    // a sentence, so it gets sentence case here.
    const tier = TIER_LABELS[tierFilter as Tier]
    chips.push({
      id: 'tier',
      label: tier ? tier.charAt(0) + tier.slice(1).toLowerCase() : `Tier ${tierFilter}`,
      clear: () => setTierFilter(null),
    })
  }
  if (regionFilter) {
    chips.push({ id: 'region', label: regionFilter, clear: () => setRegionFilter(null) })
  }
  if (countryFilter) {
    chips.push({ id: 'country', label: countryFilter, clear: () => setCountryFilter(null) })
  }
  if (wineTypeFilter) {
    chips.push({ id: 'type', label: wineTypeFilter, clear: () => setWineTypeFilter(null) })
  }
  if (formatFilter) {
    chips.push({ id: 'format', label: formatFilter, clear: () => setFormatFilter(null) })
  }

  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map(chip => (
        <button
          key={chip.id}
          onClick={chip.clear}
          aria-label={`Remove filter: ${chip.label}`}
          className="group flex items-center gap-1.5 rounded-full bg-surface-container-high pl-3 pr-2 py-1.5 text-xs text-on-surface-variant hover:text-on-surface transition-colors"
        >
          {chip.label}
          <X size={12} className="text-outline group-hover:text-on-surface" aria-hidden="true" />
        </button>
      ))}
      {chips.length > 1 && (
        // Clears the filters, not the search box: the search term is
        // visible in its own field and is the user's typing, not a rule
        // this row is showing them.
        <button
          onClick={() => chips.forEach(chip => chip.clear())}
          className="px-1 text-xs text-outline hover:text-on-surface transition-colors"
        >
          Clear all
        </button>
      )}
    </div>
  )
}
