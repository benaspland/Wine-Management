import { create } from 'zustand'
import type { Wine, CellarConfig, ConsumptionLogEntry } from '../types/index'
import * as db from '../services/database'
import * as workflows from '../services/workflows.service'
import { CLOSING_SOON_YEARS } from '../services/dashboard.service'

export type SortKey = 'vintage' | 'tier' | 'producer' | 'window' | 'purchased'
export type SortDirection = 'asc' | 'desc'

/**
 * Which way round each sort starts.
 *
 * "Ascending" has to mean the same thing everywhere for a direction
 * toggle to be honest, so every comparator below is written ascending
 * on its own value and the direction flips it. But the useful end
 * differs by key — newest vintage, highest tier and most recent
 * purchase are what you want first, while A–Z and the soonest-closing
 * window are not — so each key opens on its own default and the toggle
 * takes it from there.
 */
const DEFAULT_DIRECTION: Record<SortKey, SortDirection> = {
  vintage: 'desc',
  tier: 'desc',
  purchased: 'desc',
  producer: 'asc',
  window: 'asc',
}

/**
 * What each direction is called, per key.
 *
 * "Ascending" is precise and useless: nobody thinks of a 2008 as less
 * than a 2019. Each key says which end it puts first in its own terms,
 * and the drawer and the cellar's toggle read from the same table so
 * they cannot describe the same order differently.
 */
export const SORT_LABELS: Record<
  SortKey,
  { name: string; asc: { long: string; short: string }; desc: { long: string; short: string } }
> = {
  vintage: {
    name: 'Vintage',
    asc: { long: 'Oldest first', short: 'Oldest' },
    desc: { long: 'Newest first', short: 'Newest' },
  },
  tier: {
    name: 'Tier',
    asc: { long: 'Lowest first', short: 'Lowest' },
    desc: { long: 'Highest first', short: 'Highest' },
  },
  producer: {
    name: 'Producer',
    asc: { long: 'A to Z', short: 'A–Z' },
    desc: { long: 'Z to A', short: 'Z–A' },
  },
  window: {
    name: 'Drinking window',
    asc: { long: 'Closing first', short: 'Closing' },
    desc: { long: 'Furthest first', short: 'Furthest' },
  },
  purchased: {
    name: 'Purchase date',
    asc: { long: 'Oldest first', short: 'Oldest' },
    desc: { long: 'Newest first', short: 'Newest' },
  },
}

/** Ascending comparators, one per sort key. Direction is applied after. */
const COMPARATORS: Record<SortKey, (a: Wine, b: Wine) => number> = {
  vintage: (a, b) => a.vintage - b.vintage,
  tier: (a, b) => a.tier - b.tier,
  producer: (a, b) => (a.producer || '').localeCompare(b.producer || ''),
  window: (a, b) => a.drinking_window_end - b.drinking_window_end,
  purchased: (a, b) => (a.purchase_date ?? '').localeCompare(b.purchase_date ?? ''),
}

interface WineStore {
  wines: Wine[]
  filteredWines: Wine[]
  selectedWine: Wine | null
  loading: boolean
  error: string | null
  scheduleUpdateTrigger: number // Timestamp for schedule regeneration triggers

  // Filters
  locationFilter: 'all' | 'storage' | 'home'
  tierFilter: number | null
  searchTerm: string
  regionFilter: string | null
  countryFilter: string | null
  wineTypeFilter: string | null
  formatFilter: string | null
  windowFilter: 'all' | 'ready' | 'closing' | 'waiting'
  sortBy: SortKey
  sortDirection: SortDirection

  // Actions
  loadWines: () => Promise<void>
  addWine: (wine: Omit<Wine, 'id' | 'created_at' | 'updated_at'>) => Promise<void>
  editWineDetails: (id: string, updates: Partial<Wine>) => Promise<void>
  addBottles: (wineId: string, quantity: number, destination: 'storage' | 'home') => Promise<void>
  consumeWine: (wineId: string, consumedDate?: string, notes?: string, reason?: string) => Promise<ConsumptionLogEntry>
  undoConsume: (logEntryId: string) => Promise<void>
  moveWineToHome: (wineId: string, quantity: number) => Promise<void>
  deleteWine: (id: string) => Promise<void>

  selectWine: (wine: Wine | null) => void
  setLocationFilter: (filter: 'all' | 'storage' | 'home') => void
  setTierFilter: (tier: number | null) => void
  setSearchTerm: (term: string) => void
  setRegionFilter: (region: string | null) => void
  setCountryFilter: (country: string | null) => void
  setWineTypeFilter: (type: string | null) => void
  setFormatFilter: (format: string | null) => void
  setWindowFilter: (filter: 'all' | 'ready' | 'closing' | 'waiting') => void
  setSortBy: (sort: SortKey) => void
  toggleSortDirection: () => void
  applyFilters: () => void
  clearFilters: () => void
  triggerScheduleUpdate: () => void

