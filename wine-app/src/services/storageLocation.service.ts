import type { StorageLocation, Wine } from '../types/index'
import type { DeliveryDisplayEntry } from './schedule.service'

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

/** The rules an unallocated wine follows: exactly today's behaviour. */
export const UNALLOCATED_RULES = {
  id: UNALLOCATED,
  name: 'Unallocated',
  cadence: 'fixed' as const,
  delivery_months: [3, 9],
  min_bottles: 24,
  renewal_month: undefined,
}

export type LocationDraft = Omit<StorageLocation, 'id' | 'created_at' | 'updated_at'>

/** A new location starts on the schedule the app already used. */
export function blankLocation(): LocationDraft {
  return {
    name: '',
    cadence: 'fixed',
    delivery_months: [3, 9],
    min_bottles: 24,
    renewal_month: undefined,
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
  if (!Number.isInteger(draft.min_bottles) || draft.min_bottles < 1) {
    return 'The minimum delivery must be at least one bottle'
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
export function describeLocation(location: StorageLocation): string {
  const when =
    location.cadence === 'flexible'
      ? 'Any month'
      : location.delivery_months
          .slice()
          .sort((a, b) => a - b)
          .map(month => MONTH_NAMES[month - 1])
          .join(' & ')
  const parts = [when, `min ${location.min_bottles} bottles`]
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
