import { useWineStore } from '../store/wineStore'
import { useIsDesktop } from '../hooks/useMediaQuery'
import { useMemo, useState } from 'react'

export default function FilterPanel() {
  const isDesktop = useIsDesktop()
  const [isOpen, setIsOpen] = useState(false)

  const wines = useWineStore(state => state.wines)
  const locationFilter = useWineStore(state => state.locationFilter)
  const tierFilter = useWineStore(state => state.tierFilter)
  const searchTerm = useWineStore(state => state.searchTerm)
  const regionFilter = useWineStore(state => state.regionFilter)
  const countryFilter = useWineStore(state => state.countryFilter)
  const wineTypeFilter = useWineStore(state => state.wineTypeFilter)
  const formatFilter = useWineStore(state => state.formatFilter)
  const sortBy = useWineStore(state => state.sortBy)

  const setLocationFilter = useWineStore(state => state.setLocationFilter)
  const setTierFilter = useWineStore(state => state.setTierFilter)
  const setSearchTerm = useWineStore(state => state.setSearchTerm)
  const setRegionFilter = useWineStore(state => state.setRegionFilter)
  const setCountryFilter = useWineStore(state => state.setCountryFilter)
  const setWineTypeFilter = useWineStore(state => state.setWineTypeFilter)
  const setFormatFilter = useWineStore(state => state.setFormatFilter)
  const setSortBy = useWineStore(state => state.setSortBy)
  const clearFilters = useWineStore(state => state.clearFilters)

  // Get unique values from wines for filter options
  const uniqueRegions = useMemo(() => [...new Set(wines.map(w => w.region))].sort(), [wines])
  const uniqueCountries = useMemo(() => [...new Set(wines.map(w => w.country))].sort(), [wines])
  const uniqueWineTypes = useMemo(
    () => [...new Set(wines.map(w => w.wine_type))].sort(),
    [wines]
  )
  const uniqueFormats = useMemo(
    () => [...new Set(wines.map(w => w.format))].sort(),
    [wines]
  )

  const hasActiveFilters =
    locationFilter !== 'all' ||
    tierFilter ||
    searchTerm ||
    regionFilter ||
    countryFilter ||
    wineTypeFilter ||
    formatFilter

  // Filter content component
  const FilterContent = () => (
    <>
      {/* Search */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-outline mb-2">Search</label>
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Producer, wine name, region..."
          className="w-full px-4 py-2 bg-surface-container border border-outline-variant/30 rounded text-on-surface placeholder-outline-variant focus:outline-none focus:border-primary"
        />
      </div>

      {/* Filters Grid */}
      <div className="space-y-4 mb-6">
        {/* Location */}
        <div>
          <label className="block text-sm font-medium text-outline mb-2">Location</label>
          <select
            value={locationFilter}
            onChange={e => setLocationFilter(e.target.value as 'all' | 'home' | 'storage')}
            className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 rounded text-on-surface focus:outline-none focus:border-primary"
          >
            <option value="all">All</option>
            <option value="home">Home</option>
            <option value="storage">Storage</option>
          </select>
        </div>

        {/* Tier */}
        <div>
          <label className="block text-sm font-medium text-outline mb-2">Tier</label>
          <select
            value={tierFilter || ''}
            onChange={e => setTierFilter(e.target.value ? parseInt(e.target.value) : null)}
            className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 rounded text-on-surface focus:outline-none focus:border-primary"
          >
            <option value="">All Tiers</option>
            <option value="1">1 - Everyday</option>
            <option value="2">2 - Quality</option>
            <option value="3">3 - Fine</option>
            <option value="4">4 - Premium</option>
            <option value="5">5 - Icon</option>
          </select>
        </div>

        {/* Country */}
        <div>
          <label className="block text-sm font-medium text-outline mb-2">Country</label>
          <select
            value={countryFilter || ''}
            onChange={e => setCountryFilter(e.target.value || null)}
            className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 rounded text-on-surface focus:outline-none focus:border-primary"
          >
            <option value="">All Countries</option>
            {uniqueCountries.map(country => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
        </div>

        {/* Region */}
        <div>
          <label className="block text-sm font-medium text-outline mb-2">Region</label>
          <select
            value={regionFilter || ''}
            onChange={e => setRegionFilter(e.target.value || null)}
            className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 rounded text-on-surface focus:outline-none focus:border-primary"
          >
            <option value="">All Regions</option>
            {uniqueRegions.map(region => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
        </div>

        {/* Wine Type */}
        <div>
          <label className="block text-sm font-medium text-outline mb-2">Wine Type</label>
          <select
            value={wineTypeFilter || ''}
            onChange={e => setWineTypeFilter(e.target.value || null)}
            className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 rounded text-on-surface focus:outline-none focus:border-primary"
          >
            <option value="">All Types</option>
            {uniqueWineTypes.map(type => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        {/* Format */}
        <div>
          <label className="block text-sm font-medium text-outline mb-2">Format</label>
          <select
            value={formatFilter || ''}
            onChange={e => setFormatFilter(e.target.value || null)}
            className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 rounded text-on-surface focus:outline-none focus:border-primary"
          >
            <option value="">All Formats</option>
            {uniqueFormats.map(format => (
              <option key={format} value={format}>
                {format}
              </option>
            ))}
          </select>
        </div>

        {/* Sort By */}
        <div>
          <label className="block text-sm font-medium text-outline mb-2">Sort By</label>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as 'vintage' | 'tier' | 'producer')}
            className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 rounded text-on-surface focus:outline-none focus:border-primary"
          >
            <option value="vintage">Vintage (newest)</option>
            <option value="tier">Tier (highest)</option>
            <option value="producer">Producer (A-Z)</option>
          </select>
        </div>
      </div>

      {/* Clear Filters Button */}
      {hasActiveFilters && (
        <button
          onClick={clearFilters}
          className="w-full px-4 py-2 text-sm bg-primary-container text-on-primary hover:opacity-90 rounded font-medium transition-opacity"
        >
          Clear All Filters
        </button>
      )}
    </>
  )

  // Desktop: Side Drawer
  if (isDesktop) {
    return (
      <>
        {/* Filter Toggle Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="fixed top-6 left-6 z-40 p-2 bg-primary-container text-on-primary rounded-lg hover:opacity-90 transition-opacity md:relative md:mb-6 md:top-0 md:left-0"
          title="Toggle filters"
        >
          <span className="material-symbols-outlined">tune</span>
        </button>

        {/* Side Drawer Overlay */}
        {isOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-30 md:hidden"
            onClick={() => setIsOpen(false)}
          />
        )}

        {/* Side Drawer */}
        <div
          className={`fixed left-0 top-0 h-screen w-80 bg-surface-container-low border-r border-outline-variant/10 p-6 overflow-y-auto z-40 transition-transform duration-300 ${
            isOpen ? 'translate-x-0' : '-translate-x-full'
          } md:relative md:translate-x-0 md:h-auto md:w-auto md:border-r-0 md:border-b md:p-6 md:mb-8 md:rounded-lg`}
        >
          {/* Close Button (Mobile) */}
          <button
            onClick={() => setIsOpen(false)}
            className="absolute top-4 right-4 p-2 hover:bg-surface-container rounded md:hidden"
          >
            <span className="material-symbols-outlined">close</span>
          </button>

          {/* Drawer Title */}
          <h2 className="text-lg font-semibold text-on-surface mb-6 mt-8 md:hidden">Filters</h2>

          {/* Filter Content */}
          <FilterContent />
        </div>
      </>
    )
  }

  // Mobile: Bottom Sheet
  return (
    <>
      {/* Filter Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full mb-6 p-3 bg-primary-container text-on-primary rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2 font-medium"
      >
        <span className="material-symbols-outlined">tune</span>
        Filters
      </button>

      {/* Bottom Sheet Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Bottom Sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 bg-surface-container-low rounded-t-2xl p-6 z-40 transition-transform duration-300 max-h-[80vh] overflow-y-auto ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* Handle Bar */}
        <div className="flex justify-center mb-4">
          <div className="w-12 h-1 bg-outline-variant/30 rounded-full" />
        </div>

        {/* Sheet Title */}
        <h2 className="text-lg font-semibold text-on-surface mb-6">Filters</h2>

        {/* Filter Content */}
        <FilterContent />
      </div>
    </>
  )
}
