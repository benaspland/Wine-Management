import type { Wine, DeliveryScheduleEntry } from '../types/index'
import { DELIVERY_CONFIG, getMinDeliveryThreshold } from '../config/deliveryConfig'

// Debug logging helper - logs in development and when explicitly enabled
const debugLog = (...args: any[]) => {
  // Log in development/Vite dev mode OR if explicitly enabled
  const isDev = typeof window !== 'undefined' && (window as any).__DEV__
  const isDebugEnabled = typeof window !== 'undefined' && (window as any).__SCHEDULE_DEBUG__

  if (isDev || isDebugEnabled) {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0]
    console.log(`[${timestamp}]`, ...args)
  }
}

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

    debugLog('[ScheduleService] generateDrinkingSchedule called with', allWines.length, 'total wines')

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

    debugLog('[ScheduleService] Wine availability:', Object.entries(wineAvailability).map(([id, yearMonth]) => {
      const wine = allWines.find(w => w.id === id)
      return `${wine?.producer} ${wine?.name}: available ${yearMonth}`
    }))
    const deliverableWines = allWines.filter(w => wineAvailability[w.id] !== '9999-12').length
    debugLog(`[ScheduleService] Home wines: ${homeWines.length}, Storage wines: ${storageWines.length}, Deliverable: ${deliverableWines}`)

    // Group wines by tier
    const winesByTier = this.groupWinesByTier(allWines)
    debugLog('[ScheduleService] Wines by tier:', Object.entries(winesByTier).reduce((acc, [tier, wines]) => {
      acc[tier] = wines.length
      return acc
    }, {} as Record<string, number>))

    // Calculate consumption targets
    const targetPerYear = DELIVERY_CONFIG.annualTarget
    const tolerance = 5 // ±5
    const tier4_5MinSpacingYears = DELIVERY_CONFIG.tier45MinSpacingYears

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

      debugLog(`[ScheduleService] Processing year ${year}, target ${targetForYear} wines (${slotsPerMonth} per month)`)

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

    debugLog('[ScheduleService] Before final filter:', schedule.length, 'total drinking entries')

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
    debugLog('[ScheduleService] Drinking schedule by year:', byYear)
    debugLog('[ScheduleService] Final drinking schedule:', filtered.length, 'entries')

    return filtered
  }

  /**
   * Generate delivery schedule with sophisticated wine selection:
   * - Loops until ALL wines are scheduled (no arbitrary year limit)
   * - Uses full cellar capacity (removed 75% fill ratio limitation)
   * - Three-factor scoring: window urgency (PRIMARY), tier distribution (SECONDARY), diversity (TERTIARY)
   * - Window urgency is multiplied by 100 to ensure closing windows take priority
   * - Tier distribution maintained proportional to inventory composition
   * - Max 2 deliveries/calendar year in fixed months (March and September)
   * - Tier 4-5 never before 2029
   * - Minimum 24 bottles per delivery
   */
  static generateDeliverySchedule(
    allWines: Wine[],
    cellarCapacity: number,
    currentBottlesAtHome: number,
    deliveryMonths: [number, number] = [3, 9], // March and September
    annualConsumptionTarget: number = 30 // From config
  ): DeliveryScheduleEntry[] {
    console.log('[ScheduleService] ✓ generateDeliverySchedule called')
    const schedule: DeliveryScheduleEntry[] = []
    const storageWines = allWines.filter(w => w.location === 'storage')

    if (storageWines.length === 0) {
      console.log('[ScheduleService] ✓ No storage wines, returning empty schedule')
      return []
    }

    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    const minDeliveryBottles = DELIVERY_CONFIG.minBottles

    console.log(
      `[ScheduleService] ✓ Starting delivery schedule generation: ${storageWines.length} wines, ${currentBottlesAtHome} bottles at home`
    )
    debugLog(
      `[ScheduleService] Starting delivery schedule generation: ${storageWines.length} wines, ${currentBottlesAtHome} bottles at home`
    )

    // Track deliveries and scheduled wines
    const deliveriesPerYear: Record<number, number> = {}
    const scheduledWineIds = new Set<string>()
    let year = currentYear
    let monthIndex = 0

    // Filter candidate wines (basic constraints)
    // NOTE: Tier 4-5 constraint is applied during eligible wine filtering per delivery slot,
    // not here, so we don't eliminate wines from the entire schedule
    const candidateWines = storageWines.filter(w => {
      if (w.quantity === 0) return false
      return true
    })

    debugLog(`[ScheduleService] ${candidateWines.length} candidate wines for delivery (after basic filtering)`)

    // Calculate tier distribution in inventory
    const tierCounts: Record<number, number> = {}
    for (let tier = 1; tier <= 5; tier++) {
      tierCounts[tier] = candidateWines.filter(w => w.tier === tier).length
    }
    debugLog('[ScheduleService] Tier distribution:', tierCounts)

    // Get wines currently at home for diversity calculation
    const homeWines = allWines.filter(w => w.location === 'home')
    const homeProducers = new Set(homeWines.map(w => w.producer))
    const homeRegions = new Set(homeWines.map(w => w.region))

    // MAIN LOOP: Continue until all wines scheduled or safety limit exceeded
    let noProgressIterations = 0
    let loopIterations = 0
    const maxLoopIterations = 1000 // Safety limit: 1000 delivery slots max (~500 years worth)

    while (scheduledWineIds.size < candidateWines.length) {
      loopIterations++

      if (loopIterations > maxLoopIterations) {
        debugLog('[ScheduleService] ERROR: Exceeded max loop iterations, stopping algorithm')
        break
      }
      // Step 1-2: Skip past months in current year
      const month = deliveryMonths[monthIndex]

      if (loopIterations % 10 === 0) {
        console.log(`[Loop ${loopIterations}] Year ${year}, Month ${month}, Scheduled ${scheduledWineIds.size}/${candidateWines.length}`)
      }
      if (year === currentYear && month < currentMonth) {
        monthIndex = (monthIndex + 1) % deliveryMonths.length
        if (monthIndex === 0) year++
        continue
      }

      // Initialize deliveries per year tracker
      if (!deliveriesPerYear[year]) {
        deliveriesPerYear[year] = 0
      }

      // Max 2 deliveries per year
      if (deliveriesPerYear[year] >= 2) {
        monthIndex = (monthIndex + 1) % deliveryMonths.length
        if (monthIndex === 0) year++
        continue
      }

      // Get unscheduled wines
      const unscheduledWines = candidateWines.filter(w => !scheduledWineIds.has(w.id))

      // Check if done
      if (unscheduledWines.length === 0) {
        break
      }

      // Build delivery batch with sophisticated wine selection
      const deliveryBatch: Array<{ wine: Wine; quantity: number }> = []
      let bottleCount = 0

      // Constraint filtering
      const eligibleWines = unscheduledWines.filter(w => {
        // Tier 4-5 cannot be delivered before 2029
        if (w.tier >= 4 && year < DELIVERY_CONFIG.tier45StartYear) return false
        return true
      })

      if (eligibleWines.length === 0) {
        // No eligible wines this slot, try next
        monthIndex = (monthIndex + 1) % deliveryMonths.length
        if (monthIndex === 0) year++
        continue
      }

      if (loopIterations % 20 === 0) {
        console.log(`  → Eligible wines: ${eligibleWines.length}`)
      }

      // Calculate scores for each wine
      const scoredWines = eligibleWines.map(wine => {
        // Window urgency score (PRIMARY)
        const yearsUntilWindowEnds = wine.drinking_window_end - year
        const urgencyScore = 1000 / (yearsUntilWindowEnds + 1)

        // Tier distribution score (SECONDARY)
        const unscheduledOfTier = candidateWines.filter(
          w => w.tier === wine.tier && !scheduledWineIds.has(w.id)
        ).length
        const percentageRemaining = unscheduledOfTier / Math.max(1, tierCounts[wine.tier])
        const tierWeights = { 1: 200, 2: 170, 3: 140, 4: 110, 5: 80 }
        const tierScore = (tierWeights[wine.tier as keyof typeof tierWeights] || 100) * percentageRemaining

        // Diversity bonus (TERTIARY)
        let diversityBonus = 0
        if (!homeProducers.has(wine.producer)) diversityBonus += 50
        if (!homeRegions.has(wine.region)) diversityBonus += 25

        // Total score - urgency is primary factor
        const totalScore = urgencyScore * 100 + tierScore + diversityBonus

        return { wine, totalScore }
      })

      // Sort by score (highest first)
      scoredWines.sort((a, b) => b.totalScore - a.totalScore)

      // Add wines to batch until capacity reached
      for (const { wine } of scoredWines) {
        if (bottleCount >= cellarCapacity) break

        const minThreshold = getMinDeliveryThreshold(wine.format)
        const quantityToDeliver = Math.min(wine.quantity, minThreshold, cellarCapacity - bottleCount)

        if (quantityToDeliver > 0) {
          deliveryBatch.push({ wine, quantity: quantityToDeliver })
          bottleCount += quantityToDeliver
        }
      }

      // Record delivery if it meets minimum, OR all remaining wines are in this batch and we have bottles
      const remainingWines = candidateWines.filter(w => !scheduledWineIds.has(w.id))
      const allRemainingInBatch = remainingWines.every(w => deliveryBatch.some(d => d.wine.id === w.id))
      const shouldDeliver = bottleCount >= minDeliveryBottles || (allRemainingInBatch && bottleCount > 0)

      if (shouldDeliver) {
        const scheduledDate = new Date(year, month - 1, 1)
        let wineCount = 0

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
          homeProducers.add(wine.producer)
          homeRegions.add(wine.region)
          wineCount++
        }

        deliveriesPerYear[year]++

        debugLog(
          `[ScheduleService] ${year}-${String(month).padStart(2, '0')}: Delivered ${bottleCount} bottles (${wineCount} wines), total scheduled: ${scheduledWineIds.size}`
        )
      }

      // Advance to next delivery slot
      monthIndex = (monthIndex + 1) % deliveryMonths.length
      if (monthIndex === 0) {
        year++
      }

      // Safety limit: don't go beyond reasonable timeframe (50 years from now)
      if (year > currentYear + 50) {
        debugLog('[ScheduleService] WARNING: Exceeded year 2076, stopping delivery scheduling')
        break
      }
    }

    const totalBottlesScheduled = schedule.reduce((sum, d) => sum + d.quantity, 0)
    const totalBottlesAvailable = candidateWines.reduce((sum, w) => sum + w.quantity, 0)

    console.log('[ScheduleService] ✓ Delivery scheduling complete:')
    console.log(`  Wines scheduled: ${scheduledWineIds.size} / ${candidateWines.length}`)
    console.log(`  Bottles scheduled: ${totalBottlesScheduled} / ${totalBottlesAvailable}`)
    console.log(`  Total deliveries: ${Object.values(deliveriesPerYear).reduce((a, b) => a + b, 0)}`)
    console.log(`  Loop iterations: ${loopIterations}`)

    debugLog('[ScheduleService] Delivery scheduling complete:')
    debugLog(`  Wines scheduled: ${scheduledWineIds.size} / ${candidateWines.length}`)
    debugLog(`  Bottles scheduled: ${totalBottlesScheduled} / ${totalBottlesAvailable}`)
    debugLog(`  Total deliveries: ${Object.values(deliveriesPerYear).reduce((a, b) => a + b, 0)}`)
    debugLog(`  Loop iterations: ${loopIterations}`)
    debugLog(`  Deliveries by year:`, deliveriesPerYear)

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

  private static getConsumptionStatus(_wine: Wine, _year: number): string {
    // Return empty string - year/month already shown in timeline structure
    // Avoids "THIS YEAR" / "NEXT YEAR" clutter per user feedback
    return ''
  }

}
