import type { Wine, DeliveryScheduleEntry, StorageLocation } from '../types/index'
import { DELIVERY_CONFIG } from '../config/deliveryConfig'
import { bottlesPerCase, bottleVolumeMl, isMagnumOrLarger } from './format.service'
import {
  UNALLOCATED,
  isDeliveryMonth,
  nextDeliveryMonth,
  deliveryKey,
  rulesFor,
  unallocatedRules,
  windowLocation,
  type LocationRules,
} from './storageLocation.service'

// Debug logging helper - logs in development and when explicitly enabled
const debugLog = (...args: unknown[]) => {
  // Log in development/Vite dev mode OR if explicitly enabled
  const isDev = typeof window !== 'undefined' && (window as Window & { __DEV__?: boolean }).__DEV__
  const isDebugEnabled = typeof window !== 'undefined' && (window as Window & { __SCHEDULE_DEBUG__?: boolean }).__SCHEDULE_DEBUG__

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
  /** Date and source together — two lockers can deliver in one month. */
  key: string
  date: string
  /**
   * Where the delivery comes from: a location id, or UNALLOCATED.
   * Undefined only for an old window whose wines came from several.
   */
  locationId?: string
  windowId: string
  status: string
  locked: boolean
  wines: DeliveryDisplayWine[]
}

