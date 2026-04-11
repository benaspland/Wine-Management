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

export interface DeliveryDisplayWine {
  id: string
  name: string
  producer?: string
  vintage: number
  region?: string
  tier: number
  quantity: number
  format?: string
}

export interface DeliveryDisplayEntry {
  date: string
  windowId: string
  status: string
  locked: boolean
  wines: DeliveryDisplayWine[]
}

export interface DisplayDbWindow {
  id: string
  scheduled_date: string
  status: string
  locked: boolean
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

    // Track total bottles scheduled per wine — never exceed actual inventory
    const wineTotalScheduled: Record<string, number> = {}
    const wineBottleLimit: Record<string, number> = {}
    allWines.forEach(w => {
      wineTotalScheduled[w.id] = 0
      wineBottleLimit[w.id] = w.quantity_in_storage + w.quantity_at_home
    })

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

      // Helper: build candidate list for a given month with a max-per-year filter
      const buildCandidates = (month: number, maxTimesThisYear: number) => {
        const monthYearMonth = `${year}-${String(month).padStart(2, '0')}`
        const lastMonthProducers = yearsConsumption.slice(-2).map(e => e.producer)

        return allWines.filter(w => {
          const availabilityYearMonth = wineAvailability[w.id]
          const timesThisYear = yearsConsumption.filter(e => e.wineId === w.id).length
          // Magnums and Tier 4-5 never get a 2nd bottle
          const hardMax = (w.format?.toLowerCase().includes('magnum') || w.tier >= 4) ? 1 : maxTimesThisYear
          const alreadyThisMonth = yearsConsumption.some(
            e => e.wineId === w.id && e.suggestedMonth === month
          )
          return (
            ScheduleService.canConsumeThisYear(w, year) &&
            availabilityYearMonth <= monthYearMonth &&
            wineTotalScheduled[w.id] < wineBottleLimit[w.id] &&
            timesThisYear < hardMax &&
            !alreadyThisMonth &&
            !lastMonthProducers.includes(w.producer)
          )
        })
      }

