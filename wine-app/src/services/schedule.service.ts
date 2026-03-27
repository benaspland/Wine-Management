import type { Wine, DeliveryScheduleEntry } from '../types/index'

export interface DrinkingScheduleEntry {
  wineId: string
  producer: string
  name: string
  vintage: number
  region: string
  tier: number
  classification?: string
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
   * - Considers ALL wines and factors in delivery schedule timing
   */
  static generateDrinkingSchedule(
    allWines: Wine[],
    deliveryScheduleEntries?: DeliveryScheduleEntry[],
    startYear: number = new Date().getFullYear(),
    yearsToSchedule: number = 3
  ): DrinkingScheduleEntry[] {
    const schedule: DrinkingScheduleEntry[] = []

    console.log('[ScheduleService] generateDrinkingSchedule called with', allWines.length, 'total wines')

    // Build availability map: wine ID -> earliest date it's available
    const wineAvailability: Record<string, number> = {} // wineId -> year when available
    const now = new Date()
    const currentYear = now.getFullYear()

    allWines.forEach(w => {
      // Wine is available immediately if at home
      if (w.location === 'home') {
        wineAvailability[w.id] = currentYear
      } else if (w.location === 'storage') {
        // Otherwise, check delivery schedule
        const delivery = deliveryScheduleEntries?.find(d => d.wine_id === w.id && d.status === 'pending')
        if (delivery) {
          const deliveryYear = parseInt(delivery.scheduled_date.split('-')[0])
          wineAvailability[w.id] = deliveryYear
        } else {
          // If no delivery scheduled, assume not available this period
          wineAvailability[w.id] = currentYear + 10 // Far future
        }
      }
    })

    console.log('[ScheduleService] Wine availability:', Object.entries(wineAvailability).map(([id, year]) => {
      const wine = allWines.find(w => w.id === id)
      return `${wine?.producer} ${wine?.name}: available ${year}`
    }))

    // Group wines by tier
    const winesByTier = this.groupWinesByTier(allWines)
    console.log('[ScheduleService] Wines by tier:', Object.entries(winesByTier).reduce((acc, [tier, wines]) => {
      acc[tier] = wines.length
      return acc
    }, {} as Record<string, number>))

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
        const currentMonth = now.getMonth() + 1 // 1-indexed
        monthsInYear = 12 - currentMonth + 1 // Remaining months including current
      }

      // Pro-rata consumption target for partial years
      const targetForYear = Math.round((targetPerYear * monthsInYear) / 12)
      const minConsumption = Math.max(1, targetForYear - tolerance)
      const maxConsumption = targetForYear + tolerance

      // Reset yearly tier consumption tracking
      const tier4_5Count: Record<number, number> = { 4: 0, 5: 0 }

      // Build consumption for this year
      const yearsConsumption: DrinkingScheduleEntry[] = []

      console.log(`[ScheduleService] Processing year ${year}`)

      // Strategy: Balance across tiers
      for (const tier of [5, 4, 3, 2, 1]) {
        const tierWines = (winesByTier[tier] || []).filter(
          w =>
            this.canConsumeThisYear(w, year) &&
            wineAvailability[w.id] <= year && // Wine must be available by this year
            !this.hasExceededTierLimit(tier, tier4_5Count[tier] || 0)
        )
        console.log(`[ScheduleService] Tier ${tier}: ${tierWines.length} available wines for year ${year}`)

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
              classification: wine.classification,
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
        const availableWinesForPadding = allWines.filter(
          w =>
            this.canConsumeThisYear(w, year) &&
            wineAvailability[w.id] <= year &&
            !yearsConsumption.some(e => e.wineId === w.id)
        )

        for (let i = 0; i < padding && availableWinesForPadding.length > 0; i++) {
          const wine = availableWinesForPadding[i % availableWinesForPadding.length]
          const month = this.calculateConsumptionMonth(wine, year, yearsConsumption.length)

          yearsConsumption.push({
            wineId: wine.id,
            producer: wine.producer,
            name: wine.name,
            vintage: wine.vintage,
            region: wine.region,
            tier: wine.tier,
            classification: wine.classification,
            suggestedMonth: month,
            suggestedYear: year,
            status: this.getConsumptionStatus(wine, year),
          })

          yearlyConsumption[year]++
        }
      }

      schedule.push(...yearsConsumption)
    }

    console.log('[ScheduleService] Before final filter:', schedule.length, 'entries')
    const currentMonth = now.getMonth() + 1

    const filtered = schedule
      .filter(e => {
        // For current year, exclude past months
        if (e.suggestedYear === currentYear && e.suggestedMonth < currentMonth) {
          return false
        }
        return allWines.some(w => w.id === e.wineId)
      })
      .sort((a, b) => {
        if (a.suggestedYear !== b.suggestedYear) {
          return a.suggestedYear - b.suggestedYear
        }
        return a.suggestedMonth - b.suggestedMonth
      })
    console.log('[ScheduleService] After final filter:', filtered.length, 'entries')
    return filtered
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

          // Skip if wine has no quantity
          // Below-threshold quantities will be delivered as-is in the schedule entry
          if (wine.quantity === 0) {
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
          const minThreshold = this.getMinDeliveryThreshold(wine.format)
          // If below threshold, deliver all remaining; otherwise deliver threshold amount
          const quantityToDeliver = wine.quantity < minThreshold ? wine.quantity : minThreshold

          schedule.push({
            id: `delivery-${wine.id}-${year}-${month}`,
            wine_id: wine.id,
            quantity: quantityToDeliver,
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

  private static getMinDeliveryThreshold(format: string): number {
    // Thresholds based on bottle format, not tier
    if (format.includes('375') || format.includes('half')) return 12 // Half bottles
    if (format.includes('1.5') || format.includes('magnum')) return 3 // Magnum
    // Default for 750ml and other formats
    return 6
  }
}