export interface DisplayDbWindow {
  id: string
  scheduled_date: string
  storage_location_id?: string
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
    /**
     * Floor, not ceiling. The plan runs until every bottle owned has a
     * slot, however long that takes — a fixed horizon guessed from the
     * wine count silently truncated the plan the moment the consumption
     * rate dropped, so the deliveries ran to 2051 while the drinking
     * stopped in 2038 and a third of the cellar was simply missing.
     */
    minYearsToSchedule: number = 3,
    annualConsumptionTarget: number = DELIVERY_CONFIG.annualTarget,
    /**
     * Bottles already drunk, per wine.
     *
     * The plan is built from bottles owned, and drinking one removes it
     * from that count — so without this the bottle was subtracted twice:
     * once from stock, and again when its log claimed one of the
     * remaining slots. Every drink quietly shrank the forward plan by a
     * bottle, and a wine whose last bottle was drunk vanished from the
     * schedule altogether, taking the record of drinking it with it.
     */
    consumedCounts: Record<string, number> = {}
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
      } else if (w.quantity_in_storage === 0 && (consumedCounts[w.id] ?? 0) > 0) {
        // Nothing left, but bottles were drunk: it was plainly available
        // once. Without a date here it fails the availability test and
        // never gets a slot, so the log has nothing to mark and the wine
        // disappears from the schedule entirely.
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
      // Bottles owned plus bottles already drunk: the drunk ones still
      // need a slot for their log to mark, and counting only what is
      // left costs the forward plan one slot per drink.
      wineBottleLimit[w.id] =
        w.quantity_in_storage + w.quantity_at_home + (consumedCounts[w.id] ?? 0)
    })

    /**
     * A wine only ever gets a slot if it is at home, has a delivery
     * booked, or has been drunk before. Anything else — no stock, or in
     * storage with no delivery window — can never be placed, so it must
     * not hold the loop open waiting for it.
     */
    const canEverBePlaced = (w: Wine) => {
      const avail = wineAvailability[w.id]
      return avail !== undefined && avail !== '9999-12' && wineBottleLimit[w.id] > 0
    }
    const availabilityYear = (id: string) => Number(wineAvailability[id]?.slice(0, 4) ?? 0)
    const unplaced = () =>
      allWines.filter(w => canEverBePlaced(w) && wineTotalScheduled[w.id] < wineBottleLimit[w.id])

    // Backstop only. The real exits are "every bottle placed" and
    // "nothing left that could ever become available".
    const hardYearCap = startYear + 100

    for (let year = startYear; year < hardYearCap; year++) {
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
          const hardMax = (isMagnumOrLarger(w.format) || w.tier >= 4) ? 1 : maxTimesThisYear
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
              status: ScheduleService.getConsumptionStatus(),
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
            status: this.getConsumptionStatus(),
          })

          wineLastConsumedYear[wine.id] = year
          wineTotalScheduled[wine.id]++
        }
      }

      yearlyConsumption[year] = yearsConsumption.length
      schedule.push(...yearsConsumption)

      // Keep the plan running for at least the minimum, then stop on
      // whichever comes first: every bottle placed, or a barren year with
      // nothing still waiting on a future delivery or drinking window —
      // at which point another century of years would add nothing.
      if (year < startYear + minYearsToSchedule - 1) continue

      const stillToPlace = unplaced()
      if (stillToPlace.length === 0) break

      if (yearsConsumption.length === 0) {
        const waiting = stillToPlace.some(
          w => w.drinking_window_start > year || availabilityYear(w.id) > year
        )
        if (!waiting) break
      }
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
   * Plan every bottle in storage home, month by month, across any number
   * of storage locations sharing one cellar at home.
   *
   * Each wine follows the rules of the location it is kept in — the
   * months it may come out, and the smallest delivery worth taking from
   * there, measured by volume so a magnum counts as two bottles. Wines
   * with no location follow `deliveryMonths` and `minDeliveryBottles`
   * (read as 75cl bottles), which is the app's original behaviour.
   *
   * Nothing here knows which providers exist. Every month, each location
   * that may deliver bids for the free space at home with its most
   * urgent wines; the most urgent bid is served first. A location that
   * is more urgent but cannot deliver this month has space held back for
   * it — less whatever will be drunk before its next slot — so a
   * flexible locker cannot keep the cellar topped up and starve a fixed
   * one of the room it needs on its one visit.
   *
   * Within a location the selection is unchanged: closing windows first,
   * drinkable over not-yet-ready, everyday ahead of icons early on, one
   * case of each wine before second cases, tier 4-5 not before 2029.
   */
  static generateDeliverySchedule(
    allWines: Wine[],
    cellarCapacity: number = 80,
    currentBottlesAtHome: number = 0,
    deliveryMonths: number[] = [3, 9],
    annualConsumptionTarget: number = 30,
    minDeliveryBottles: number = 24,
    committedQuantities: Record<string, number> = {},
    /**
     * Deliveries the user has fixed, keyed by `YYYY-MM-DD|locationId`
     * (UNALLOCATED for wine with no location). A bare date is a window
     * from before locations and stands in for every location that month.
     */
    lockedDeliveries: Record<string, Array<{ wine_id: string; quantity: number }>> = {},
    locations: StorageLocation[] = [],
    now: Date = new Date()
  ): DeliveryScheduleEntry[] {
    const storageWines = allWines.filter(w => w.quantity_in_storage > 0)
    if (storageWines.length === 0) return []

    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    const tier45StartYear = DELIVERY_CONFIG.tier45StartYear

    debugLog(
      `[ScheduleService] Delivery schedule: ${storageWines.length} wines, ${currentBottlesAtHome} at home, capacity ${cellarCapacity}, ${locations.length} locations`
    )

    // ── Locations ──
    const unallocated: LocationRules = {
      ...unallocatedRules(minDeliveryBottles),
      delivery_months: [...deliveryMonths],
    }
    const rulesById = new Map<string, LocationRules>([[UNALLOCATED, unallocated]])
    for (const location of locations) rulesById.set(location.id, rulesFor(location))
    // A wine pointing at a deleted location is unallocated, as it is shown
    const locationOf = (wine: Wine): string =>
      wine.storage_location_id && rulesById.has(wine.storage_location_id)
        ? wine.storage_location_id
        : UNALLOCATED

    const caseSize = (wine: Wine): number => bottlesPerCase(wine.format)
    const volumeOf = (wine: Wine, bottles: number): number => bottles * bottleVolumeMl(wine.format)

    // ── State ──
    const remaining: Record<string, number> = {}
    const home: Record<string, number> = {}
    const wineMap: Record<string, Wine> = {}
    const lastDrunk: Record<string, number> = {}

    storageWines.forEach(w => {
      remaining[w.id] = w.quantity_in_storage
      home[w.id] = w.quantity_at_home
      wineMap[w.id] = w
    })
    // Wines only at home still take up room and get drunk
    allWines.forEach(w => {
      if (w.quantity_at_home > 0 && w.quantity_in_storage === 0) {
        remaining[w.id] = 0
        home[w.id] = w.quantity_at_home
        wineMap[w.id] = w
      }
    })
    // Bottles already booked into a locked window are spoken for
    for (const [wineId, qty] of Object.entries(committedQuantities)) {
      if (remaining[wineId] !== undefined) {
        remaining[wineId] = Math.max(0, remaining[wineId] - qty)
      }
    }

    const candidateWines = Object.values(wineMap)
    const candidateIndex = new Map(candidateWines.map((w, i) => [w.id, i]))
    const deliveries: DeliveryScheduleEntry[] = []
    const totalRemaining = () => Object.values(remaining).reduce((a, b) => a + b, 0)
    const homeTotal = () => Object.values(home).reduce((a, b) => a + b, 0)

    // ── Drinking ──
    let drunkThisYear: Record<string, number> = {}

    const drink = (target: number, year: number) => {
      const getDrinkable = (): Array<{ id: string; urgency: number; tier: number }> => {
        const pool: Array<{ id: string; urgency: number; tier: number }> = []
        candidateWines.forEach(wine => {
          if (home[wine.id] <= 0) return
          // Not yet open is undrinkable; past its window is drunk late,
          // which is what actually happens — refusing it parks it at
          // home for good and the cellar never frees space again.
          if (wine.drinking_window_start > year) return
          // Magnums and tier 4-5 are rationed to one a year
          const isHardCapped = isMagnumOrLarger(wine.format) || wine.tier >= 4
          const drunk = drunkThisYear[wine.id] || 0
          if (isHardCapped && drunk >= 1) return
          if (wine.tier >= 4) {
            const bottlesLeft = home[wine.id] + (remaining[wine.id] || 0)
            const yearsLeft = Math.max(1, wine.drinking_window_end - year)
            const idealGap = Math.max(1, Math.floor(yearsLeft / Math.max(1, bottlesLeft)))
            if (lastDrunk[wine.id] && year - lastDrunk[wine.id] < idealGap && bottlesLeft > 2) return
          }
          const timeLeft = wine.drinking_window_end - year
          let urgency = timeLeft <= 0 ? 3.0 : 1.0 / timeLeft
          if (wine.tier === 1) urgency += 0.3
          else if (wine.tier === 2) urgency += 0.15
          pool.push({ id: wine.id, urgency, tier: wine.tier })
        })
        return pool.sort((a, b) => b.urgency - a.urgency || a.tier - b.tier)
      }

      const take = (id: string) => {
        home[id]--
        drunkThisYear[id] = (drunkThisYear[id] || 0) + 1
        lastDrunk[id] = year
      }

      let drinkCount = 0
      // Variety first: one of each wine not yet opened this year
      for (const { id } of getDrinkable()) {
        if (drinkCount >= target) break
        if ((drunkThisYear[id] || 0) >= 1 || home[id] <= 0) continue
        take(id)
        drinkCount++
      }
      // Then top up by urgency until the month's share is drunk
      let guard = 0
      while (drinkCount < target && guard++ < 1000) {
        const pool = getDrinkable()
        if (pool.length === 0) break
        let drankThisPass = 0
        for (const { id } of pool) {
          if (drinkCount >= target) break
          if (home[id] <= 0) continue
          take(id)
          drinkCount++
          drankThisPass++
        }
        if (drankThisPass === 0) break
      }
    }

    // ── Selection ──
    const priorityOf = (wine: Wine, year: number): number | undefined => {
      const timeLeft = wine.drinking_window_end - year
      const timeToOpen = Math.max(0, wine.drinking_window_start - year)

      // Window-closed wines stay in — better delivered late than never
      if (wine.tier >= 4 && year < tier45StartYear) return undefined
      const maxLead = wine.tier <= 2 ? 2 : 1
      if (timeLeft > 0 && timeToOpen > maxLead) return undefined

      let priority = 500
      if (timeLeft <= 0) priority = 5000
      else if (timeLeft <= 3) priority = 3000 - timeLeft
      else if (timeLeft <= 6) priority = 2000 - timeLeft
      else if (timeLeft <= 10) priority = 1000 - timeLeft

      if (wine.drinking_window_start <= year) priority += 1500
      else priority -= timeToOpen * 300

      if (wine.tier === 1) {
        priority += 600
        if (year <= currentYear + 3) priority += 500
      } else if (wine.tier === 2) {
        priority += 300
        if (year <= currentYear + 2) priority += 200
      } else if (wine.tier === 3) {
        if (year <= currentYear + 2 && timeLeft > 8) priority -= 400
      } else {
        // Every fourth premium wine is pulled forward, spreading them out
        if ((candidateIndex.get(wine.id) ?? 0) % 4 === 0) priority += 300
        else priority -= 100 * (wine.tier - 3)
      }

      if (home[wine.id] >= caseSize(wine)) priority -= 800
      else if (home[wine.id] === 0) priority += 100

      return priority
    }

    /** One case of each wine in priority order, then further cases, within `space`. */
    const buildCases = (candidates: Wine[], space: number) => {
      const cases: Array<{ wine: Wine; bottles: number }> = []
      const committed: Record<string, number> = {}
      let bottles = 0
      let volume = 0
      const addCase = (wine: Wine): boolean => {
        const available = remaining[wine.id] - (committed[wine.id] || 0)
        if (available <= 0) return false
        const amount = Math.min(available, caseSize(wine))
        if (amount > space - bottles) return false
        cases.push({ wine, bottles: amount })
        committed[wine.id] = (committed[wine.id] || 0) + amount
        bottles += amount
        volume += volumeOf(wine, amount)
        return true
      }
      for (const wine of candidates) {
        if (bottles >= space) break
        addCase(wine)
      }
      let progress = true
      while (progress && bottles < space) {
        progress = false
        for (const wine of candidates) {
          if (bottles >= space) break
          if (addCase(wine)) progress = true
        }
      }
      return { cases, bottles, volume }
    }

    const minFor = (rules: LocationRules) => Math.min(rules.min_volume_ml, cellarCapacity * 750)
    const monthlyRate = annualConsumptionTarget / 12

    // ── Month by month ──
    let owed = 0
    let year = currentYear
    let month = currentMonth
    for (let step = 0; step < 100 * 12; step++) {
      if (step > 0) {
        month++
        if (month > 12) {
          month = 1
          year++
        }
      }
      if (month === 1) drunkThisYear = {}
      if (totalRemaining() === 0) break

      const dateStr = `${year}-${String(month).padStart(2, '0')}-01`

      // Locked deliveries arrive first and stand in for that location
      const lockedHere = new Set<string>()
      for (const [key, wines] of Object.entries(lockedDeliveries)) {
        const [date, locationId] = key.split('|')
        if (date !== dateStr || wines.length === 0) continue
        if (locationId) lockedHere.add(locationId)
        else rulesById.forEach((_, id) => lockedHere.add(id))
        for (const lw of wines) {
          if (home[lw.wine_id] !== undefined) home[lw.wine_id] += lw.quantity
          else if (wineMap[lw.wine_id]) home[lw.wine_id] = lw.quantity
        }
      }

      // Each location's bid: its most urgent wines, up to its minimum
      const bids: Array<{
        rules: LocationRules
        candidates: Wine[]
        score: number
        needed: number
        eligible: boolean
      }> = []
      for (const rules of rulesById.values()) {
        if (lockedHere.has(rules.id)) continue
        const scored: Array<{ wine: Wine; priority: number }> = []
        for (const wine of candidateWines) {
          if (remaining[wine.id] <= 0 || locationOf(wine) !== rules.id) continue
          const priority = priorityOf(wine, year)
          if (priority !== undefined) scored.push({ wine, priority })
        }
        if (scored.length === 0) continue
        scored.sort((a, b) => b.priority - a.priority)

        const min = minFor(rules)
        let volume = 0
        let needed = 0
        let total = 0
        let count = 0
        for (const { wine, priority } of scored) {
          if (volume >= min) break
          const bottles = Math.min(remaining[wine.id], caseSize(wine))
          volume += volumeOf(wine, bottles)
          needed += bottles
          total += priority
          count++
        }
        bids.push({
          rules,
          candidates: scored.map(s => s.wine),
          score: total / count,
          needed,
          eligible: isDeliveryMonth(rules, month),
        })
      }
      bids.sort((a, b) => b.score - a.score || a.rules.name.localeCompare(b.rules.name))

      let space = cellarCapacity - homeTotal()
      for (const bid of bids) {
        if (!bid.eligible) {
          // Hold room for a more urgent location that cannot come yet,
          // less what will have been drunk by the time it can
          const next = nextDeliveryMonth(bid.rules, year, month)
          const monthsAway = (next.year - year) * 12 + (next.month - month)
          space -= Math.max(0, bid.needed - Math.floor(monthlyRate * monthsAway))
          continue
        }
        if (space < 1) continue

        const { cases, bottles, volume } = buildCases(bid.candidates, space)
        if (cases.length === 0) continue

        // The minimum is strict, except for the very last of a location's
        // wine, which would otherwise never be worth fetching
        const leftHere = candidateWines
          .filter(w => locationOf(w) === bid.rules.id)
          .reduce(
            (sum, w) => ({ bottles: sum.bottles + remaining[w.id], volume: sum.volume + volumeOf(w, remaining[w.id]) }),
            { bottles: 0, volume: 0 }
          )
        const min = minFor(bid.rules)
        const isFinal = bottles >= leftHere.bottles && leftHere.volume < min
        if (volume < min && !isFinal) continue

        for (const { wine, bottles: qty } of cases) {
          remaining[wine.id] -= qty
          home[wine.id] += qty
          deliveries.push({
            wine_id: wine.id,
            quantity: qty,
            scheduled_date: dateStr,
            tier: wine.tier,
            region: wine.region,
            status: 'pending',
            storage_location_id: bid.rules.id === UNALLOCATED ? undefined : bid.rules.id,
          })
        }
        space -= bottles
        debugLog(`  [${dateStr}] ${bid.rules.name}: ${bottles} bottles`)
      }

      // Then a month's drinking
      owed += monthlyRate
      const target = Math.floor(owed + 1e-9)
      owed -= target
      if (target > 0) drink(target, year)
    }

    debugLog(
      `[ScheduleService] Scheduled ${deliveries.reduce((s, d) => s + d.quantity, 0)} bottles, ${totalRemaining()} left over`
    )
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
    deliveryMonths: number[] = [3, 9],
    /**
     * What each completed window brought, so deliveries already in the
     * house can still be shown as a record. Their bottles are counted in
     * the live wine quantities, so they take no part in the planning
     * above — they are only ever appended.
     */
    completedWindowWines: Map<string, Array<{ wine_id: string; quantity: number }>> = new Map(),
    locations: StorageLocation[] = [],
    minDeliveryBottles: number = 24
  ): DeliveryDisplayEntry[] {
    const wineMap = new Map(wines.map(w => [w.id, w]))
    const rulesById = new Map<string, LocationRules>([
      [UNALLOCATED, { ...unallocatedRules(minDeliveryBottles), delivery_months: [...deliveryMonths] }],
    ])
    for (const location of locations) rulesById.set(location.id, rulesFor(location))
    const wineLocation = (wineId: string): string => {
      const id = wineMap.get(wineId)?.storage_location_id
      return id && rulesById.has(id) ? id : UNALLOCATED
    }
    const locationOfWindow = (w: DisplayDbWindow): string | undefined =>
      windowLocation(
        w.storage_location_id,
        lockedWindowWines.get(w.id) ?? completedWindowWines.get(w.id) ?? [],
        wines
      ) ?? (locations.length === 0 ? UNALLOCATED : undefined)

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

    // 1. Group scheduler output by date and source
    const grouped = new Map<string, DeliveryDisplayEntry>()
    const dbByKey = new Map<string, DisplayDbWindow>()
    for (const w of dbWindows) {
      if (w.status === 'completed') continue
      dbByKey.set(deliveryKey(w.scheduled_date, locationOfWindow(w)), w)
    }

    for (const d of deliveries) {
      const displayWine = toDisplayWine(d.wine_id, d.quantity)
      if (!displayWine) continue

      const locationId = d.storage_location_id ?? UNALLOCATED
      const key = deliveryKey(d.scheduled_date, locationId)
      const existing = grouped.get(key)
      if (existing) {
        // One row per wine per delivery. The scheduler builds a delivery
        // in two passes — a case of each wine, then filler cases to use
        // the remaining space — so a wine with more than one case in the
        // same delivery arrived here as two entries. It showed as the
        // same wine listed twice, and locking the window kept only the
        // first: the filler case was simply dropped.
        const already = existing.wines.find(w => w.id === displayWine.id)
        if (already) {
          already.quantity += displayWine.quantity
        } else {
          existing.wines.push(displayWine)
        }
      } else {
        const dbWindow = dbByKey.get(key)
        grouped.set(key, {
          key,
          date: d.scheduled_date,
          locationId,
          windowId: dbWindow?.id || '',
          status: d.status,
          locked: dbWindow?.locked || false,
          wines: [displayWine],
        })
      }
    }

    // 2. Ensure non-completed locked DB windows always appear, even if
    //    scheduler produced nothing for them (e.g. all their wines were
    //    deferred).
    for (const [key, dbWindow] of dbByKey) {
      if (dbWindow.locked && !grouped.has(key)) {
        grouped.set(key, {
          key,
          date: dbWindow.scheduled_date,
          locationId: locationOfWindow(dbWindow),
          windowId: dbWindow.id,
          status: dbWindow.status,
          locked: true,
          wines: [],
        })
      }
    }

    // 2b. Completed windows, as a record of what arrived.
    //
    //     The scheduler cannot produce these: the moment a delivery is
    //     confirmed its bottles are at home, out of the storage counts
    //     it plans from. They were previously left out of the display
    //     entirely, so a confirmed delivery vanished — you had no way to
    //     see what had been delivered, or when. They are appended after
    //     the planning above, never merged into it, so nothing here can
    //     affect what is still to come.
    const completedEntries: DeliveryDisplayEntry[] = []
    for (const dbWindow of dbWindows) {
      if (dbWindow.status !== 'completed') continue
      const rows = completedWindowWines.get(dbWindow.id) ?? []
      const locationId = locationOfWindow(dbWindow)
      completedEntries.push({
        // The window id keeps two completed deliveries on one day apart
        key: `${deliveryKey(dbWindow.scheduled_date, locationId)}|${dbWindow.id}`,
        date: dbWindow.scheduled_date,
        locationId,
        windowId: dbWindow.id,
        status: 'completed',
        locked: dbWindow.locked,
        wines: rows
          .map(r => toDisplayWine(r.wine_id, r.quantity))
          .filter((w): w is DeliveryDisplayWine => w !== null),
      })
    }

    // 3. Reconcile locked windows: replace scheduler output with DB curation,
    //    collecting displaced wines (present in scheduler output but not in
    //    the DB curation for that locked date). Since committed wines are now
    //    excluded from the scheduler via committedQuantities, they won't
    //    appear in unlocked entries — no stripping needed.
    const displaced: Array<{
      wineId: string
      quantity: number
      afterDate: string
    }> = []
    

    for (const entry of grouped.values()) {
      if (!entry.locked || !entry.windowId) continue
      const dbWines = lockedWindowWines.get(entry.windowId) || []
      const dbWineIds = new Set(dbWines.map(w => w.wine_id))

      // Collect wines the scheduler placed here that aren't in DB curation
      // (e.g. the user deferred them out of this locked window).
      for (const sw of entry.wines) {
        if (!dbWineIds.has(sw.id)) {
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

    // 4. Relocate displaced wines to the next unlocked delivery from
    //    their own location after the locked date. If none exists,
    //    create one at that location's next delivery month.
    for (const d of displaced) {
      const displayWine = toDisplayWine(d.wineId, d.quantity)
      if (!displayWine) continue

      const locationId = wineLocation(d.wineId)
      let targetEntry: DeliveryDisplayEntry | null =
        [...grouped.values()]
          .filter(e => e.locationId === locationId && e.date > d.afterDate && !e.locked)
          .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null

      // Otherwise, walk forward through the location's delivery months
      // until one is free or not locked.
      if (!targetEntry) {
        let candidate = ScheduleService.nextDeliveryDate(d.afterDate, rulesById.get(locationId)!)
        let guard = 0
        while (guard++ < 50) {
          const key = deliveryKey(candidate, locationId)
          const existing = grouped.get(key)
          if (!existing) {
            targetEntry = {
              key,
              date: candidate,
              locationId,
              windowId: '',
              status: 'pending',
              locked: false,
              wines: [],
            }
            grouped.set(key, targetEntry)
            break
          }
          if (!existing.locked) {
            targetEntry = existing
            break
          }
          candidate = ScheduleService.nextDeliveryDate(candidate, rulesById.get(locationId)!)
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

    // 5. Sort and drop empty unlocked entries (keep empty locked ones so
    //    the user can still see/manage them). Completed entries join
    //    here, so the whole list stays in date order — a delivery
    //    already in the house sits above the ones still to come.
    return [...grouped.values(), ...completedEntries]
      .filter(e => e.wines.length > 0 || e.locked || e.status === 'completed')
      .sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key))
  }

  /**
   * The first date after the given one on which a location can deliver,
   * as YYYY-MM-01.
   */
  static nextDeliveryDate(
    afterDate: string,
    rules: Pick<LocationRules, 'cadence' | 'delivery_months'>
  ): string {
    const [year, month] = afterDate.split('-').map(Number)
    const next = nextDeliveryMonth(rules, year, month)
    return `${next.year}-${String(next.month).padStart(2, '0')}-01`
  }

  /**
   * Estimate how many bottles will be at home on a future date, assuming
   * consumption proceeds at the configured annual rate from `now` until
   * `targetDate`. Used to validate manual promote/delivery decisions
   * against the cellar capacity on the *day of the delivery* rather than
   * today — the scheduler itself already plans around this assumption.
   *
   * Never returns less than 0. If the target is in the past or equal to
   * `now`, no consumption is subtracted.
   */
  static projectHomeAtDate(
    currentHome: number,
    targetDate: string,
    annualConsumptionTarget: number,
    now: Date = new Date()
  ): number {
    const target = new Date(targetDate)
    if (isNaN(target.getTime())) return currentHome

    const msPerMonth = (365.25 * 24 * 60 * 60 * 1000) / 12
    const monthsUntil = Math.max(
      0,
      (target.getTime() - now.getTime()) / msPerMonth
    )
    const estimatedConsumption = Math.floor(
      (annualConsumptionTarget * monthsUntil) / 12
    )
    return Math.max(0, currentHome - estimatedConsumption)
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

  private static getConsumptionStatus(): string {
    // Return empty string - year/month already shown in timeline structure
    // Avoids "THIS YEAR" / "NEXT YEAR" clutter per user feedback
    return ''
  }
}