      // Helper: pick wines from a candidate list by tier preference
      const pickFromCandidates = (candidates: Wine[], slotsToFill: number, month: number) => {
        const candidatesByTier = {
          1: candidates.filter(w => w.tier === 1),
          2: candidates.filter(w => w.tier === 2),
          3: candidates.filter(w => w.tier === 3),
          4: candidates.filter(w => w.tier === 4),
          5: candidates.filter(w => w.tier === 5),
        }

        let slotsFilled = 0
        for (const tier of [1, 2, 3, 4, 5]) {
          while (
            slotsFilled < slotsToFill &&
            candidatesByTier[tier as keyof typeof candidatesByTier].length > 0
          ) {
            const tierCandidates = candidatesByTier[tier as keyof typeof candidatesByTier]

            let selectedWine: Wine | undefined
            if (tier >= 4) {
              selectedWine = tierCandidates.find(
                w => !wineLastConsumedYear[w.id] || year - wineLastConsumedYear[w.id] >= tier4_5MinSpacingYears
              )
              if (!selectedWine && tierCandidates.length > 0) {
                selectedWine = tierCandidates[0]
              }
            } else {
              selectedWine = tierCandidates[0]
            }

            if (!selectedWine) break

            let monthNum = ScheduleService.calculateConsumptionMonth(month)
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
              status: ScheduleService.getConsumptionStatus(selectedWine, year),
            })

            wineLastConsumedYear[selectedWine.id] = year
            wineTotalScheduled[selectedWine.id]++
            slotsFilled++

            const idx = tierCandidates.indexOf(selectedWine)
            if (idx > -1) tierCandidates.splice(idx, 1)
          }
        }
        return slotsFilled
      }

      // Distribute wines across 12 months with tier preference
      // Pass 1: unique wines only (each wine at most once this year)
      for (let month = 1; month <= 12; month++) {
        const slotsToFill = Math.min(slotsPerMonth, maxConsumption - yearsConsumption.length)
        if (slotsToFill <= 0) break

        const candidates = buildCandidates(month, 1) // max 1 per year = unique only
        pickFromCandidates(candidates, slotsToFill, month)
      }

      // Pass 2: if slots remain, allow a 2nd bottle of wines already scheduled
      // this year — but only because no unique wines were available.
      // Prioritise months with fewest entries to fill gaps evenly.
      if (yearsConsumption.length < minConsumption) {
        // Count entries per month so we fill the emptiest months first
        const monthOrder = Array.from({ length: 12 }, (_, i) => i + 1)
          .sort((a, b) => {
            const countA = yearsConsumption.filter(e => e.suggestedMonth === a).length
            const countB = yearsConsumption.filter(e => e.suggestedMonth === b).length
            return countA - countB
          })

        for (const month of monthOrder) {
          const currentCount = yearsConsumption.filter(e => e.suggestedMonth === month).length
          const slotsToFill = Math.min(slotsPerMonth - currentCount, maxConsumption - yearsConsumption.length)
          if (slotsToFill <= 0) continue

          const candidates = buildCandidates(month, 2) // allow 2nd bottles
          pickFromCandidates(candidates, slotsToFill, month)
        }
      }

      // Add padding if under minimum
      if (yearsConsumption.length < minConsumption) {
        const padding = minConsumption - yearsConsumption.length
        const availableWinesForPadding = allWines.filter(
          w =>
            ScheduleService.canConsumeThisYear(w, year) &&
            wineAvailability[w.id] <= `${year}-12` && // Available by end of year
            wineTotalScheduled[w.id] < wineBottleLimit[w.id] && // Still have bottles left
            !yearsConsumption.some(e => e.wineId === w.id)
        )

        const maxPadding = Math.min(padding, availableWinesForPadding.length)
        for (let i = 0; i < maxPadding; i++) {
          const wine = availableWinesForPadding[i]
          let monthNum = this.calculateConsumptionMonth((i % 12) + 1)

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
          wineTotalScheduled[wine.id]++
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
    annualConsumptionTarget: number = 30,
    minDeliveryBottles: number = 24
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

    // State tracking
    const remaining: Record<string, number> = {}
    const home: Record<string, number> = {}
    const wineMap: Record<string, Wine> = {}
    const lastDrunk: Record<string, number> = {}

    // Include storage wines in the sim
    storageWines.forEach(w => {
      remaining[w.id] = w.quantity_in_storage
      home[w.id] = w.quantity_at_home  // start with bottles already at home
      wineMap[w.id] = w
    })

    // Also include wines that are ONLY at home (storage = 0) so they occupy
    // cellar space and get consumed in the drinking sim
    allWines.forEach(w => {
      if (w.quantity_at_home > 0 && w.quantity_in_storage === 0) {
        remaining[w.id] = 0
        home[w.id] = w.quantity_at_home
        wineMap[w.id] = w
      }
    })

    const candidateWines = Object.values(wineMap)
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

      // Helper: simulate drinking for a given number of months
      // This allows us to simulate consumption BETWEEN delivery slots
      const simulateDrinking = (monthsToSimulate: number) => {
        const target = Math.round((annualConsumptionTarget * monthsToSimulate) / 12)

        const getDrinkable = (): Array<{ id: string; urgency: number; tier: number }> => {
          const pool: Array<{ id: string; urgency: number; tier: number }> = []
          candidateWines.forEach(wine => {
            if (home[wine.id] <= 0) return
            if (wine.drinking_window_start > year || wine.drinking_window_end < year) return
            // Hard caps (real constraints): magnums and Tier 4-5 limited to 1/year.
            // Normal wines have no per-year cap in the delivery sim — we plan to
            // meet the user's actual consumption target.
            const isHardCapped = wine.format?.toLowerCase().includes('magnum') || wine.tier >= 4
            const maxY = isHardCapped ? 1 : Infinity
            const drunk = drunkThisYear[wine.id] || 0
            if (drunk >= maxY) return
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
        if (drinkCount < target) {
          const pool = getDrinkable()
          pool.forEach(({ id }) => {
            if (drinkCount >= target) return
            const drunk = drunkThisYear[id] || 0
            if (drunk >= 1) return
            if (home[id] <= 0) return
            home[id]--
            drunkThisYear[id] = (drunkThisYear[id] || 0) + 1
            lastDrunk[id] = year
            drinkCount++
          })
        }

        // Top-up passes: keep cycling through drinkable wines (by urgency) adding
        // additional bottles until the target for this window is reached or no
        // more drinkable bottles exist. Magnums and Tier 4-5 are excluded from
        // top-ups via the hard cap in getDrinkable.
        let topUpGuard = 0
        while (drinkCount < target && topUpGuard < 1000) {
          topUpGuard++
          const pool = getDrinkable()
          if (pool.length === 0) break
          let drankThisPass = 0
          for (const { id } of pool) {
            if (drinkCount >= target) break
            if (home[id] <= 0) continue
            home[id]--
            drunkThisYear[id] = (drunkThisYear[id] || 0) + 1
            lastDrunk[id] = year
            drinkCount++
            drankThisPass++
          }
          if (drankThisPass === 0) break
        }
      }

      // ════════════════════════════════════════════
      // DELIVERY PHASE (up to 2 deliveries per year)
      // Drinking is simulated BETWEEN delivery slots so space calculations
      // account for bottles consumed since the last check point.
      // ════════════════════════════════════════════
      let lastSimulatedMonth = (year === currentYear) ? currentMonth : 1

      for (let deliverySlot = 0; deliverySlot < 2; deliverySlot++) {
        loopIterations++
        if (loopIterations > maxLoopIterations) break

        const month = deliveryMonths[deliverySlot]

        // Skip past months in current year
        if (year === currentYear && month < currentMonth) continue

        // Simulate drinking from last check point up to this delivery month
        // so the space calculation reflects bottles consumed in the interim
        const monthsSinceLastSim = month - lastSimulatedMonth
        if (monthsSinceLastSim > 0) {
          simulateDrinking(monthsSinceLastSim)
          lastSimulatedMonth = month
        }

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

        // Track committed quantities per wine across multi-pass case building
        const committed: Record<string, number> = {}

        // Pass 1: diversity — one case per wine, in priority order
        for (const { wine } of candidates) {
          if (totalDelivered >= space) break // Cellar full for this delivery

          const cs = caseSize(wine)
          const available = remaining[wine.id] - (committed[wine.id] || 0)
          if (available <= 0) continue

          const deliverAmount = available >= cs ? cs : available
          if (deliverAmount <= 0 || deliverAmount > space - totalDelivered) continue

          cases.push({ wine, bottles: deliverAmount })
          committed[wine.id] = (committed[wine.id] || 0) + deliverAmount
          totalDelivered += deliverAmount
        }

        // Pass 2: filler — after every candidate has had its first case,
        // keep adding additional cases from wines with remaining stock to
        // fully use the available space. Matters when a wine has multiple
        // cases and the cellar can accommodate them, so a small remainder
        // isn't orphaned across future windows.
        let madeProgress = true
        while (madeProgress && totalDelivered < space) {
          madeProgress = false
          for (const { wine } of candidates) {
            if (totalDelivered >= space) break

            const cs = caseSize(wine)
            const available = remaining[wine.id] - (committed[wine.id] || 0)
            if (available <= 0) continue

            const deliverAmount = available >= cs ? cs : available
            if (deliverAmount <= 0 || deliverAmount > space - totalDelivered) continue

            cases.push({ wine, bottles: deliverAmount })
            committed[wine.id] = (committed[wine.id] || 0) + deliverAmount
            totalDelivered += deliverAmount
            madeProgress = true
          }
        }

        // Check if this delivery should be recorded.
        // Enforce the configured minimum strictly — if not enough space has
        // freed up to meet the minimum, skip this window and wait for the
        // next one. The only exception is the TRULY final delivery: when
        // all remaining storage bottles fit in this one delivery (and nothing
        // will be left behind), allow it even if below minimum so we don't
        // orphan the last few bottles. Do NOT allow dribbling sub-minimum
        // partial deliveries — that's the "bypass the minimum" bug.
        const totalRemaining = Object.values(remaining).reduce((a, b) => a + b, 0)
        const isFinalDelivery =
          totalDelivered > 0 &&
          totalDelivered >= totalRemaining &&
          totalRemaining < minDeliveryBottles
        const shouldDeliver = (totalDelivered >= minDeliveryBottles) || isFinalDelivery

        if (shouldDeliver && cases.length > 0) {
          // Format date as YYYY-MM-DD using local time (not UTC via toISOString,
          // which shifts the date back one day in timezones ahead of UTC like BST)
          const dateStr = `${year}-${String(month).padStart(2, '0')}-01`

          // NOW move wines to home and record delivery
          cases.forEach(({ wine, bottles }) => {
            remaining[wine.id] -= bottles
            home[wine.id] += bottles
            deliveries.push({
              wine_id: wine.id,
              quantity: bottles,
              scheduled_date: dateStr,
              tier: wine.tier,
              region: wine.region,
              status: 'pending',
            })
          })

          deliveriesPerYear[year]++
          console.log(`  [${year}-${String(month).padStart(2, '0')}] Delivered ${totalDelivered} bottles`)
        }
      }

      // Simulate remaining months of drinking after all delivery slots
      const remainingMonths = 12 - lastSimulatedMonth
      if (remainingMonths > 0) {
        simulateDrinking(remainingMonths)
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

  /**
   * Build the display-ready delivery schedule by reconciling the in-memory
   * scheduler output with DB-backed delivery windows.
   *
   * For locked windows, the DB curation is the source of truth. This means:
   * - Wines the scheduler placed at a locked date but aren't in the curation
   *   (e.g. the user deferred them) get relocated to the next unlocked
   *   delivery so they don't silently disappear from the schedule.
   * - Wines committed to a locked window (e.g. via promote) are removed from
   *   other delivery dates the scheduler would otherwise put them at, to
   *   avoid double-counting.
   *
   * If no unlocked delivery exists after a displaced wine's original date,
   * a new delivery entry is created at the next configured delivery month.
   */
  static buildDisplaySchedule(
    deliveries: DeliveryScheduleEntry[],
    wines: Wine[],
    dbWindows: DisplayDbWindow[],
    lockedWindowWines: Map<string, Array<{ wine_id: string; quantity: number }>>,
    deliveryMonths: [number, number] = [3, 9]
  ): DeliveryDisplayEntry[] {
    const wineMap = new Map(wines.map(w => [w.id, w]))

    const toDisplayWine = (
      wineId: string,
      quantity: number
    ): DeliveryDisplayWine | null => {
      const wine = wineMap.get(wineId)
      if (!wine) return null
      return {
        id: wine.id,
        name: wine.name,
        producer: wine.producer,
        vintage: wine.vintage,
        region: wine.region,
        tier: wine.tier,
        quantity,
        format: wine.format,
      }
    }

    // 1. Group scheduler output by date
    const grouped = new Map<string, DeliveryDisplayEntry>()
    const dbByDate = new Map(dbWindows.map(w => [w.scheduled_date, w]))

    for (const d of deliveries) {
      const displayWine = toDisplayWine(d.wine_id, d.quantity)
      if (!displayWine) continue

      const existing = grouped.get(d.scheduled_date)
      if (existing) {
        existing.wines.push(displayWine)
      } else {
        const dbWindow = dbByDate.get(d.scheduled_date)
        grouped.set(d.scheduled_date, {
          date: d.scheduled_date,
          windowId: dbWindow?.id || '',
          status: d.status,
          locked: dbWindow?.locked || false,
          wines: [displayWine],
        })
      }
    }

    // 2. Ensure locked DB windows always appear, even if scheduler produced
    //    nothing for them (e.g. all their wines were already delivered).
    for (const dbWindow of dbWindows) {
      if (dbWindow.locked && !grouped.has(dbWindow.scheduled_date)) {
        grouped.set(dbWindow.scheduled_date, {
          date: dbWindow.scheduled_date,
          windowId: dbWindow.id,
          status: dbWindow.status,
          locked: true,
          wines: [],
        })
      }
    }

    // 3. Collect all wine IDs committed to any locked window (for dedupe)
    const committedWineIds = new Set<string>()
    for (const dbWindow of dbWindows) {
      if (!dbWindow.locked) continue
      const dbWines = lockedWindowWines.get(dbWindow.id) || []
      for (const dw of dbWines) committedWineIds.add(dw.wine_id)
    }

    // 4. Reconcile locked windows: replace scheduler output with DB curation,
    //    collecting displaced wines (present in scheduler output but not in
    //    the DB curation for that locked date).
    const displaced: Array<{
      wineId: string
      quantity: number
      afterDate: string
    }> = []

    for (const entry of grouped.values()) {
      if (!entry.locked || !entry.windowId) continue
      const dbWines = lockedWindowWines.get(entry.windowId) || []
      const dbWineIds = new Set(dbWines.map(w => w.wine_id))

      // Collect wines the scheduler placed here that aren't in DB curation.
      // Skip any wine already committed to another locked window — that's
      // not a defer, it's a promote conflict handled below.
      for (const sw of entry.wines) {
        if (!dbWineIds.has(sw.id) && !committedWineIds.has(sw.id)) {
          displaced.push({
            wineId: sw.id,
            quantity: sw.quantity,
            afterDate: entry.date,
          })
        }
      }

      // Replace entry wines with DB curation (source of truth for locked)
      entry.wines = dbWines
        .map(dw => toDisplayWine(dw.wine_id, dw.quantity))
        .filter((w): w is DeliveryDisplayWine => w !== null)
    }

    // 5. Remove committed wines from unlocked entries. The scheduler doesn't
    //    know about locked windows, so it may have placed a committed wine
    //    at both its original date and also at a locked date. Strip the
    //    duplicate from the unlocked entry to avoid double-counting.
    for (const entry of grouped.values()) {
      if (entry.locked) continue
      entry.wines = entry.wines.filter(w => !committedWineIds.has(w.id))
    }

    // 6. Relocate displaced wines to the next unlocked delivery after the
    //    locked date. If none exists, create a new delivery entry at the
    //    next configured delivery month.
    const sortedDates = () =>
      Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b))

    for (const d of displaced) {
      const displayWine = toDisplayWine(d.wineId, d.quantity)
      if (!displayWine) continue

      let targetEntry: DeliveryDisplayEntry | null = null

      // First, try to find an existing unlocked delivery after afterDate
      for (const date of sortedDates()) {
        if (date <= d.afterDate) continue
        const entry = grouped.get(date)!
        if (!entry.locked) {
          targetEntry = entry
          break
        }
      }

      // Otherwise, walk forward through successive delivery-month dates
      // until we find one that either doesn't exist yet or isn't locked.
      if (!targetEntry) {
        let candidate = ScheduleService.nextDeliveryDate(
          d.afterDate,
          deliveryMonths
        )
        let guard = 0
        while (guard++ < 50) {
          const existing = grouped.get(candidate)
          if (!existing) {
            targetEntry = {
              date: candidate,
              windowId: '',
              status: 'pending',
              locked: false,
              wines: [],
            }
            grouped.set(candidate, targetEntry)
            break
          }
          if (!existing.locked) {
            targetEntry = existing
            break
          }
          candidate = ScheduleService.nextDeliveryDate(
            candidate,
            deliveryMonths
          )
        }
      }

      if (!targetEntry) continue

      // Merge with any existing entry for the same wine at the target
      const existing = targetEntry.wines.find(w => w.id === d.wineId)
      if (existing) {
        existing.quantity += d.quantity
      } else {
        targetEntry.wines.push(displayWine)
      }
    }

    // 7. Sort and drop empty unlocked entries (keep empty locked ones so
    //    the user can still see/manage them).
    return Array.from(grouped.values())
      .filter(e => e.wines.length > 0 || e.locked)
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  /**
   * Compute the next delivery date after the given date, using the
   * configured delivery months. Returns YYYY-MM-01.
   */
  private static nextDeliveryDate(
    afterDate: string,
    deliveryMonths: [number, number]
  ): string {
    const [year, month] = afterDate.split('-').map(Number)
    const sortedMonths = [...deliveryMonths].sort((a, b) => a - b)
    for (const m of sortedMonths) {
      if (m > month) {
        return `${year}-${String(m).padStart(2, '0')}-01`
      }
    }
    return `${year + 1}-${String(sortedMonths[0]).padStart(2, '0')}-01`
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

  private static calculateConsumptionMonth(targetMonth: number): number {
    // Wine is consumed in the month it was selected for — no shifting
    return Math.max(1, Math.min(12, targetMonth))
  }

  private static getConsumptionStatus(_wine: Wine, _year: number): string {
    // Return empty string - year/month already shown in timeline structure
    // Avoids "THIS YEAR" / "NEXT YEAR" clutter per user feedback
    return ''
  }
}