  getCellarConfig: () => Promise<CellarConfig>
  updateCellarConfig: (updates: Partial<CellarConfig>) => Promise<void>
}

export const useWineStore = create<WineStore>((set, get) => ({
  wines: [],
  filteredWines: [],
  selectedWine: null,
  loading: false,
  error: null,
  scheduleUpdateTrigger: 0,

  locationFilter: 'all',
  tierFilter: null,
  searchTerm: '',
  regionFilter: null,
  countryFilter: null,
  wineTypeFilter: null,
  formatFilter: null,
  windowFilter: 'all',
  sortBy: 'vintage',
  sortDirection: DEFAULT_DIRECTION.vintage,

  loadWines: async () => {
    set({ loading: true, error: null })
    try {
      const wines = await db.getAllWines()
      set({ wines })
      get().applyFilters()
    } catch (error) {
      set({ error: (error as Error).message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  addWine: async (wine) => {
    set({ loading: true, error: null })
    try {
      await db.createWine(wine)
      await get().loadWines()
      get().triggerScheduleUpdate()
    } catch (error) {
      set({ error: (error as Error).message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  editWineDetails: async (id, updates) => {
    set({ loading: true, error: null })
    try {
      await workflows.editWineDetails(id, updates)
      await get().loadWines()
      if (get().selectedWine?.id === id) {
        const updated = await db.getWineById(id)
        set({ selectedWine: updated })
      }
      get().triggerScheduleUpdate()
    } catch (error) {
      set({ error: (error as Error).message })
      // Rethrow: the form closes when its submit resolves, so
      // swallowing this here made a rejected edit look like a saved
      // one — the panel shut, nothing changed, and nothing said why.
      throw error
    } finally {
      set({ loading: false })
    }
  },

  addBottles: async (wineId, quantity, destination) => {
    set({ loading: true, error: null })
    try {
      await workflows.addBottles(wineId, quantity, destination)
      await get().loadWines()
      if (get().selectedWine?.id === wineId) {
        const updated = await db.getWineById(wineId)
        set({ selectedWine: updated })
      }
      get().triggerScheduleUpdate()
    } catch (error) {
      set({ error: (error as Error).message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  consumeWine: async (wineId, consumedDate, notes, reason) => {
    set({ error: null })
    try {
      const today = new Date().toISOString().split('T')[0]
      const entry = await workflows.consumeWine(wineId, consumedDate || today, notes, reason)
      await get().loadWines()
      get().triggerScheduleUpdate()
      if (get().selectedWine?.id === wineId) {
        const updated = await db.getWineById(wineId)
        set({ selectedWine: updated })
      }
      return entry
    } catch (error) {
      set({ error: (error as Error).message })
      // Rethrow so the UI can show contextual feedback (toast/alert)
      throw error
    }
  },

  undoConsume: async (logEntryId) => {
    set({ error: null })
    try {
      await workflows.undoConsumeWine(logEntryId)
      await get().loadWines()
      get().triggerScheduleUpdate()
    } catch (error) {
      set({ error: (error as Error).message })
      throw error
    }
  },

  moveWineToHome: async (wineId, quantity) => {
    set({ error: null })
    try {
      await workflows.moveToHome(wineId, quantity)
      await get().loadWines()
      get().triggerScheduleUpdate()
      if (get().selectedWine?.id === wineId) {
        const updated = await db.getWineById(wineId)
        set({ selectedWine: updated })
      }
    } catch (error) {
      set({ error: (error as Error).message })
      throw error
    }
  },

  deleteWine: async (id) => {
    set({ loading: true, error: null })
    try {
      await db.deleteWine(id)
      await get().loadWines()
      if (get().selectedWine?.id === id) {
        set({ selectedWine: null })
      }
    } catch (error) {
      set({ error: (error as Error).message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  selectWine: (wine) => {
    set({ selectedWine: wine })
  },

  setLocationFilter: (filter) => {
    set({ locationFilter: filter })
    get().applyFilters()
  },

  setTierFilter: (tier) => {
    set({ tierFilter: tier })
    get().applyFilters()
  },

  setSearchTerm: (term) => {
    set({ searchTerm: term })
    get().applyFilters()
  },

  setRegionFilter: (region) => {
    set({ regionFilter: region })
    get().applyFilters()
  },

  setCountryFilter: (country) => {
    set({ countryFilter: country })
    get().applyFilters()
  },

  setWineTypeFilter: (type) => {
    set({ wineTypeFilter: type })
    get().applyFilters()
  },

  setFormatFilter: (format) => {
    set({ formatFilter: format })
    get().applyFilters()
  },

  setWindowFilter: (filter) => {
    set({ windowFilter: filter })
    get().applyFilters()
  },

  setSortBy: (sort) => {
    // Changing the key resets to that key's useful end, so picking
    // "Vintage" still lands on the newest and "Producer" on A–Z. Keeping
    // the old direction would mean choosing Producer and getting Z–A
    // because you had last reversed the vintages.
    set({ sortBy: sort, sortDirection: DEFAULT_DIRECTION[sort] })
    get().applyFilters()
  },

  toggleSortDirection: () => {
    set({ sortDirection: get().sortDirection === 'asc' ? 'desc' : 'asc' })
    get().applyFilters()
  },

  clearFilters: () => {
    set({
      locationFilter: 'all',
      tierFilter: null,
      searchTerm: '',
      regionFilter: null,
      countryFilter: null,
      wineTypeFilter: null,
      formatFilter: null,
      windowFilter: 'all',
    })
    get().applyFilters()
  },

  applyFilters: () => {
    const {
      wines,
      locationFilter,
      tierFilter,
      searchTerm,
      regionFilter,
      countryFilter,
      wineTypeFilter,
      formatFilter,
      windowFilter,
      sortBy,
      sortDirection,
    } = get()

    // Copy so the in-place sort below never mutates the canonical wines array
    let filtered = [...wines]

    // Filter by location (storage vs home)
    if (locationFilter !== 'all') {
      if (locationFilter === 'storage') {
        filtered = filtered.filter((w) => w.quantity_in_storage > 0)
      } else if (locationFilter === 'home') {
        filtered = filtered.filter((w) => w.quantity_at_home > 0)
      }
    }

    if (tierFilter) {
      filtered = filtered.filter((w) => w.tier === tierFilter)
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(
        (w) =>
          w.name.toLowerCase().includes(term) ||
          (w.producer && w.producer.toLowerCase().includes(term)) ||
          w.region.toLowerCase().includes(term)
      )
    }

    if (regionFilter) {
      filtered = filtered.filter((w) => w.region === regionFilter)
    }

    if (countryFilter) {
      filtered = filtered.filter((w) => w.country === countryFilter)
    }

    if (wineTypeFilter) {
      filtered = filtered.filter((w) => w.wine_type === wineTypeFilter)
    }

    if (formatFilter) {
      filtered = filtered.filter((w) => w.format === formatFilter)
    }

    // Drinking-window state relative to the current year
    if (windowFilter !== 'all') {
      const year = new Date().getFullYear()
      if (windowFilter === 'ready') {
        filtered = filtered.filter(
          (w) => w.drinking_window_start <= year && year <= w.drinking_window_end
        )
      } else if (windowFilter === 'closing') {
        filtered = filtered.filter(
          (w) =>
            w.drinking_window_start <= year &&
            year <= w.drinking_window_end &&
            w.drinking_window_end <= year + CLOSING_SOON_YEARS
        )
      } else if (windowFilter === 'waiting') {
        filtered = filtered.filter((w) => w.drinking_window_start > year)
      }
    }

    // Apply sorting: one ascending comparator per key, reversed for
    // descending. A wine with no purchase date recorded has nothing to
    // sort by, so it sits at the end whichever way round the list is —
    // reversing shouldn't promote the wines you know least about to the
    // top.
    const compare = COMPARATORS[sortBy] ?? COMPARATORS.vintage
    const flip = sortDirection === 'desc' ? -1 : 1
    if (sortBy === 'purchased') {
      filtered.sort((a, b) => {
        if (!a.purchase_date && !b.purchase_date) return 0
        if (!a.purchase_date) return 1
        if (!b.purchase_date) return -1
        return flip * compare(a, b)
      })
    } else {
      filtered.sort((a, b) => flip * compare(a, b))
    }

    set({ filteredWines: filtered })
  },

  triggerScheduleUpdate: () => {
    set({ scheduleUpdateTrigger: Date.now() })
  },

  getCellarConfig: async () => {
    return db.getCellarConfig()
  },

  updateCellarConfig: async (updates) => {
    set({ error: null })
    try {
      await workflows.updateCellarConfig(updates)
    } catch (error) {
      set({ error: (error as Error).message })
      throw error
    }
  },
}))
