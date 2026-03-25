import type { Wine, DeliveryScheduleEntry } from '../types/index'

export interface DrinkingScheduleEntry {
  wineId: string
  producer: string
  name: string
  vintage: number
  region: string
  tier: number
  suggestedMonth: number // 1-12
  suggestedYear: number
  status: string
}

export class ScheduleService {
  /**
   * Generate drinking schedule based on user's rules:
   * - 30 wines/year ±5 (pro-rata for partial years)
   * - Tier spacing (T1: 6mo apart, T4-5: spread across window)
   * - Strictly enforce before window, prefer after window
   * - Max 1x T4-5/year unless no alternative
   */
  static generateDrinkingSchedule(
    homeWines: Wine[],
    startYear: number = new Date().getFullYear(),
    yearsToSchedule: number = 3
  ): DrinkingScheduleEntry[] {
    const schedule: DrinkingScheduleEntry[] = []

    // Group wines by tier
    const winesByTier = this.groupWinesByTier(homeWines)

    // Calculate consumption targets
    const targetPerYear = 30
    const tolerance = 5 // ±5

    // Track consumption per year and per wine
    const yearlyConsumption: Record<number, number> = {}
    const wineConsumptionThisYear: Record<string, number> = {}

    for (let year = startYear; year < startYear + yearsToSchedule; year++) {
      yearlyConsumption[year] = 0

      // Determine how many months remain in current year (for first partial year)
      let monthsInYear = 12
      if (year === startYear) {
        const now = new Date()
        monthsInYear = 12 - now.getMonth()
      }

      // Pro-rata consumption target for partial years
      const targetForYear = Math.round((targetPerYear * monthsInYear) / 12)
      const minConsumption = Math.max(1, targetForYear - tolerance)
      const maxConsumption = targetForYear + tolerance

      // Reset yearly tier consumption tracking
      const tier4_5Count: Record<number, number> = { 4: 0, 5: 0 }

      // Build consumption for this year
      const yearsConsumption: DrinkingScheduleEntry[] = []

      // Strategy: Balance across tiers
      for (const tier of [5, 4, 3, 2, 1]) {
        const tierWines = (winesByTier[tier] || []).filter(
          w =>
            this.canConsumeThisYear(w, year) &&
            !this.hasExceededTierLimit(tier, tier4_5Count[tier] || 0)
        )

        for (const wine of tierWines) {
          if (yearlyConsumption[year] >= maxConsumption) {
            break
          }

          // Determine spacing for this wine
          const spacing = this.getConsumptionSpacing(wine, year)
          if (!wineConsumptionThisYear[wine.id]) {
            wineConsumptionThisYear[wine.id] = 0
          }

          // Add to schedule if within spacing constraints
          if (wineConsumptionThisYear[wine.id] < spacing) {
            const month = this.calculateConsumptionMonth(wine, year, yearsConsumption.length)

            yearsConsumption.push({
              wineId: wine.id,
              producer: wine.producer,
              name: wine.name,
              vintage: wine.vintage,
              region: wine.region,
              tier: wine.tier,
              suggestedMonth: month,
              suggestedYear: year,
              status: this.getConsumptionStatus(wine, year),
            })

            yearlyConsumption[year]++
            wineConsumptionThisYear[wine.id]++

            if (tier >= 4) {
              tier4_5Count[tier]++
            }
          }
        }
      }

      // Add padding if under minimum
      if (yearlyConsumption[year] < minConsumption) {
        const padding = minConsumption - yearlyConsumption[year]
        const allWines = homeWines.filter(
          w =>
            this.canConsumeThisYear(w, year) &&
            !yearsConsumption.some(e => e.wineId === w.id)
        )

        for (let i = 0; i < padding && allWines.length > 0; i++) {
          const wine = allWines[i % allWines.length]
          const month = this.calculateConsumptionMonth(wine, year, yearsConsumption.length)

          yearsConsumption.push({
            wineId: wine.id,
            producer: wine.producer,
            name: wine.name,
            vintage: wine.vintage,
            region: wine.region,
            tier: wine.tier,
            suggestedMonth: month,
            suggestedYear: year,
            status: this.getConsumptionStatus(wine, year),
          })

          yearlyConsumption[year]++
        }
      }

      schedule.push(...yearsConsumption)
    }

    return schedule
      .filter(e => homeWines.some(w => w.id === e.wineId))
      .sort((a, b) => {
        if (a.suggestedYear !== b.suggestedYear) {
          return a.suggestedYear - b.suggestedYear
        }
        return a.suggestedMonth - b.suggestedMonth
      })
  }

