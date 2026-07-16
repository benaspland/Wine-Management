import { useMemo } from 'react'
import { useWineStore } from '../store/wineStore'
import { X } from 'lucide-react'

interface FilterDrawerProps {
  open: boolean
  onClose: () => void
}

const selectClass =
  'w-full bg-surface-container-low text-on-surface px-3 py-2 rounded border border-outline-variant/20 focus:outline-none focus:border-primary text-sm'
const labelClass = 'block text-xs text-outline mb-1 uppercase tracking-wider'

/**
 * Slide-in drawer exposing the store's full filter set and sort order.
 * Search lives in the page header (always visible), not in here.
 */
export default function FilterDrawer({ open, onClose }: FilterDrawerProps) {
  const wines = useWineStore(state => state.wines)
  const filteredWines = useWineStore(state => state.filteredWines)

  const locationFilter = useWineStore(state => state.locationFilter)
  const setLocationFilter = useWineStore(state => state.setLocationFilter)
  const tierFilter = useWineStore(state => state.tierFilter)
  const setTierFilter = useWineStore(state => state.setTierFilter)
  const regionFilter = useWineStore(state => state.regionFilter)
  const setRegionFilter = useWineStore(state => state.setRegionFilter)
  const countryFilter = useWineStore(state => state.countryFilter)
  const setCountryFilter = useWineStore(state => state.setCountryFilter)
  const wineTypeFilter = useWineStore(state => state.wineTypeFilter)
  const setWineTypeFilter = useWineStore(state => state.setWineTypeFilter)
  const formatFilter = useWineStore(state => state.formatFilter)
  const setFormatFilter = useWineStore(state => state.setFormatFilter)
  const windowFilter = useWineStore(state => state.windowFilter)
  const setWindowFilter = useWineStore(state => state.setWindowFilter)
  const sortBy = useWineStore(state => state.sortBy)
  const setSortBy = useWineStore(state => state.setSortBy)
  const clearFilters = useWineStore(state => state.clearFilters)

  const options = useMemo(() => {
    const unique = (values: Array<string | undefined>) =>
      [...new Set(values.filter((v): v is string => !!v))].sort()
    return {
      regions: unique(wines.map(w => w.region)),
      countries: unique(wines.map(w => w.country)),
      types: unique(wines.map(w => w.wine_type)),
      formats: unique(wines.map(w => w.format)),
    }
  }, [wines])

  if (!open) return null

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        className="fixed inset-0 bg-black/40 z-40"
      />
      <div className="fixed left-0 top-0 h-full w-80 max-w-[85vw] bg-surface-container-low border-r border-outline-variant/30 z-50 flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-outline-variant/10">
          <h2 className="font-headline text-xl font-bold text-on-surface">Filter & Sort</h2>
          <button onClick={onClose} aria-label="Close filters" className="text-outline hover:text-on-surface">
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div>
            <label className={labelClass}>Location</label>
            <select
              value={locationFilter}
              onChange={e => setLocationFilter(e.target.value as 'all' | 'home' | 'storage')}
              className={selectClass}
            >
              <option value="all">All Locations</option>
              <option value="home">At Home</option>
              <option value="storage">In Storage</option>
            </select>
          </div>

          <div>
            <label className={labelClass}>Tier</label>
            <select
              value={tierFilter ?? ''}
              onChange={e => setTierFilter(e.target.value ? parseInt(e.target.value) : null)}
              className={selectClass}
            >
              <option value="">All Tiers</option>
              <option value="1">1 - Everyday</option>
              <option value="2">2 - Quality</option>
              <option value="3">3 - Fine</option>
              <option value="4">4 - Premium</option>
              <option value="5">5 - Icon</option>
            </select>
          </div>

          <div>
            <label className={labelClass}>Drinking window</label>
            <select
              value={windowFilter}
              onChange={e => setWindowFilter(e.target.value as 'all' | 'ready' | 'closing' | 'waiting')}
              className={selectClass}
            >
              <option value="all">Any Window</option>
              <option value="ready">Ready to Drink</option>
              <option value="closing">Closing Soon</option>
              <option value="waiting">Still Waiting</option>
            </select>
          </div>

          <div>
            <label className={labelClass}>Region</label>
            <select
              value={regionFilter ?? ''}
              onChange={e => setRegionFilter(e.target.value || null)}
              className={selectClass}
            >
              <option value="">All Regions</option>
              {options.regions.map(region => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Country</label>
            <select
              value={countryFilter ?? ''}
              onChange={e => setCountryFilter(e.target.value || null)}
              className={selectClass}
            >
              <option value="">All Countries</option>
              {options.countries.map(country => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Wine Type</label>
            <select
              value={wineTypeFilter ?? ''}
              onChange={e => setWineTypeFilter(e.target.value || null)}
              className={selectClass}
            >
              <option value="">All Types</option>
              {options.types.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Format</label>
            <select
              value={formatFilter ?? ''}
              onChange={e => setFormatFilter(e.target.value || null)}
              className={selectClass}
            >
              <option value="">All Formats</option>
              {options.formats.map(format => (
                <option key={format} value={format}>{format}</option>
              ))}
            </select>
          </div>

          <div className="pt-2 border-t border-outline-variant/10">
            <label className={labelClass}>Sort By</label>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as 'vintage' | 'tier' | 'producer' | 'window')}
              className={selectClass}
            >
              <option value="vintage">Vintage (newest first)</option>
              <option value="tier">Tier (highest first)</option>
              <option value="producer">Producer (A–Z)</option>
              <option value="window">Window urgency (closing first)</option>
            </select>
          </div>
        </div>

        <div className="p-6 border-t border-outline-variant/10 space-y-3">
          <p className="text-xs text-outline text-center">
            Showing {filteredWines.length} of {wines.length} wines
          </p>
          <button
            onClick={clearFilters}
            className="w-full border border-outline-variant/30 text-outline-variant hover:text-outline py-2 text-xs tracking-widest uppercase font-bold rounded transition-colors"
          >
            Clear Filters
          </button>
        </div>
      </div>
    </>
  )
}
