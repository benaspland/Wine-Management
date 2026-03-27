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
   * - Distribute across 12 months with tier preference weighting
   * - Tier 4-5: max 1x per wine per 3 years (flexible if wine supply exhausted)
   * - Lower tiers dominate each year (~80%), Tier 4-5 supplementary (~20%)
   * - Producer diversity: avoid clustering same producer in adjacent months
   * - Strictly enforce drinking window start, prefer but don't require window end
   * - Considers delivery timing: wine must be available before consumption
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
    const tier4_5MinSpacingYears = 3

    // Track consumption per year and per wine (for Tier 4-5 spacing)
    const yearlyConsumption: Record<number, number> = {}
    const wineLastConsumedYear: Record<string, number> = {} // Track last year each wine was scheduled

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

      // Build consumption for this year using month-slot distribution
      const yearsConsumption: DrinkingScheduleEntry[] = []
      const slotsPerMonth = Math.ceil(targetForYear / 12) // ~2-3 wines per month

      console.log(`[ScheduleService] Processing year ${year}, target ${targetForYear} wines (${slotsPerMonth} per month)`)

      // Distribute wines across 12 months with tier preference
      for (let month = 1; month <= 12; month++) {
        const slotsToFill = Math.min(slotsPerMonth, maxConsumption - yearsConsumption.length)
        if (slotsToFill <= 0) break

        const monthYearMonth = `${year}-${String(month).padStart(2, '0')}`
        const lastMonthProducers = yearsConsumption.slice(-2).map(e => e.producer) // Avoid clustering

        // Build candidates available by this month
        const candidates = allWines.filter(w => {
          const availabilityYearMonth = wineAvailability[w.id]
          return (
            this.canConsumeThisYear(w, year) &&
            availabilityYearMonth <= monthYearMonth && // Wine available by this month
            !yearsConsumption.some(e => e.wineId === w.id) && // Not already scheduled this year
            !lastMonthProducers.includes(w.producer) // Avoid same producer clustering
          )
        })

        // Sort candidates by tier preference (T1 > T2-3 > T4-5)
        const candidatesByTier = {
          1: candidates.filter(w => w.tier === 1),
          2: candidates.filter(w => w.tier === 2),
          3: candidates.filter(w => w.tier === 3),
          4: candidates.filter(w => w.tier === 4),
          5: candidates.filter(w => w.tier === 5),
        }

        // Fill month slots with tier preference: T1 > T2-3 > T4-5
        let slotsFilledThisMonth = 0
        for (const tier of [1, 2, 3, 4, 5]) {
          while (
            slotsFilledThisMonth < slotsToFill &&
            candidatesByTier[tier as keyof typeof candidatesByTier].length > 0
          ) {
            const tierCandidates = candidatesByTier[tier as keyof typeof candidatesByTier]

            // For Tier 4-5, prefer wines not scheduled in last 3 years (unless necessary)
            let selectedWine: Wine | undefined
            if (tier >= 4) {
              selectedWine = tierCandidates.find(
                w => !wineLastConsumedYear[w.id] || year - wineLastConsumedYear[w.id] >= tier4_5MinSpacingYears
              )
              // Fallback: if no wines respect spacing, take any available (spacing rule relaxed)
              if (!selectedWine && tierCandidates.length > 0) {
                selectedWine = tierCandidates[0]
              }
            } else {
              selectedWine = tierCandidates[0]
            }

            if (!selectedWine) break

            const monthNum = this.calculateConsumptionMonthDistributed(year, month, yearsConsumption.length)

            yearsConsumption.push({
              wineId: selectedWine.id,
              producer: selectedWine.producer,
              name: selectedWine.name,
              vintage: selectedWine.vintage,
              region: selectedWine.region,
              tier: selectedWine.tier,
              classification: selectedWine.classification,
              suggestedMonth: monthNum,
              suggestedYear: year,
              status: this.getConsumptionStatus(selectedWine, year),
            })

            wineLastConsumedYear[selectedWine.id] = year
            slotsFilledThisMonth++

            // Remove from candidates
            const idx = tierCandidates.indexOf(selectedWine)
            if (idx > -1) tierCandidates.splice(idx, 1)
          }
        }
      }

      // Add padding if under minimum
      if (yearsConsumption.length < minConsumption) {
        const padding = minConsumption - yearsConsumption.length
        const availableWinesForPadding = allWines.filter(
          w =>
            this.canConsumeThisYear(w, year) &&
            wineAvailability[w.id] <= `${year}-12` && // Available by end of year
            !yearsConsumption.some(e => e.wineId === w.id)
        )

        for (let i = 0; i < padding && availableWinesForPadding.length > 0; i++) {
          const wine = availableWinesForPadding[i % availableWinesForPadding.length]
          const monthNum = this.calculateConsumptionMonthDistributed(year, (i % 12) + 1, yearsConsumption.length)

          yearsConsumption.push({
            wineId: wine.id,
            producer: wine.producer,
            name: wine.name,
            vintage: wine.vintage,
            region: wine.region,
            tier: wine.tier,
            classification: wine.classification,
            suggestedMonth: monthNum,
            suggestedYear: year,
            status: this.getConsumptionStatus(wine, year),
          })

          wineLastConsumedYear[wine.id] = year
        }
      }

      yearlyConsumption[year] = yearsConsumption.length
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
      // Goal: Replenish cellar to capacity with wines approaching their drinking window
      // Minimum: 24 bottles per delivery, Maximum: fill remaining cellar capacity
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

      // Rotate through producers to ensure diversity, filling remaining capacity
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

  private static calculateConsumptionMonthDistributed(_year: number, targetMonth: number, indexInYear: number): number {
    // Slight variation around target month to provide some spread
    // But keep wines roughly in their intended month for user understanding
    const monthVariation = indexInYear % 3 // Spread wines within target month's context
    return Math.max(1, Math.min(12, targetMonth + monthVariation - 1))
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