  /**
   * Generate delivery schedule based on rules:
   * - Max 2 deliveries/calendar year in fixed months
   * - Tier 4-5 never before 2029
   * - Min thresholds: 6/3/12 by tier
   * - Diverse regions/producers
   * - Respect cellar capacity
   */
  static generateDeliverySchedule(
    allWines: Wine[],
    cellarCapacity: number,
    homeWineCount: number,
    deliveryMonths: [number, number] = [3, 9] // March and September
  ): DeliveryScheduleEntry[] {
    const schedule: DeliveryScheduleEntry[] = []
    const storageWines = allWines.filter(w => w.location === 'storage')

    if (storageWines.length === 0) {
      return []
    }

    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1

    // Track deliveries per year
    const deliveriesPerYear: Record<number, number> = {}
    const usedRegions: Set<string> = new Set()

    // Sort wines by tier and drinking window
    const candidateWines = storageWines
      .filter(w => {
        // Tier 4-5 never before 2029
        if (w.tier >= 4 && w.drinking_window_start < 2029) {
          return false
        }
        // Can't deliver before drinking window
        if (w.drinking_window_start > currentYear + 3) {
          return false
        }
        return true
      })
      .sort((a, b) => {
        // Prioritize wines approaching their window
        const aYearsToWindow = a.drinking_window_start - currentYear
        const bYearsToWindow = b.drinking_window_start - currentYear
        return aYearsToWindow - bYearsToWindow
      })

    // Generate delivery schedule
    for (let year = currentYear; year < currentYear + 3; year++) {
      deliveriesPerYear[year] = 0

      for (const month of deliveryMonths) {
        if (deliveriesPerYear[year] >= 2) {
          break // Max 2 deliveries per year
        }

        // Skip if we've passed this month in the current year
        if (year === currentYear && month < currentMonth) {
          continue
        }

        // Check capacity
        const remainingCapacity = cellarCapacity - homeWineCount
        if (remainingCapacity <= 0) {
          continue
        }

        // Select wines for this delivery
        const deliveryWines: Wine[] = []
        let capacityUsed = 0

        for (const wine of candidateWines) {
          // Skip if already scheduled in another delivery
          if (
            schedule.some(
              d =>
                d.wine_id === wine.id &&
                d.status === 'pending'
            )
          ) {
            continue
          }

          // Apply min threshold
          const minThreshold = this.getMinDeliveryThreshold(wine.tier)
          if (wine.quantity < minThreshold) {
            continue
          }

          // Prefer diverse regions
          if (usedRegions.has(wine.region) && deliveryWines.length > 0) {
            continue
          }

          // Check capacity
          if (capacityUsed + 1 > remainingCapacity) {
            break
          }

          deliveryWines.push(wine)
          usedRegions.add(wine.region)
          capacityUsed += 1

          if (deliveryWines.length >= Math.ceil(remainingCapacity / 2)) {
            break // Reasonable batch size
          }
        }

        // Create delivery entries
        for (const wine of deliveryWines) {
          const scheduledDate = new Date(year, month - 1, 1)
          schedule.push({
            id: `delivery-${wine.id}-${year}-${month}`,
            wine_id: wine.id,
            quantity: Math.min(wine.quantity, this.getMinDeliveryThreshold(wine.tier)),
            scheduled_date: scheduledDate.toISOString().split('T')[0],
            from_location: 'storage',
            to_location: 'home',
            status: 'pending',
            created_at: new Date().toISOString(),
          })
        }

        if (deliveryWines.length > 0) {
          deliveriesPerYear[year]++
        }
      }
    }

    return schedule
  }

  // Helper methods
  private static groupWinesByTier(wines: Wine[]): Record<number, Wine[]> {
    const grouped: Record<number, Wine[]> = {}
    for (let i = 1; i <= 5; i++) {
      grouped[i] = wines.filter(w => w.tier === i)
    }
    return grouped
  }

  private static canConsumeThisYear(wine: Wine, year: number): boolean {
    // Must be at or after drinking window start
    if (year < wine.drinking_window_start) {
      return false
    }
    // Should not consume after window end (but allowed as fallback)
    return true
  }

  private static hasExceededTierLimit(tier: number, currentCount: number): boolean {
    // Tier 4-5: max 1x per year unless no alternatives
    if (tier >= 4 && currentCount >= 1) {
      return true
    }
    return false
  }

  private static getConsumptionSpacing(wine: Wine, _year: number): number {
    const tier = wine.tier

    // Tier 1 (EVERYDAY): Can drink multiple times per year
    if (tier === 1) {
      return 2
    }

    // Tier 4-5 (PREMIUM/ICON): Spread across window, max 1x per year
    if (tier >= 4) {
      const windowLength = wine.drinking_window_end - wine.drinking_window_start
      return Math.max(1, Math.floor(windowLength / 2))
    }

    // Tier 2-3: Moderate spacing
    return 1
  }

  private static calculateConsumptionMonth(
    wine: Wine,
    year: number,
    indexInYear: number
  ): number {
    const tier = wine.tier

    if (tier === 1) {
      // Distribute throughout the year
      return (indexInYear % 12) + 1
    }

    if (tier >= 4) {
      // Spread across drinking window months
      const windowLength = wine.drinking_window_end - wine.drinking_window_start
      const yearInWindow = year - wine.drinking_window_start
      const progressRatio = Math.max(0, Math.min(1, yearInWindow / windowLength))
      return Math.floor(progressRatio * 12) + 1
    }

    // Tier 2-3: distribute across year
    return (indexInYear % 6) * 2 + 1
  }

  private static getConsumptionStatus(_wine: Wine, year: number): string {
    const now = new Date().getFullYear()

    if (year === now) {
      return 'This Year'
    } else if (year === now + 1) {
      return 'Next Year'
    } else {
      return `${year}`
    }
  }

  private static getMinDeliveryThreshold(tier: number): number {
    if (tier === 1) return 12
    if (tier === 2) return 6
    if (tier === 3) return 3
    if (tier === 4) return 6
    return 6 // Tier 5
  }
}
