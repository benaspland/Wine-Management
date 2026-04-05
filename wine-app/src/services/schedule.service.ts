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
  producer?: string
  name: string
  vintage: number
  region?: string
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
    yearsToSchedule: number = 3,
    annualConsumptionTarget: number = DELIVERY_CONFIG.annualTarget
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
      if (w.quantity_at_home > 0) {
        wineAvailability[w.id] = currentYearMonth
      } else if (w.quantity_in_storage > 0) {
        // Otherwise, check delivery schedule
        const delivery = deliveryScheduleEntries?.find(d => d.wine_id === w.id && d.status === 'pending')
        if (delivery) {
          // Extract YYYY-MM from delivery date (YYYY-MM-DD format)
          wineAvailability[w.id] = delivery.scheduled_date.substring(0, 7)
        } else {
          // No delivery scheduled — exclude from drinking schedule entirely.
          // All storage wines should be assigned a delivery window by the delivery algorithm.
          wineAvailability[w.id] = '9999-12'
        }
      }
    })

    const homeWines = allWines.filter(w => w.quantity_at_home > 0)
    const storageWines = allWines.filter(w => w.quantity_in_storage > 0)

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
    const targetPerYear = annualConsumptionTarget
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
      const slotsPerMonth = Math.ceil(targetForYear / monthsInYear) // slots across remaining months

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

            let monthNum = this.calculateConsumptionMonthDistributed(year, month, yearsConsumption.length)

            // Ensure suggested month is never before the wine's availability month
            const avail = wineAvailability[selectedWine.id]
            if (avail) {
              const [availYear, availMonth] = avail.split('-').map(Number)
              if (year === availYear && monthNum < availMonth) {
                monthNum = availMonth
              }
            }

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
          let monthNum = this.calculateConsumptionMonthDistributed(year, (i % 12) + 1, yearsConsumption.length)

          // Ensure suggested month is never before the wine's availability month
          const avail = wineAvailability[wine.id]
          if (avail) {
            const [availYear, availMonth] = avail.split('-').map(Number)
            if (year === availYear && monthNum < availMonth) {
              monthNum = availMonth
            }
          }

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
    cellarCapacity: number = 80,
    currentBottlesAtHome: number = 0,
    deliveryMonths: [number, number] = [3, 9],
    annualConsumptionTarget: number = 30
  ): DeliveryScheduleEntry[] {
    console.log('[ScheduleService] ✓ generateDeliverySchedule called')
    const storageWines = allWines.filter(w => w.quantity_in_storage > 0)

    if (storageWines.length === 0) {
      console.log('[ScheduleService] ✓ No storage wines, returning empty schedule')
      return []
    }

    const currentYear = new Date().getFullYear()
    const currentMonth = new Date().getMonth() + 1
    const tier45StartYear = DELIVERY_CONFIG.tier45StartYear

    console.log(
      `[ScheduleService] ✓ Starting delivery schedule generation: ${storageWines.length} wines, ${currentBottlesAtHome} bottles at home, capacity ${cellarCapacity}`
    )

    // Helper functions
    const caseSize = (wine: Wine): number => {
      const size = wine.format?.toLowerCase() || '750ml'
      if (size.includes('half') || size === '375ml') return 12
      if (size.includes('magnum') || size.includes('1.5l')) return 3
      if (size === '75cl' || size === '750ml') return 6
      debugLog(`[caseSize] Unknown size for ${wine.producer} ${wine.name}: "${wine.format}", defaulting to 6`)
      return 6
    }

    const maxPerYear = (wine: Wine): number => (wine.format?.toLowerCase().includes('magnum') ? 1 : 2)

    // State tracking
    const remaining: Record<string, number> = {}
    const home: Record<string, number> = {}
    const wineMap: Record<string, Wine> = {}
    const lastDrunk: Record<string, number> = {}

    storageWines.forEach(w => {
      remaining[w.id] = w.quantity_in_storage
      home[w.id] = 0
      wineMap[w.id] = w
    })

    const candidateWines = Object.values(wineMap).filter(w => w.quantity_in_storage > 0)
    const totalBottlesAvailable = candidateWines.reduce((sum, w) => sum + w.quantity_in_storage, 0)

    console.log(`[ScheduleService] ${candidateWines.length} wines available, ${totalBottlesAvailable} bottles total`)

    const deliveriesPerYear: Record<number, number> = {}
    const deliveries: DeliveryScheduleEntry[] = []
    let loopIterations = 0
    const maxLoopIterations = 5000

    console.log(`[ScheduleService] 🔍 TRACE: Starting with maxLoopIterations=${maxLoopIterations}`)

    // MAIN YEAR-BY-YEAR LOOP
    for (let year = currentYear; year < currentYear + 100 && loopIterations < maxLoopIterations; year++) {
      if (Object.values(remaining).reduce((a, b) => a + b, 0) === 0) break

      const drunkThisYear: Record<string, number> = {}

      // ════════════════════════════════════════════
      // DELIVERY PHASE (up to 2 deliveries per year)
      // ════════════════════════════════════════════
      for (let deliverySlot = 0; deliverySlot < 2; deliverySlot++) {
        loopIterations++
        if (loopIterations > maxLoopIterations) break

        const month = deliveryMonths[deliverySlot]

        // Skip past months in current year
        if (year === currentYear && month < currentMonth) continue

        // Max 2 deliveries per year
        if (!deliveriesPerYear[year]) deliveriesPerYear[year] = 0
        if (deliveriesPerYear[year] >= 2) continue

        // 4.1 Check available space at home
        const homeTotal = Object.values(home).reduce((a, b) => a + b, 0)
        const space = cellarCapacity - homeTotal
        if (space < 3) break // Not enough room for any case — wait for consumption to free space

        // 4.2 Build candidate list
        const unscheduledWines = candidateWines.filter(w => remaining[w.id] > 0)
        const candidates: Array<{ wine: Wine; priority: number }> = []

        unscheduledWines.forEach(wine => {
          const timeLeft = wine.drinking_window_end - year
          const timeToOpen = Math.max(0, wine.drinking_window_start - year)

          // Exclusion filters (window-closed wines are still included — better delivered late than never)
          if (wine.tier >= 4 && year < tier45StartYear) return // Category 4-5 before 2029
          const maxLead = wine.tier <= 2 ? 2 : 1
          if (timeLeft > 0 && timeToOpen > maxLead) return // Too early (only if window hasn't closed)

          // Priority scoring (based on prototype)
          let priority = 500

          // URGENCY — past-window wines get highest priority (deliver ASAP)
          if (timeLeft <= 0) priority = 5000
          else if (timeLeft <= 3) priority = 3000 - timeLeft
          else if (timeLeft <= 6) priority = 2000 - timeLeft
          else if (timeLeft <= 10) priority = 1000 - timeLeft

          // DRINKABILITY
          if (wine.drinking_window_start <= year) {
            priority += 1500
          } else {
            priority -= timeToOpen * 300
          }

          // CATEGORY PREFERENCE
          if (wine.tier === 1) {
            priority += 600
            if (year <= currentYear + 3) priority += 500
          } else if (wine.tier === 2) {
            priority += 300
            if (year <= currentYear + 2) priority += 200
          } else if (wine.tier === 3) {
            if (year <= currentYear + 2 && timeLeft > 8) priority -= 400
          } else if (wine.tier >= 4) {
            // Tier 4-5: use deterministic selection (every 4th wine) for early priority boost
            // This spreads premium wines naturally across schedule without over-clustering them
            const wineIndex = candidateWines.findIndex(w => w.id === wine.id)
            const isSelected = wineIndex % 4 === 0  // Every 4th wine gets boost
            if (isSelected) {
              priority += 300  // Moderate boost to pull selected wines forward
            } else {
              priority -= 100 * (wine.tier - 3)  // Normal penalty for others
            }
          }

          // HOME STOCK
          if (home[wine.id] >= caseSize(wine)) {
            priority -= 800
          } else if (home[wine.id] === 0) {
            priority += 100
          }

          candidates.push({ wine, priority })
        })

        if (candidates.length === 0) continue

        // 4.3 Sort and build delivery cases (without moving yet)
        candidates.sort((a, b) => b.priority - a.priority)

        const cases: Array<{ wine: Wine; bottles: number }> = []
        let totalDelivered = 0

        for (const { wine } of candidates) {
          if (totalDelivered >= space) break // Cellar full for this delivery

          const cs = caseSize(wine)
          if (remaining[wine.id] === 0) continue

          const deliverAmount = remaining[wine.id] >= cs ? cs : remaining[wine.id]
          if (deliverAmount <= 0 || deliverAmount > space - totalDelivered) continue

          cases.push({ wine, bottles: deliverAmount })
          totalDelivered += deliverAmount
        }

        // Check if this delivery should be recorded
        // Only move wines to home if delivery meets criteria
        const totalRemaining = Object.values(remaining).reduce((a, b) => a + b, 0)
        const isFinalDelivery = totalRemaining > 0 && totalRemaining < 24
        const shouldDeliver = (totalDelivered >= 24) || isFinalDelivery

        if (shouldDeliver && cases.length > 0) {
          const scheduledDate = new Date(year, month - 1, 1)

          // NOW move wines to home and record delivery
          cases.forEach(({ wine, bottles }) => {
            remaining[wine.id] -= bottles
            home[wine.id] += bottles
            deliveries.push({
              wine_id: wine.id,
              quantity: bottles,
              scheduled_date: scheduledDate.toISOString().split('T')[0],
              tier: wine.tier,
              region: wine.region,
              status: 'pending',
            })
          })

          deliveriesPerYear[year]++
          console.log(`  [${year}-${String(month).padStart(2, '0')}] Delivered ${totalDelivered} bottles`)
        }
      }

      // ════════════════════════════════════════════
      // DRINKING PHASE (target 30 bottles/year)
      // ════════════════════════════════════════════

      const getDrinkable = (): Array<{ id: string; urgency: number; tier: number }> => {
        const pool: Array<{ id: string; urgency: number; tier: number }> = []

        candidateWines.forEach(wine => {
          if (home[wine.id] <= 0) return
          if (wine.drinking_window_start > year || wine.drinking_window_end < year) return

          const maxY = maxPerYear(wine)
          const drunk = drunkThisYear[wine.id] || 0
          if (drunk >= maxY) return

          // Category 4/5 spacing
          if (wine.tier >= 4) {
            const bottlesLeft = home[wine.id] + (remaining[wine.id] || 0)
            const yearsLeft = Math.max(1, wine.drinking_window_end - year)
            const idealGap = Math.max(1, Math.floor(yearsLeft / Math.max(1, bottlesLeft)))
            if (lastDrunk[wine.id] && year - lastDrunk[wine.id] < idealGap && bottlesLeft > 2) return
          }

          const timeLeft = wine.drinking_window_end - year
          let urgency = 1.0 / Math.max(1, timeLeft)
          if (wine.tier === 1) urgency += 0.3
          else if (wine.tier === 2) urgency += 0.15

          pool.push({ id: wine.id, urgency, tier: wine.tier })
        })

        return pool.sort((a, b) => b.urgency - a.urgency || a.tier - b.tier)
      }

      let drinkCount = 0

      // Pass 0: One of each (variety)
      if (drinkCount < annualConsumptionTarget) {
        const pool = getDrinkable()
        pool.forEach(({ id }) => {
          if (drinkCount >= annualConsumptionTarget) return
          const drunk = drunkThisYear[id] || 0
          if (drunk >= 1) return
          if (home[id] <= 0) return

          home[id]--
          drunkThisYear[id] = 1
          lastDrunk[id] = year
          drinkCount++
        })
      }

      // Pass 1: Second bottles for Cat 1-3
      if (drinkCount < annualConsumptionTarget) {
        const pool = getDrinkable()
        pool.forEach(({ id, tier }) => {
          if (drinkCount >= annualConsumptionTarget) return
          const wine = wineMap[id]
          if (wine.format?.toLowerCase().includes('magnum')) return
          const drunk = drunkThisYear[id] || 0
          if (drunk !== 1 || drunk >= 2) return
          if (tier > 3) return
          if (home[id] <= 0) return

          home[id]--
          drunkThisYear[id] = 2
          lastDrunk[id] = year
          drinkCount++
        })
      }

      // Pass 2: Second bottles for Cat 4-5
      if (drinkCount < annualConsumptionTarget) {
        const pool = getDrinkable()
        pool.forEach(({ id }) => {
          if (drinkCount >= annualConsumptionTarget) return
          const wine = wineMap[id]
          if (wine.format?.toLowerCase().includes('magnum')) return
          const drunk = drunkThisYear[id] || 0
          if (drunk !== 1 || drunk >= 2) return
          if (home[id] <= 0) return

          home[id]--
          drunkThisYear[id] = 2
          lastDrunk[id] = year
          drinkCount++
        })
      }
    }

    const totalScheduled = deliveries.reduce((sum, d) => sum + d.quantity, 0)
    const remainingBottles = Object.values(remaining).reduce((a, b) => a + b, 0)

    console.log('[ScheduleService] 🔍 TRACE: Schedule generation complete')
    console.log(`  🔍 Total scheduled: ${totalScheduled} / ${totalBottlesAvailable} bottles`)
    console.log(`  🔍 Remaining bottles: ${remainingBottles}`)
    console.log(`  🔍 Total deliveries: ${deliveries.length}`)
    console.log(`  🔍 Loop iterations: ${loopIterations}`)

    return deliveries
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
}
