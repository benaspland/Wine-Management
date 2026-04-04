import { create } from 'zustand'
import type { Wine, CellarConfig } from '../types/index'
import * as db from '../services/database'
import * as workflows from '../services/workflows.service'

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
  sortBy: 'vintage' | 'tier' | 'producer'

  // Actions
  loadWines: () => Promise<void>
  addWine: (wine: Omit<Wine, 'id' | 'created_at' | 'updated_at'>) => Promise<void>
  editWineDetails: (id: string, updates: Partial<Wine>) => Promise<void>
  addBottles: (wineId: string, quantity: number, destination: 'storage' | 'home') => Promise<void>
  consumeWine: (wineId: string, consumedDate?: string, notes?: string) => Promise<void>
  moveWineToHome: (wineId: string, quantity: number) => Promise<void>
  deleteWine: (id: string) => Promise<void>

  selectWine: (wine: Wine | null) => void
  setLocationFilter: (filter: 'all' | 'storage' | 'home') => void
  setTierFilter: (tier: number | null) => void
  setSearchTerm: (term: string) => void
  setRegionFilter: (region: string | null) => void
  setCountryFilter: (country: string | null) => void
  setWineTypeFilter: (type: string | null) => void
  setSortBy: (sort: 'vintage' | 'tier' | 'producer') => void
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
  sortBy: 'vintage',

  loadWines: async () => {
    set({ loading: true, error: null })
    try {
      const wines = await db.getAllWines()
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
      get().triggerScheduleUpdate()
    } catch (error) {
      set({ error: (error as Error).message })
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
    } finally {
      set({ loading: false })
    }
  },

  consumeWine: async (wineId, consumedDate, notes) => {
    set({ error: null })
    try {
      const today = new Date().toISOString().split('T')[0]
      await workflows.consumeWine(wineId, consumedDate || today, notes)
      await get().loadWines()
      get().triggerScheduleUpdate()
      if (get().selectedWine?.id === wineId) {
        const updated = await db.getWineById(wineId)
        set({ selectedWine: updated })
      }
    } catch (error) {
      set({ error: (error as Error).message })
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

  setSortBy: (sort) => {
    set({ sortBy: sort })
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
      sortBy,
    } = get()

    let filtered = wines

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

    // Apply sorting
    if (sortBy === 'tier') {
      filtered.sort((a, b) => b.tier - a.tier)
    } else if (sortBy === 'producer') {
      filtered.sort((a, b) => (a.producer || '').localeCompare(b.producer || ''))
    } else {
      filtered.sort((a, b) => b.vintage - a.vintage)
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
    }
  },
}))
