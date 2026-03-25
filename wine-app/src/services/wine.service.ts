import type { Wine } from '../types/index'
import * as db from './database'

export class WineService {
  // Get wines with filtering and sorting
  static async getWines(filters?: {
    location?: 'home' | 'storage' | 'all'
    tier?: number
    country?: string
    searchTerm?: string
    sortBy?: 'vintage' | 'tier' | 'producer'
  }) {
    let wines = await db.getWines(filters?.location && filters.location !== 'all' ? filters.location : undefined)

    // Apply filters
    if (filters?.tier) {
      wines = wines.filter(w => w.tier === filters.tier)
    }
    if (filters?.country) {
      wines = wines.filter(w => w.country === filters.country)
    }
    if (filters?.searchTerm) {
      const term = filters.searchTerm.toLowerCase()
      wines = wines.filter(
        w =>
          w.producer.toLowerCase().includes(term) ||
          w.name.toLowerCase().includes(term) ||
          w.region.toLowerCase().includes(term)
      )
    }

    // Apply sorting
    if (filters?.sortBy === 'tier') {
      wines.sort((a, b) => b.tier - a.tier)
    } else if (filters?.sortBy === 'producer') {
      wines.sort((a, b) => a.producer.localeCompare(b.producer))
    } else {
      wines.sort((a, b) => b.vintage - a.vintage)
    }

    return wines
  }

  // Get wine statistics
  static async getStats() {
    const allWines = await db.getWines()
    const homeWines = await db.getWines('home')
    const storageWines = await db.getWines('storage')

    const totalBottles = allWines.reduce((sum, w) => sum + w.quantity, 0)
    const homeBottles = homeWines.reduce((sum, w) => sum + w.quantity, 0)
    const storageBottles = storageWines.reduce((sum, w) => sum + w.quantity, 0)

    // Count by tier
    const byTier: Record<number, number> = {}
    allWines.forEach(w => {
      byTier[w.tier] = (byTier[w.tier] || 0) + w.quantity
    })

    // Count by country
    const byCountry: Record<string, number> = {}
    allWines.forEach(w => {
      byCountry[w.country] = (byCountry[w.country] || 0) + w.quantity
    })

    return {
      totalWines: allWines.length,
      totalBottles,
      homeWines: homeWines.length,
      homeBottles,
      storageWines: storageWines.length,
      storageBottles,
      byTier,
      byCountry,
    }
  }

  // Get wine detail with additional metadata
  static async getWineDetail(id: string) {
    const wine = await db.getWine(id)
    if (!wine) return null

    const consumptionLog = await db.getConsumptionLog(id)
    const currentYear = new Date().getFullYear()
    const yearsConsumed = consumptionLog.filter(
      log => log.consumed_at.startsWith(currentYear.toString())
    ).length

    // Calculate drinking status
    const now = currentYear
    let status = 'Awaiting Window'
    if (now >= wine.drinking_window_start && now <= wine.drinking_window_end) {
      status = 'In Window'
    } else if (now > wine.drinking_window_end) {
      status = 'Past Window'
    } else if (now >= wine.drinking_window_start - 2) {
      status = 'Approaching Window'
    }

    return {
      wine,
      consumptionLog,
      yearsConsumed,
      drinkingStatus: status,
      peakYear: Math.floor((wine.drinking_window_start + wine.drinking_window_end) / 2),
    }
  }

  // Check if wine can be consumed (within window)
  static canConsume(wine: Wine): boolean {
    const now = new Date().getFullYear()
    return now >= wine.drinking_window_start && now <= wine.drinking_window_end
  }

  // Get drinking window label
  static getDrinkingWindowLabel(wine: Wine): string {
    const now = new Date().getFullYear()

    if (now < wine.drinking_window_start) {
      return `Wait (${wine.drinking_window_start})`
    } else if (now >= wine.drinking_window_start && now <= wine.drinking_window_end) {
      return 'Ready to Drink'
    } else if (now > wine.drinking_window_end - 2 && now < wine.drinking_window_end) {
      return 'Peak'
    } else if (now === wine.drinking_window_end) {
      return 'Last Year'
    } else {
      return 'Past Peak'
    }
  }
}
