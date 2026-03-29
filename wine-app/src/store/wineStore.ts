import { create } from 'zustand'
import type { Wine } from '../types/index'
import * as db from '../services/database'
import { WineService } from '../services/wine.service'

interface WineStore {
  wines: Wine[]
  filteredWines: Wine[]
  selectedWine: Wine | null
  loading: boolean
  error: string | null
  scheduleUpdateTrigger: number // Timestamp for schedule regeneration triggers

  // Filters
  locationFilter: 'all' | 'home' | 'storage'
  tierFilter: number | null
  searchTerm: string
  regionFilter: string | null
  countryFilter: string | null
  wineTypeFilter: string | null
  formatFilter: string | null
  sortBy: 'vintage' | 'tier' | 'producer'

  // Actions
  loadWines: () => Promise<void>
  addWine: (wine: Omit<Wine, 'id' | 'created_at' | 'updated_at'>) => Promise<void>
  updateWine: (id: string, updates: Partial<Wine>) => Promise<void>
  deleteWine: (id: string) => Promise<void>
  consumeWine: (wineId: string, quantity?: number) => Promise<void>
  moveWineToHome: (wineId: string) => Promise<void>
  delayWineFromDelivery: (wineId: string, deliveryDate: string) => Promise<void>
  deduplicateWines: () => Promise<void>

  selectWine: (wine: Wine | null) => void
  setLocationFilter: (filter: 'all' | 'home' | 'storage') => void
  setTierFilter: (tier: number | null) => void
  setSearchTerm: (term: string) => void
  setRegionFilter: (region: string | null) => void
  setCountryFilter: (country: string | null) => void
  setWineTypeFilter: (type: string | null) => void
  setFormatFilter: (format: string | null) => void
  setSortBy: (sort: 'vintage' | 'tier' | 'producer') => void
  applyFilters: () => void
  clearFilters: () => void
  triggerScheduleUpdate: () => void // Notify schedules to regenerate

  getStats: () => Promise<any>
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
  sortBy: 'vintage',

  loadWines: async () => {
    set({ loading: true, error: null })
    try {
      // Always fetch ALL wines (no filters at service level)
      // Filtering happens in applyFilters() for UI display
      const wines = await WineService.getWines()
      set({ wines })
      get().applyFilters()
    } catch (error) {
      set({ error: (error as Error).message })
    } finally {
      set({ loading: false })
    }
  },

  addWine: async (wine) => {
    set({ loading: true, error: null })
    try {
      await db.createWine(wine)
      await get().loadWines()
      get().triggerScheduleUpdate() // Regenerate schedules after adding wine
    } catch (error) {
      set({ error: (error as Error).message })
    } finally {
      set({ loading: false })
    }
  },

  updateWine: async (id, updates) => {
    set({ loading: true, error: null })
    try {
      await db.updateWine(id, updates)
      await get().loadWines()
      if (get().selectedWine?.id === id) {
        set({ selectedWine: await db.getWine(id) })
      }
    } catch (error) {
      set({ error: (error as Error).message })
    } finally {
      set({ loading: false })
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
    } finally {
      set({ loading: false })
    }
  },

  consumeWine: async (wineId, quantity = 1) => {
    set({ error: null })
    try {
      await db.consumeWine(wineId, quantity)
      await get().loadWines()
      get().triggerScheduleUpdate() // Regenerate schedules after consumption
      if (get().selectedWine?.id === wineId) {
        set({ selectedWine: await db.getWine(wineId) })
      }
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  moveWineToHome: async (wineId) => {
    set({ error: null })
    try {
      await db.moveWineLocation(wineId, 'home')
      await get().loadWines()
      if (get().selectedWine?.id === wineId) {
        set({ selectedWine: await db.getWine(wineId) })
      }
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  delayWineFromDelivery: async (wineId, deliveryDate) => {
    set({ error: null })
    try {
      await db.delayWineFromDelivery(wineId, deliveryDate)
      get().triggerScheduleUpdate() // Regenerate future deliveries with delayed wine
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  deduplicateWines: async () => {
    set({ loading: true, error: null })
    try {
      await db.deduplicateWines()
      await get().loadWines()
      set({ selectedWine: null })
    } catch (error) {
      set({ error: (error as Error).message })
    } finally {
      set({ loading: false })
    }
  },

  selectWine: (wine) => {
    set({ selectedWine: wine })
  },

  setLocationFilter: (filter) => {
    set({ locationFilter: filter })
    get().loadWines()
  },

  setTierFilter: (tier) => {
    set({ tierFilter: tier })
    get().loadWines()
  },

  setSearchTerm: (term) => {
    set({ searchTerm: term })
    get().loadWines()
  },

  setRegionFilter: (region) => {
    set({ regionFilter: region })
    get().loadWines()
  },

  setCountryFilter: (country) => {
    set({ countryFilter: country })
    get().loadWines()
  },

  setWineTypeFilter: (type) => {
    set({ wineTypeFilter: type })
    get().loadWines()
  },

  setFormatFilter: (format) => {
    set({ formatFilter: format })
    get().loadWines()
  },

  setSortBy: (sort) => {
    set({ sortBy: sort })
    get().loadWines()
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
    })
    get().loadWines()
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
      sortBy,
    } = get()

    let filtered = wines

    if (locationFilter !== 'all') {
      filtered = filtered.filter(w => w.location === locationFilter)
    }

    if (tierFilter) {
      filtered = filtered.filter(w => w.tier === tierFilter)
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(
        w =>
          w.producer.toLowerCase().includes(term) ||
          w.name.toLowerCase().includes(term) ||
          w.region.toLowerCase().includes(term)
      )
    }

    if (regionFilter) {
      filtered = filtered.filter(w => w.region === regionFilter)
    }

    if (countryFilter) {
      filtered = filtered.filter(w => w.country === countryFilter)
    }

    if (wineTypeFilter) {
      filtered = filtered.filter(w => w.wine_type === wineTypeFilter)
    }

    if (formatFilter) {
      filtered = filtered.filter(w => w.format === formatFilter)
    }

    if (sortBy === 'tier') {
      filtered.sort((a, b) => b.tier - a.tier)
    } else if (sortBy === 'producer') {
      filtered.sort((a, b) => a.producer.localeCompare(b.producer))
    } else {
      filtered.sort((a, b) => b.vintage - a.vintage)
    }

    set({ filteredWines: filtered })
  },

  triggerScheduleUpdate: () => {
    set({ scheduleUpdateTrigger: Date.now() })
  },

  getStats: async () => {
    return WineService.getStats()
  },
}))
