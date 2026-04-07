import type { Wine, DeliveryScheduleEntry } from '../types/index'
import { DELIVERY_CONFIG } from '../config/deliveryConfig'

const debugLog = (...args: any[]) => {
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
  suggestedMonth: number
  suggestedYear: number
  status: string
}

export class ScheduleService {
  static generateDrinkingSchedule(
    allWines: Wine[],
    deliveryScheduleEntries?: DeliveryScheduleEntry[],
    startYear: number = new Date().getFullYear(),
    yearsToSchedule: number = 3,
    annualConsumptionTarget: number = DELIVERY_CONFIG.annualTarget
  ): DrinkingScheduleEntry[] {
    const schedule: DrinkingScheduleEntry[] = []
    debugLog('[ScheduleService] generateDrinkingSchedule called with', allWines.length, 'total wines')
    const wineAvailability: Record<string, string> = {}
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    const currentYearMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}`
    allWines.forEach(w => {
      if (w.quantity_at_home > 0) {
        wineAvailability[w.id] = currentYearMonth
      } else if (w.quantity_in_storage > 0) {
        const delivery = deliveryScheduleEntries?.find(d => d.wine_id === w.id && d.status === 'pending')
        if (delivery) {
          wineAvailability[w.id] = delivery.scheduled_date.substring(0, 7)
        } else {
          wineAvailability[w.id] = '9999-12'
        }
      }
    })
    const targetPerYear = annualConsumptionTarget
    const tolerance = 5
    const tier4_5MinSpacingYears = DELIVERY_CONFIG.tier45MinSpacingYears
    const yearlyConsumption: Record<number, number> = {}
    const wineLastConsumedYear: Record<string, number> = {}
    const wineTotalScheduled: Record<string, number> = {}
    const wineBottleLimit: Record<string, number> = {}
    allWines.forEach(w => {
      wineTotalScheduled[w.id] = 0
      wineBottleLimit[w.id] = w.quantity_in_storage + w.quantity_at_home
    })
    for (let year = startYear; year < startYear + yearsToSchedule; year++) {
      yearlyConsumption[year] = 0
      let monthsInYear = 12
      if (year === startYear) monthsInYear = 12 - currentMonth + 1
      const targetForYear = Math.round((targetPerYear * monthsInYear) / 12)
      const minConsumption = Math.max(1, targetForYear - tolerance)
      const maxConsumption = targetForYear + tolerance
      const yearsConsumption: DrinkingScheduleEntry[] = []
      const slotsPerMonth = Math.ceil(targetForYear / monthsInYear)

      const buildCandidates = (month: number, maxTimesThisYear: number) => {
        const monthYearMonth = `${year}-${String(month).padStart(2, '0')}`
        const lastMonthProducers = yearsConsumption.slice(-2).map(e => e.producer)
        return allWines.filter(w => {
          const availabilityYearMonth = wineAvailability[w.id]
          const timesThisYear = yearsConsumption.filter(e => e.wineId === w.id).length
          const hardMax = (w.format?.toLowerCase().includes('magnum') || w.tier >= 4) ? 1 : maxTimesThisYear
          const alreadyThisMonth = yearsConsumption.some(e => e.wineId === w.id && e.suggestedMonth === month)
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

      const pickFromCandidates = (candidates: Wine[], slotsToFill: number, month: number) => {
        const candidatesByTier = {
          1: candidates.filter(w => w.tier === 1), 2: candidates.filter(w => w.tier === 2),
          3: candidates.filter(w => w.tier === 3), 4: candidates.filter(w => w.tier === 4),
          5: candidates.filter(w => w.tier === 5),
        }
        let slotsFilled = 0
        for (const tier of [1, 2, 3, 4, 5]) {
          while (slotsFilled < slotsToFill && candidatesByTier[tier as keyof typeof candidatesByTier].length > 0) {
            const tierCandidates = candidatesByTier[tier as keyof typeof candidatesByTier]
            let selectedWine: Wine | undefined
            if (tier >= 4) {
              selectedWine = tierCandidates.find(w => !wineLastConsumedYear[w.id] || year - wineLastConsumedYear[w.id] >= tier4_5MinSpacingYears)
              if (!selectedWine && tierCandidates.length > 0) selectedWine = tierCandidates[0]
            } else { selectedWine = tierCandidates[0] }
            if (!selectedWine) break
            let monthNum = ScheduleService.calculateConsumptionMonth(month)
            const avail = wineAvailability[selectedWine.id]
            if (avail) {
              const [availYear, availMonth] = avail.split('-').map(Number)
              if (year === availYear && monthNum < availMonth) monthNum = availMonth
            }
            yearsConsumption.push({
              wineId: selectedWine.id, producer: selectedWine.producer, name: selectedWine.name,
              vintage: selectedWine.vintage, region: selectedWine.region, tier: selectedWine.tier,
              classification: selectedWine.classification, suggestedMonth: monthNum, suggestedYear: year,
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

      // Pass 1: unique wines only (max 1 per wine per year)
      for (let month = 1; month <= 12; month++) {
        const slotsToFill = Math.min(slotsPerMonth, maxConsumption - yearsConsumption.length)
        if (slotsToFill <= 0) break
        pickFromCandidates(buildCandidates(month, 1), slotsToFill, month)
      }

      // Pass 2: allow 2nd bottle only when unique wines exhausted, fill emptiest months first
      if (yearsConsumption.length < minConsumption) {
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
          pickFromCandidates(buildCandidates(month, 2), slotsToFill, month)
        }
      }

      // Padding if still under minimum
      if (yearsConsumption.length < minConsumption) {
        const padding = minConsumption - yearsConsumption.length
        const availableWinesForPadding = allWines.filter(w =>
          ScheduleService.canConsumeThisYear(w, year) &&
          wineAvailability[w.id] <= `${year}-12` &&
          wineTotalScheduled[w.id] < wineBottleLimit[w.id] &&
          !yearsConsumption.some(e => e.wineId === w.id)
        )
        const maxPadding = Math.min(padding, availableWinesForPadding.length)
        for (let i = 0; i < maxPadding; i++) {
          const wine = availableWinesForPadding[i]
          let monthNum = ScheduleService.calculateConsumptionMonth((i % 12) + 1)
          const avail = wineAvailability[wine.id]
          if (avail) {
            const [availYear, availMonth] = avail.split('-').map(Number)
            if (year === availYear && monthNum < availMonth) monthNum = availMonth
          }
          yearsConsumption.push({
            wineId: wine.id, producer: wine.producer, name: wine.name,
            vintage: wine.vintage, region: wine.region, tier: wine.tier,
            classification: wine.classification, suggestedMonth: monthNum, suggestedYear: year,
            status: ScheduleService.getConsumptionStatus(wine, year),
          })
          wineLastConsumedYear[wine.id] = year
          wineTotalScheduled[wine.id]++
        }
      }
      yearlyConsumption[year] = yearsConsumption.length
      schedule.push(...yearsConsumption)
    }

    return schedule
      .filter(e => {
        if (e.suggestedYear === currentYear && e.suggestedMonth < currentMonth) return false
        return allWines.some(w => w.id === e.wineId)
      })
      .sort((a, b) => a.suggestedYear !== b.suggestedYear ? a.suggestedYear - b.suggestedYear : a.suggestedMonth - b.suggestedMonth)
  }

  static generateDeliverySchedule(
    allWines: Wine[],
    cellarCapacity: number = 80,
    currentBottlesAtHome: number = 0,
    deliveryMonths: [number, number] = [3, 9],
    annualConsumptionTarget: number = 30
  ): DeliveryScheduleEntry[] {
    const storageWines = allWines.filter(w => w.quantity_in_storage > 0)
    if (storageWines.length === 0) return []
    const currentYear = new Date().getFullYear()
    const currentMonth = new Date().getMonth() + 1
    const tier45StartYear = DELIVERY_CONFIG.tier45StartYear
    const caseSize = (wine: Wine): number => {
      const size = wine.format?.toLowerCase() || '750ml'
      if (size.includes('half') || size === '375ml') return 12
      if (size.includes('magnum') || size.includes('1.5l')) return 3
      if (size === '75cl' || size === '750ml') return 6
      return 6
    }
    const maxPerYear = (wine: Wine): number => (wine.format?.toLowerCase().includes('magnum') ? 1 : 2)
    const remaining: Record<string, number> = {}
    const home: Record<string, number> = {}
    const wineMap: Record<string, Wine> = {}
    const lastDrunk: Record<string, number> = {}
    storageWines.forEach(w => { remaining[w.id] = w.quantity_in_storage; home[w.id] = 0; wineMap[w.id] = w })
    const candidateWines = Object.values(wineMap).filter(w => w.quantity_in_storage > 0)
    const totalBottlesAvailable = candidateWines.reduce((sum, w) => sum + w.quantity_in_storage, 0)
    const deliveriesPerYear: Record<number, number> = {}
    const deliveries: DeliveryScheduleEntry[] = []
    let loopIterations = 0
    const maxLoopIterations = 5000

    for (let year = currentYear; year < currentYear + 100 && loopIterations < maxLoopIterations; year++) {
      if (Object.values(remaining).reduce((a, b) => a + b, 0) === 0) break
      const drunkThisYear: Record<string, number> = {}

      const simulateDrinking = (monthsToSimulate: number) => {
        const target = Math.round((annualConsumptionTarget * monthsToSimulate) / 12)
        const getDrinkable = (): Array<{ id: string; urgency: number; tier: number }> => {
          const pool: Array<{ id: string; urgency: number; tier: number }> = []
          candidateWines.forEach(wine => {
            if (home[wine.id] <= 0) return
            if (wine.drinking_window_start > year || wine.drinking_window_end < year) return
            // Hard caps: magnums and Tier 4-5 limited to 1/year. Normal wines
            // have no per-year cap here — sim plans for the actual target.
            const isHardCapped = wine.format?.toLowerCase().includes('magnum') || wine.tier >= 4
            const maxY = isHardCapped ? 1 : Infinity
            if ((drunkThisYear[wine.id] || 0) >= maxY) return
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
        getDrinkable().forEach(({ id }) => {
          if (drinkCount >= target || (drunkThisYear[id] || 0) >= 1 || home[id] <= 0) return
          home[id]--; drunkThisYear[id] = (drunkThisYear[id] || 0) + 1; lastDrunk[id] = year; drinkCount++
        })
        // Top-up passes: keep adding bottles (by urgency) until the target for
        // this window is reached or no more drinkable bottles exist. Magnums
        // and Tier 4-5 are excluded via the hard cap in getDrinkable.
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

      let lastSimulatedMonth = (year === currentYear) ? currentMonth : 1
      for (let deliverySlot = 0; deliverySlot < 2; deliverySlot++) {
        loopIterations++
        if (loopIterations > maxLoopIterations) break
        const month = deliveryMonths[deliverySlot]
        if (year === currentYear && month < currentMonth) continue
        const monthsSinceLastSim = month - lastSimulatedMonth
        if (monthsSinceLastSim > 0) { simulateDrinking(monthsSinceLastSim); lastSimulatedMonth = month }
        if (!deliveriesPerYear[year]) deliveriesPerYear[year] = 0
        if (deliveriesPerYear[year] >= 2) continue
        const homeTotal = Object.values(home).reduce((a, b) => a + b, 0)
        const space = cellarCapacity - homeTotal
        if (space < 3) break
        const candidates: Array<{ wine: Wine; priority: number }> = []
        candidateWines.filter(w => remaining[w.id] > 0).forEach(wine => {
          const timeLeft = wine.drinking_window_end - year
          const timeToOpen = Math.max(0, wine.drinking_window_start - year)
          if (wine.tier >= 4 && year < tier45StartYear) return
          const maxLead = wine.tier <= 2 ? 2 : 1
          if (timeLeft > 0 && timeToOpen > maxLead) return
          let priority = 500
          if (timeLeft <= 0) priority = 5000
          else if (timeLeft <= 3) priority = 3000 - timeLeft
          else if (timeLeft <= 6) priority = 2000 - timeLeft
          else if (timeLeft <= 10) priority = 1000 - timeLeft
          if (wine.drinking_window_start <= year) priority += 1500
          else priority -= timeToOpen * 300
          if (wine.tier === 1) { priority += 600; if (year <= currentYear + 3) priority += 500 }
          else if (wine.tier === 2) { priority += 300; if (year <= currentYear + 2) priority += 200 }
          else if (wine.tier === 3) { if (year <= currentYear + 2 && timeLeft > 8) priority -= 400 }
          else if (wine.tier >= 4) {
            const wineIndex = candidateWines.findIndex(w => w.id === wine.id)
            if (wineIndex % 4 === 0) priority += 300
            else priority -= 100 * (wine.tier - 3)
          }
          if (home[wine.id] >= caseSize(wine)) priority -= 800
          else if (home[wine.id] === 0) priority += 100
          candidates.push({ wine, priority })
        })
        if (candidates.length === 0) continue
        candidates.sort((a, b) => b.priority - a.priority)
        const cases: Array<{ wine: Wine; bottles: number }> = []
        let totalDelivered = 0
        for (const { wine } of candidates) {
          if (totalDelivered >= space) break
          const cs = caseSize(wine)
          if (remaining[wine.id] === 0) continue
          const deliverAmount = remaining[wine.id] >= cs ? cs : remaining[wine.id]
          if (deliverAmount <= 0 || deliverAmount > space - totalDelivered) continue
          cases.push({ wine, bottles: deliverAmount })
          totalDelivered += deliverAmount
        }
        const totalRemaining = Object.values(remaining).reduce((a, b) => a + b, 0)
        const isFinalDelivery = totalRemaining > 0 && totalRemaining < 24
        const minDeliverySize = Math.min(24, Math.max(6, Math.floor(space * 0.8)))
        const shouldDeliver = (totalDelivered >= minDeliverySize) || isFinalDelivery
        if (shouldDeliver && cases.length > 0) {
          const dateStr = `${year}-${String(month).padStart(2, '0')}-01`
          cases.forEach(({ wine, bottles }) => {
            remaining[wine.id] -= bottles
            home[wine.id] += bottles
            deliveries.push({ wine_id: wine.id, quantity: bottles, scheduled_date: dateStr, tier: wine.tier, region: wine.region, status: 'pending' })
          })
          deliveriesPerYear[year]++
        }
      }
      const remainingMonths = 12 - lastSimulatedMonth
      if (remainingMonths > 0) simulateDrinking(remainingMonths)
    }
    return deliveries
  }

  private static groupWinesByTier(wines: Wine[]): Record<number, Wine[]> {
    const grouped: Record<number, Wine[]> = {}
    for (let i = 1; i <= 5; i++) grouped[i] = wines.filter(w => w.tier === i)
    return grouped
  }
  private static canConsumeThisYear(wine: Wine, year: number): boolean { return year >= wine.drinking_window_start }
  private static calculateConsumptionMonth(targetMonth: number): number { return Math.max(1, Math.min(12, targetMonth)) }
  private static getConsumptionStatus(_wine: Wine, _year: number): string { return '' }
}
