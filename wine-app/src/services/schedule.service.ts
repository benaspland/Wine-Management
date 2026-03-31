import type { Wine, DeliveryScheduleEntry } from '../types/index'
import { DELIVERY_CONFIG } from '../config/deliveryConfig'

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
    deliveryMonths: [number, number] = [3, 9], // January (month 1) and July (month 7) in prototype, March (3) and September (9) here
    annualConsumptionTarget: number = 30
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
    const tier45StartYear = DELIVERY_CONFIG.tier45StartYear

    console.log(
      `[ScheduleService] ✓ Starting delivery schedule generation: ${storageWines.length} wines, ${currentBottlesAtHome} bottles at home, capacity ${cellarCapacity}`
    )

    // Helper functions
    const caseSize = (wine: Wine): number => {
      const size = wine.format?.toLowerCase() || ''
      if (size.includes('half') || size === '375ml') return 12
      if (size.includes('magnum') || size.includes('1.5l')) return 3
      if (size === '75cl' || size === '750ml') return 6
      // Anything larger than magnum
      debugLog(`[caseSize] Unknown size for ${wine.producer} ${wine.name}: "${wine.format}", defaulting to 1`)
      return 1
    }

    // State tracking
    const remaining: Record<string, number> = {}
    const home: Record<string, number> = {}
    const wineMap: Record<string, Wine> = {}

    storageWines.forEach(w => {
      remaining[w.id] = w.quantity
      home[w.id] = 0
      wineMap[w.id] = w
    })

    const candidateWines = Object.values(wineMap).filter(w => w.quantity > 0)
    const totalBottlesAvailable = candidateWines.reduce((sum, w) => sum + w.quantity, 0)

    console.log(`[ScheduleService] ${candidateWines.length} wines available, ${totalBottlesAvailable} bottles total`)

    // Calculate category counts
    const categoryCounts: Record<number, number> = {}
    for (let cat = 1; cat <= 5; cat++) {
      categoryCounts[cat] = candidateWines.filter(w => w.tier === cat).length
    }
    debugLog('[ScheduleService] Category distribution:', categoryCounts)

    const deliveriesPerYear: Record<number, number> = {}
    let loopIterations = 0
    const maxLoopIterations = 5000 // Increased to handle full 50-year horizon with consumption cycles

    console.log(`[ScheduleService] 🔍 TRACE: Starting with maxLoopIterations=${maxLoopIterations}`)

    // MAIN DELIVERY LOOP
    for (let year = currentYear; year < currentYear + 100 && loopIterations < maxLoopIterations; year++) {
      if (Object.values(remaining).reduce((a, b) => a + b, 0) === 0) break

      for (let deliverySlot = 0; deliverySlot < 2; deliverySlot++) {
        loopIterations++
        if (loopIterations > maxLoopIterations) break

        const month = deliveryMonths[deliverySlot]

        // Skip past months in current year
        if (year === currentYear && month < currentMonth) continue

        // Max 2 deliveries per year
        if (!deliveriesPerYear[year]) deliveriesPerYear[year] = 0
        if (deliveriesPerYear[year] >= 2) continue

        // Get unscheduled wines with remaining bottles
        const unscheduledWines = candidateWines.filter(w => remaining[w.id] > 0)
        if (unscheduledWines.length === 0) break

        // BUILD CANDIDATE LIST with priority scoring
        const candidates: Array<{ wine: Wine; priority: number }> = []

        unscheduledWines.forEach(wine => {
          // Window constraints
          const timeLeft = wine.drinking_window_end - year
          if (timeLeft <= 0) return // Window closed - MUST SKIP
          const timeToOpen = Math.max(0, wine.drinking_window_start - year)

          // Lead-time constraints: be more lenient to avoid missing windows
          const maxLead = wine.tier <= 2 ? 3 : 2 // Increased from 2 and 1
          if (timeToOpen > maxLead) return // Too early

          // Category 4-5 constraint
          if (wine.tier >= 4 && year < tier45StartYear) return

          // Base priority
          let priority = 500

          // URGENCY: window closing soon (PRIMARY FACTOR)
          if (timeLeft <= 1) priority = 5000 // Last year - MUST DELIVER
          else if (timeLeft <= 2) priority = 3500 // Closing soon
          else if (timeLeft <= 3) priority = 3000
          else if (timeLeft <= 6) priority = 2000
          else if (timeLeft <= 10) priority = 1000

          // DRINKABILITY: window already open?
          if (wine.drinking_window_start <= year) {
            priority += 1500 // Big bonus
          } else {
            // Less penalty for early delivery to ensure we capture wines
            priority -= Math.min(300, timeToOpen * 100)
          }

          // CATEGORY PREFERENCE - simplified to avoid deprioritizing
          if (wine.tier === 1) {
            priority += 600
            if (year <= currentYear + 5) priority += 200 // Extended boost
          } else if (wine.tier === 2) {
            priority += 300
            if (year <= currentYear + 4) priority += 100 // Extended boost
          } else if (wine.tier === 3) {
            priority += 150 // Give Tier 3 a baseline boost
          } else if (wine.tier === 4) {
            priority += 50 // Slight boost for Tier 4
          } else if (wine.tier === 5) {
            priority += 25 // Small boost for Tier 5
          }

          // HOME STOCK: avoid overdelivering one wine, but be lenient
          if (home[wine.id] >= caseSize(wine) * 2) {
            priority -= 500 // Only penalize if we have 2+ cases at home
          } else if (home[wine.id] === 0) {
            priority += 150 // Variety bonus - higher to encourage first delivery
          }

          // DIVERSITY: prefer new producers/regions (slight bonus)
          const winesAtHome = Object.entries(home)
            .filter(([, qty]) => qty > 0)
            .map(([id]) => wineMap[id])
          const producersAtHome = new Set(winesAtHome.map(w => w.producer))
          const regionsAtHome = new Set(winesAtHome.map(w => w.region))

          if (!producersAtHome.has(wine.producer)) priority += 75
          if (!regionsAtHome.has(wine.region)) priority += 50

          candidates.push({ wine, priority })
        })

        if (candidates.length === 0) continue

        // Sort by priority descending
        candidates.sort((a, b) => b.priority - a.priority)

        // CALCULATE CAPACITY
        // Account for pending deliveries scheduled before this slot
        const pendingDeliveriesBeforeThisSlot = schedule.filter(d => {
          const dYear = parseInt(d.scheduled_date.split('-')[0])
          const dMonth = parseInt(d.scheduled_date.split('-')[1])
          if (dYear < year) return true
          if (dYear === year) return dMonth < month
          return false
        })
        const pendingBottles = pendingDeliveriesBeforeThisSlot.reduce((sum, d) => sum + d.quantity, 0)

        // Consumption from start of planning period until this delivery
        // Using simpler model: months accumulate based on delivery slot position
        const monthsFromStart = (year - currentYear) * 12 + (deliverySlot * 6)
        const consumption = Math.round((annualConsumptionTarget / 12) * monthsFromStart)

        const bottlesAtHomeWhenDeliveryArrives = currentBottlesAtHome + pendingBottles - consumption
        const targetAvailableCapacity = Math.max(0, cellarCapacity - bottlesAtHomeWhenDeliveryArrives)

        // DELIVER - in case increments (6, 3, 12) or remainder if less than case size
        const cases: Array<{ wine: Wine; bottles: number }> = []
        let totalDelivered = 0

        for (const { wine } of candidates) {
          if (totalDelivered >= targetAvailableCapacity) break

          const cs = caseSize(wine)

          // Skip if nothing left of this wine
          if (remaining[wine.id] === 0) continue

          // Deliver either a full case OR the remainder (if less than case size)
          const deliverAmount = remaining[wine.id] >= cs ? cs : remaining[wine.id]

          if (deliverAmount <= 0 || deliverAmount > targetAvailableCapacity - totalDelivered) continue

          cases.push({ wine, bottles: deliverAmount })
          remaining[wine.id] -= deliverAmount
          home[wine.id] += deliverAmount
          totalDelivered += deliverAmount
        }

        // Record delivery
        const totalRemaining = Object.values(remaining).reduce((a, b) => a + b, 0)
        const shouldDeliver =
          totalDelivered >= minDeliveryBottles || (totalRemaining === 0 && totalDelivered > 0) || (candidates.length === cases.length && cases.length > 0)

        if (shouldDeliver && cases.length > 0) {
          const scheduledDate = new Date(year, month - 1, 1)

          cases.forEach(({ wine, bottles }) => {
            schedule.push({
              id: `delivery-${wine.id}-${year}-${month}`,
              wine_id: wine.id,
              quantity: bottles,
              scheduled_date: scheduledDate.toISOString().split('T')[0],
              from_location: 'storage',
              to_location: 'home',
              status: 'pending',
              created_at: new Date().toISOString(),
            })
          })

          deliveriesPerYear[year]++

          if (loopIterations % 20 === 0) {
            console.log(
              `  [${year}-${String(month).padStart(2, '0')}] Delivered ${totalDelivered} bottles (${cases.length} wines), capacity available: ${targetAvailableCapacity}`
            )
          }
        }
      }
    }

    const totalBottlesScheduled = schedule.reduce((sum, d) => sum + d.quantity, 0)
    const remainingBottles = Object.values(remaining).reduce((a, b) => a + b, 0)

    console.log('[ScheduleService] 🔍 TRACE: Loop ended')
    console.log(`  🔍 Loop iterations: ${loopIterations} (max: ${maxLoopIterations})`)
    console.log(`  🔍 Remaining bottles: ${remainingBottles}`)
    console.log(`  🔍 Loop ended because: ${remainingBottles === 0 ? 'ALL WINES SCHEDULED' : loopIterations >= maxLoopIterations ? 'MAX ITERATIONS HIT' : 'UNKNOWN'}`)

    console.log('[ScheduleService] ✓ Delivery scheduling complete:')
    console.log(`  Wines with deliveries: ${new Set(schedule.map(d => d.wine_id)).size} / ${candidateWines.length}`)
    console.log(`  Bottles scheduled: ${totalBottlesScheduled} / ${totalBottlesAvailable}`)
    console.log(`  Total deliveries: ${Object.values(deliveriesPerYear).reduce((a, b) => a + b, 0)}`)
    console.log(`  Loop iterations: ${loopIterations}`)

    debugLog('[ScheduleService] Delivery scheduling complete:')
    debugLog(`  Bottles scheduled: ${totalBottlesScheduled} / ${totalBottlesAvailable}`)
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

  /**
   * Calculate months between two delivery slots
   */
  private static monthsBetweenSlots(
    from: { year: number; monthIndex: number },
    to: { year: number; monthIndex: number },
    deliveryMonths: [number, number]
  ): number {
    const fromMonth = deliveryMonths[from.monthIndex]
    const toMonth = deliveryMonths[to.monthIndex]
    const yearDiff = to.year - from.year

    if (yearDiff === 0) {
      // Same year
      return toMonth > fromMonth ? toMonth - fromMonth : 0
    }

    // Across years: months remaining in from year + months in to year
    return (12 - fromMonth) + toMonth + (yearDiff - 1) * 12
  }

}
