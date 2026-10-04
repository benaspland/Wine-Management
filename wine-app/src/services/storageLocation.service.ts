import type { StorageLocation, Wine } from '../types/index'
import type { DeliveryDisplayEntry } from './schedule.service'
import { CASE_ML } from './format.service'

/**
 * The rules a storage provider imposes on when it is sensible to take
 * delivery.
 *
 * Providers do not differ cosmetically — they differ in a way that
 * reverses the right answer. Where storage is paid a year in advance,
 * every bottle still in the locker on the renewal date costs another
 * full year, so wine should come out early. Where it is billed by the
 * time actually stored, the cheapest bottle is the one left there
 * longest, so wine should come out late. One global pair of delivery
 * months cannot serve both, which is the whole reason this exists.
 *
 * A third axis is the cost of the visit itself: free delivery removes
 * any reason to batch, so those locations can deliver in any month the
 * minimum is met rather than waiting for a slot.
 */

/** What a wine with no location set is shown and scheduled as. */
export const UNALLOCATED = 'unallocated'

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

/** A 75cl bottle — the unit any minimum stored in bottles was written in. */
const STANDARD_BOTTLE_ML = 750

/**
 * Everything the scheduler needs to know about a location, with the
 * minimum resolved to a volume.
 *
 * The scheduler only ever sees these. It has no idea which providers
 * are configured or how many — every rule it applies comes from here,
 * so any combination of fixed and flexible, prepaid and pro-rata, one
 * locker or six, is planned by the same code.
 */
export interface LocationRules {
  /** The location's id, or UNALLOCATED. */
  id: string
  name: string
  cadence: 'fixed' | 'flexible'
  delivery_months: number[]
  min_volume_ml: number
  renewal_month?: number
}

/**
 * The rules an unallocated wine follows: exactly the app's original
 * behaviour, so a collection nobody has allocated yet is scheduled as it
 * always was. The minimum comes from the cellar setting, read as 75cl
 * bottles.
 */
export function unallocatedRules(minBottles = 24): LocationRules {
  return {
    id: UNALLOCATED,
    name: 'Unallocated',
    cadence: 'fixed',
    delivery_months: [3, 9],
    min_volume_ml: minBottles * STANDARD_BOTTLE_ML,
    renewal_month: undefined,
  }
}

/** The default unallocated rules, for places that only need its name. */
export const UNALLOCATED_RULES = unallocatedRules()

/**
 * A location's minimum as a volume.
 *
 * Locations saved before minimums were volumes carry a bottle count
 * instead, which was always meant as 75cl bottles, so it converts
 * without anyone having to re-enter it.
 */
export function minVolumeMl(location: Pick<StorageLocation, 'min_volume_ml' | 'min_bottles'>): number {
  if (location.min_volume_ml !== undefined) return location.min_volume_ml
  return (location.min_bottles ?? 24) * STANDARD_BOTTLE_ML
}

export function rulesFor(location: StorageLocation): LocationRules {
  return {
    id: location.id,
    name: location.name,
    cadence: location.cadence,
    delivery_months: [...location.delivery_months],
    min_volume_ml: minVolumeMl(location),
    renewal_month: location.renewal_month,
  }
}

/** Whether a location can deliver in this month at all. */
export function isDeliveryMonth(rules: Pick<LocationRules, 'cadence' | 'delivery_months'>, month: number): boolean {
  return rules.cadence === 'flexible' || rules.delivery_months.includes(month)
}

/**
 * The first month after this one in which the location can deliver.
 * A flexible location can always deliver next month.
 */
export function nextDeliveryMonth(
  rules: Pick<LocationRules, 'cadence' | 'delivery_months'>,
  year: number,
  month: number
): { year: number; month: number } {
  for (let step = 1; step <= 12; step++) {
    const absolute = month - 1 + step
    const candidate = { year: year + Math.floor(absolute / 12), month: (absolute % 12) + 1 }
    if (isDeliveryMonth(rules, candidate.month)) return candidate
  }
  // A fixed location with no months cannot be saved, but never loop.
  return { year: year + 1, month }
}

/** "2 cases", "1 case", "2.5 cases". */
export function formatCases(volumeMl: number): string {
  const cases = Math.round((volumeMl / CASE_ML) * 10) / 10
  return `${cases} ${cases === 1 ? 'case' : 'cases'}`
}

/** The editable fields of a location, with the minimum as a volume. */
export interface LocationDraft {
  name: string
  cadence: 'fixed' | 'flexible'
  delivery_months: number[]
  min_volume_ml: number
  renewal_month?: number
}

/** A new location starts on the schedule the app already used. */
export function blankLocation(): LocationDraft {
  return {
    name: '',
    cadence: 'fixed',
    delivery_months: [3, 9],
    min_volume_ml: 4 * CASE_ML,
    renewal_month: undefined,
  }
}

/** A saved location, opened for editing. */
export function draftOf(location: StorageLocation): LocationDraft {
  return {
    name: location.name,
    cadence: location.cadence,
    delivery_months: [...location.delivery_months],
    min_volume_ml: minVolumeMl(location),
    renewal_month: location.renewal_month,
  }
}

/**
 * What is wrong with a location, or nothing.
 *
 * Returned rather than thrown: this runs as the form is filled in, and
 * a half-typed location is not an error, just not saveable yet.
 */
