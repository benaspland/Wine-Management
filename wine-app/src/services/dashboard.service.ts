import type { Wine } from '../types/index'
import type { DeliveryDisplayEntry } from './schedule.service'

/**
 * Pure computations behind the Overview dashboard. Everything here is
 * derived from data the app already holds — no new persistence.
 */

export interface TypeSlice {
  label: string
  bottles: number
}

export interface RegionBar {
  label: string
  bottles: number
}

export interface TierBar {
  tier: number
  label: string
  wines: number
}

export interface DrinkFirstWine {
  id: string
  name: string
  producer?: string
  vintage: number
  windowEnd: number
  /** Inside the closing-soon horizon — worth flagging, not just listing. */
  urgent: boolean
}

export interface WindowWatch {
  readyWines: number
  waitingWines: number
  /** In-window wines whose window closes within CLOSING_SOON_YEARS. */
  closingSoonWines: number
  /**
   * The in-window wines nearest the end of their window: what to open
   * next. Deliberately not restricted to the urgent ones — a young
   * cellar has nothing closing for years, and a list that empties out
   * whenever things are healthy is a panel of dead space.
   */
  drinkFirst: DrinkFirstWine[]
}

export interface DashboardStats {
  totalBottles: number
  totalWines: number
  /** Sum of purchase_price x bottles for wines that have a price. */
  totalValue: number
  /** How many bottles the value covers (prices are optional per wine). */
  pricedBottles: number
  bottlesAtHome: number
  bottlesInStorage: number
  readyToDrinkWines: number
  byType: TypeSlice[]
  topRegions: RegionBar[]
  byTier: TierBar[]
  windowWatch: WindowWatch
}

const TIER_LABELS: Record<number, string> = {
  1: 'Everyday',
  2: 'Quality',
  3: 'Fine',
  4: 'Premium',
  5: 'Icon',
}

/** In-window wines whose window ends within this many years are "closing soon". */
export const CLOSING_SOON_YEARS = 2
const TOP_REGIONS = 6
/** How many wines the dashboard names outright in the drink-first list. */
const DRINK_FIRST_LISTED = 5

function bottleCount(wine: Wine): number {
  return wine.quantity_in_storage + wine.quantity_at_home
}

function isInWindow(wine: Wine, year: number): boolean {
  return wine.drinking_window_start <= year && year <= wine.drinking_window_end
}

export function computeDashboardStats(wines: Wine[], now: Date = new Date()): DashboardStats {
  const year = now.getFullYear()
  const owned = wines.filter(w => bottleCount(w) > 0)

  const totalBottles = owned.reduce((sum, w) => sum + bottleCount(w), 0)
  const bottlesAtHome = owned.reduce((sum, w) => sum + w.quantity_at_home, 0)
  const bottlesInStorage = owned.reduce((sum, w) => sum + w.quantity_in_storage, 0)

  const priced = owned.filter(w => typeof w.purchase_price === 'number' && w.purchase_price > 0)
  const totalValue = priced.reduce((sum, w) => sum + w.purchase_price! * bottleCount(w), 0)
  const pricedBottles = priced.reduce((sum, w) => sum + bottleCount(w), 0)

  // By type (bottles), fixed canonical order so chart colors stay stable
  const typeOrder = ['Red', 'White', 'Rosé', 'Sparkling', 'Fortified']
  const typeCounts = new Map<string, number>()
  for (const wine of owned) {
    const type = wine.wine_type ?? 'Red'
    typeCounts.set(type, (typeCounts.get(type) ?? 0) + bottleCount(wine))
  }
  const byType = typeOrder
    .filter(type => (typeCounts.get(type) ?? 0) > 0)
    .map(type => ({ label: type, bottles: typeCounts.get(type)! }))

  // Top regions (bottles), remainder folded into "Other"
  const regionCounts = new Map<string, number>()
  for (const wine of owned) {
    const region = wine.region?.trim() || 'Unknown'
    regionCounts.set(region, (regionCounts.get(region) ?? 0) + bottleCount(wine))
  }
  const sortedRegions = [...regionCounts.entries()].sort((a, b) => b[1] - a[1])
  const topRegions: RegionBar[] = sortedRegions
    .slice(0, TOP_REGIONS)
    .map(([label, bottles]) => ({ label, bottles }))
  const otherBottles = sortedRegions.slice(TOP_REGIONS).reduce((sum, [, n]) => sum + n, 0)
  if (otherBottles > 0) {
    topRegions.push({ label: 'Other', bottles: otherBottles })
  }

  // Tier distribution (wines, not bottles — tiers describe the wine)
  const byTier: TierBar[] = [1, 2, 3, 4, 5].map(tier => ({
    tier,
    label: TIER_LABELS[tier],
    wines: owned.filter(w => w.tier === tier).length,
  }))

  // Drinking-window watch
  const ready = owned.filter(w => isInWindow(w, year))
  const waiting = owned.filter(w => w.drinking_window_start > year)
  const closingSoon = ready.filter(w => w.drinking_window_end <= year + CLOSING_SOON_YEARS)
  const drinkFirst = [...ready]
    .sort((a, b) => a.drinking_window_end - b.drinking_window_end)
    .slice(0, DRINK_FIRST_LISTED)
    .map(w => ({
      id: w.id,
      name: w.name,
      producer: w.producer,
      vintage: w.vintage,
      windowEnd: w.drinking_window_end,
      urgent: w.drinking_window_end <= year + CLOSING_SOON_YEARS,
    }))

  return {
    totalBottles,
    totalWines: owned.length,
    totalValue,
    pricedBottles,
    bottlesAtHome,
    bottlesInStorage,
    readyToDrinkWines: ready.length,
    byType,
    topRegions,
    byTier,
    windowWatch: {
      readyWines: ready.length,
      waitingWines: waiting.length,
      closingSoonWines: closingSoon.length,
      drinkFirst,
    },
  }
}

/** First upcoming (non-completed) delivery, if the schedule has one. */
export function nextDelivery(
  schedule: DeliveryDisplayEntry[]
): { date: string; bottles: number; wines: number } | null {
  const entry = schedule.find(d => d.status !== 'completed')
  if (!entry) return null
  return {
    date: entry.date,
    bottles: entry.wines.reduce((sum, w) => sum + w.quantity, 0),
    wines: new Set(entry.wines.map(w => w.id)).size,
  }
}
