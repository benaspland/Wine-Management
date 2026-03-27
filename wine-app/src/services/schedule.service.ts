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

    // Build availability map: wine ID -> earliest date it's available (YYYY-MM format for comparison)
    const wineAvailability: Record<string, string> = {} // wineId -> YYYY-MM when available
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    const currentYearMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}`

    allWines.forEach(w => {
      // Wine is available immediately if at home
      if (w.location === 'home') {
        wineAvailability[w.id] = currentYearMonth
      } else if (w.location === 'storage') {
        // Otherwise, check delivery schedule
        const delivery = deliveryScheduleEntries?.find(d => d.wine_id === w.id && d.status === 'pending')
        if (delivery) {
          // Extract YYYY-MM from delivery date (YYYY-MM-DD format)
          wineAvailability[w.id] = delivery.scheduled_date.substring(0, 7)
        } else {
          // If no delivery scheduled, assume not available this period
          wineAvailability[w.id] = '9999-12' // Far future
        }
      }
    })

    const homeWines = allWines.filter(w => w.location === 'home')
    const storageWines = allWines.filter(w => w.location === 'storage')

    console.log('[ScheduleService] Wine availability:', Object.entries(wineAvailability).map(([id, yearMonth]) => {
      const wine = allWines.find(w => w.id === id)
      return `${wine?.producer} ${wine?.name}: available ${yearMonth}`
    }))
    const deliverableWines = allWines.filter(w => wineAvailability[w.id] !== '9999-12').length
    console.log(`[ScheduleService] Home wines: ${homeWines.length}, Storage wines: ${storageWines.length}, Deliverable: ${deliverableWines}`)

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

      // Strategy: Balance across tiers, respecting availability and spacing
      for (const tier of [5, 4, 3, 2, 1]) {
        const tierWines = (winesByTier[tier] || []).filter(w => {
          // Check if wine is available by this point in the year
          const availabilityYearMonth = wineAvailability[w.id]
          const consumptionYearMonth = `${year}-03` // Conservative: assume March consumption

          return (
            this.canConsumeThisYear(w, year) &&
            availabilityYearMonth <= consumptionYearMonth && // Wine must be available by consumption month
            !yearsConsumption.some(e => e.wineId === w.id) && // Not already scheduled this year
            !this.hasExceededTierLimit(tier, tier4_5Count[tier] || 0)
          )
        })
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
        const consumptionYearMonth = `${year}-03` // Conservative: assume March consumption
        const availableWinesForPadding = allWines.filter(
          w =>
            this.canConsumeThisYear(w, year) &&
            wineAvailability[w.id] <= consumptionYearMonth &&
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

    console.log('[ScheduleService] Before final filter:', schedule.length, 'total drinking entries')

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

    // Log summary by year
    const byYear: Record<number, number> = {}
    filtered.forEach(e => {
      byYear[e.suggestedYear] = (byYear[e.suggestedYear] || 0) + 1
    })
    console.log('[ScheduleService] Drinking schedule by year:', byYear)
    console.log('[ScheduleService] Final drinking schedule:', filtered.length, 'entries')

    return filtered
  }

  /**
   * Generate delivery schedule based on rules:
   * - Max 2 deliveries/calendar year in fixed months
   * - Tier 4-5 never before 2029
   * - Min thresholds: 6/3/12 by format
   * - Diverse regions/producers
   * - Respect cellar capacity
   * - Minimum 24 bottles per delivery batch (skip slot if not met)
   * - Plans through maximum drinking window start date
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
    const minDeliveryBottles = 24

    // Calculate planning horizon based on maximum drinking window start date
    const maxDrinkingWindowStart = Math.max(
      ...storageWines.map(w => w.drinking_window_start || currentYear)
    )
    const yearsToSchedule = Math.max(4, maxDrinkingWindowStart - currentYear + 2)

    console.log(
      `[ScheduleService] Planning deliveries from ${currentYear} to ${currentYear + yearsToSchedule}, max window start: ${maxDrinkingWindowStart}`
    )

    // Track deliveries per year and scheduled wines
    const deliveriesPerYear: Record<number, number> = {}
    const scheduledWineIds = new Set<string>()

    // Sort wines by drinking window priority (most urgent first)
    const candidateWines = storageWines
      .filter(w => {
        // Tier 4-5 never before 2029
        if (w.tier >= 4 && w.drinking_window_start < 2029) {
          return false
        }
        // Can't deliver before drinking window starts
        if (w.drinking_window_start > currentYear + yearsToSchedule) {
          return false
        }
        if (w.quantity === 0) {
          return false
        }
        return true
      })
      .sort((a, b) => {
        // Prioritize wines approaching their drinking window
        const aYearsToWindow = a.drinking_window_start - currentYear
        const bYearsToWindow = b.drinking_window_start - currentYear
        return aYearsToWindow - bYearsToWindow
      })

    console.log(`[ScheduleService] ${candidateWines.length} candidate wines for delivery from ${storageWines.length} storage wines`)

    // Generate all valid delivery slots through planning horizon
    const deliverySlots: Array<[number, number]> = []
    for (let year = currentYear; year < currentYear + yearsToSchedule; year++) {
      for (const month of deliveryMonths) {
        if (year === currentYear && month < currentMonth) {
          continue // Skip past months
        }
        deliverySlots.push([year, month])
      }
    }

    // Try to fill each delivery slot, respecting 24-bottle minimum
    for (const [year, month] of deliverySlots) {
      if (!deliveriesPerYear[year]) {
        deliveriesPerYear[year] = 0
      }
      if (deliveriesPerYear[year] >= 2) {
        continue // Max 2 deliveries per year
      }

      const remainingCapacity = cellarCapacity - homeWineCount
      if (remainingCapacity <= 0) {
        continue
      }

      // Find unscheduled wines available by this year
      const availableWines = candidateWines.filter(
        w => !scheduledWineIds.has(w.id) && w.drinking_window_start <= year
      )

      if (availableWines.length === 0) {
        continue
      }

      // Build batch for this delivery slot prioritizing urgency with producer diversity
      // Goal: Deliver wines approaching their drinking window first, with diverse producers
      const deliveryBatch: Array<{ wine: Wine; quantity: number }> = []
      let bottleCount = 0
      let wineCount = 0

      // Sort by drinking window urgency (wines opening soonest first)
      // This naturally sequences lower tiers before higher tiers
      const winesByUrgency = availableWines.sort(
        (a, b) => a.drinking_window_start - b.drinking_window_start
      )

      // Group urgent wines by producer for diversity
      const producerMap = new Map<string, Wine[]>()
      winesByUrgency.forEach(w => {
        if (!producerMap.has(w.producer)) {
          producerMap.set(w.producer, [])
        }
        producerMap.get(w.producer)!.push(w)
      })

      // Rotate through producers to ensure diversity
      let producerIndex = 0
      const producers = Array.from(producerMap.keys())

      while (wineCount < remainingCapacity && producers.length > 0) {
        const producer = producers[producerIndex % producers.length]
        const producerWines = producerMap.get(producer) || []
        const unscheduledFromProducer = producerWines.filter(
          w => !deliveryBatch.some(db => db.wine.id === w.id)
        )

        if (unscheduledFromProducer.length > 0) {
          const wine = unscheduledFromProducer[0]
          const minThreshold = this.getMinDeliveryThreshold(wine.format)
          const quantityToDeliver = wine.quantity < minThreshold ? wine.quantity : minThreshold

          deliveryBatch.push({ wine, quantity: quantityToDeliver })
          bottleCount += quantityToDeliver
          wineCount += 1
        }

        producerIndex++

        // Exit if all wines are scheduled
        if (producers.every(p => producerMap.get(p)!.every(w => deliveryBatch.some(db => db.wine.id === w.id)))) {
          break
        }
      }

      // Only create delivery if we meet 24-bottle minimum
      if (bottleCount >= minDeliveryBottles) {
        const scheduledDate = new Date(year, month - 1, 1)

        for (const { wine, quantity } of deliveryBatch) {
          schedule.push({
            id: `delivery-${wine.id}-${year}-${month}`,
            wine_id: wine.id,
            quantity,
            scheduled_date: scheduledDate.toISOString().split('T')[0],
            from_location: 'storage',
            to_location: 'home',
            status: 'pending',
            created_at: new Date().toISOString(),
          })
          scheduledWineIds.add(wine.id)
        }

        deliveriesPerYear[year]++
        homeWineCount += wineCount
      }
      // If < 24 bottles, skip this slot and wines carry forward to next slot
    }

    console.log(
      `[ScheduleService] Generated ${schedule.length} delivery entries across ${Object.values(deliveriesPerYear).reduce((a, b) => a + b, 0)} deliveries`
    )

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