export function validateLocation(draft: LocationDraft): string | null {
  if (!draft.name.trim()) return 'A name is required'
  if (!Number.isFinite(draft.min_volume_ml) || draft.min_volume_ml <= 0) {
    return 'The minimum delivery must be more than nothing'
  }
  if (draft.cadence === 'fixed' && draft.delivery_months.length === 0) {
    return 'Pick at least one delivery month, or allow delivery any month'
  }
  if (draft.delivery_months.some(month => month < 1 || month > 12)) {
    return 'Delivery months must be months of the year'
  }
  if (
    draft.renewal_month !== undefined &&
    (!Number.isInteger(draft.renewal_month) || draft.renewal_month < 1 || draft.renewal_month > 12)
  ) {
    return 'The renewal month must be a month of the year'
  }
  return null
}

/** The location's rules in a line, for the card that lists them. */
export function describeLocation(
  location: Pick<LocationRules, 'cadence' | 'delivery_months' | 'renewal_month'> &
    Partial<Pick<StorageLocation, 'min_volume_ml' | 'min_bottles'>>
): string {
  const when =
    location.cadence === 'flexible'
      ? 'Any month'
      : location.delivery_months
          .slice()
          .sort((a, b) => a - b)
          .map(month => MONTH_NAMES[month - 1])
          .join(' & ')
  const parts = [when, `min ${formatCases(minVolumeMl(location))}`]
  if (location.renewal_month !== undefined) {
    parts.push(`renews ${MONTH_NAMES[location.renewal_month - 1]}`)
  }
  return parts.join(' · ')
}

/**
 * Whether a delivery from here is worth preferring this month.
 *
 * Only prepaid locations have a renewal, and the preference runs over
 * the months leading up to it rather than the single month before:
 * a provider that visits twice a year may have only one slot in that
 * window, and insisting on exactly one month would miss it.
 *
 * It prefers, it does not restrict — a delivery outside this window is
 * still a perfectly good delivery, and gating on it would strand wine
 * for a year whenever the house happened to be full that month.
 */
export function isBeforeRenewal(
  location: Pick<StorageLocation, 'renewal_month'>,
  month: number,
  monthsOfRunway = 3
): boolean {
  if (location.renewal_month === undefined) return false
  // Distance round the year from this month to the renewal.
  const until = (location.renewal_month - month + 12) % 12
  return until > 0 && until <= monthsOfRunway
}

/** The locations a wine could be in, as the pickers present them. */
export function locationName(
  locationId: string | undefined,
  locations: StorageLocation[]
): string {
  if (!locationId) return UNALLOCATED_RULES.name
  return locations.find(location => location.id === locationId)?.name ?? UNALLOCATED_RULES.name
}

/** How many bottles each location is holding, for the settings list. */
export function bottlesPerLocation(wines: Wine[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const wine of wines) {
    if (wine.quantity_in_storage <= 0) continue
    const key = wine.storage_location_id ?? UNALLOCATED
    counts.set(key, (counts.get(key) ?? 0) + wine.quantity_in_storage)
  }
  return counts
}

/**
 * A delivery's wines, gathered by the locker they come out of.
 *
 * Wines keep the planner's order within a group, so promoting one does
 * not shuffle the rest around it. The heading is suppressed for a
 * single-source delivery: a label telling you everything came from the
 * one place it could have come from is noise.
 */
export interface LocationGroup {
  name: string
  bottles: number
  wines: DeliveryDisplayEntry['wines']
  showHeading: boolean
}

export function groupWinesByLocation(
  deliveryWines: DeliveryDisplayEntry['wines'],
  allWines: Wine[],
  locations: StorageLocation[]
): LocationGroup[] {
  const byId = new Map(allWines.map(wine => [wine.id, wine]))
  const groups = new Map<string, DeliveryDisplayEntry['wines']>()

  for (const wine of deliveryWines) {
    const key = byId.get(wine.id)?.storage_location_id ?? UNALLOCATED
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(wine)
  }

  return [...groups.entries()]
    .map(([key, wines]) => ({
      name: key === UNALLOCATED ? UNALLOCATED_RULES.name : locationName(key, locations),
      bottles: wines.reduce((sum, wine) => sum + wine.quantity, 0),
      wines,
      showHeading: groups.size > 1,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * How a delivery is identified once more than one locker can deliver in
 * the same month: its date and where it comes from. A window from before
 * locations whose wines came from several places has no single source,
 * and is identified by its date alone.
 */
export function deliveryKey(date: string, locationId?: string): string {
  return locationId ? `${date}|${locationId}` : date
}

/**
 * Which location a delivery window is for.
 *
 * Windows record it from now on. Older ones do not, but their wines say:
 * if every wine in one comes from the same place, so did the window.
 * Mixed or empty ones stay unknown, and are treated as covering every
 * location in their month.
 */
export function windowLocation(
  stored: string | undefined,
  rows: Array<{ wine_id: string }>,
  wines: Wine[]
): string | undefined {
  if (stored) return stored
  if (rows.length === 0) return undefined
  const byId = new Map(wines.map(wine => [wine.id, wine]))
  const sources = new Set(rows.map(row => byId.get(row.wine_id)?.storage_location_id ?? UNALLOCATED))
  return sources.size === 1 ? [...sources][0] : undefined
}
