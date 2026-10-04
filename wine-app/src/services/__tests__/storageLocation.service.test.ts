/**
 * Storage providers differ in a way that reverses the right answer.
 * Prepaid-by-the-year means every bottle still in the locker on the
 * renewal date costs another full year, so wine should come out early;
 * billed-by-time means the cheapest bottle is the one left longest, so
 * it should come out late. These are the rules that encode that.
 */

import { describe, it, expect } from 'vitest'
import type { StorageLocation, Wine } from '../../types/index'
import {
  blankLocation,
  validateLocation,
  describeLocation,
  isBeforeRenewal,
  locationName,
  bottlesPerLocation,
  UNALLOCATED,
  groupWinesByLocation,
  minVolumeMl,
  unallocatedRules,
  isDeliveryMonth,
  nextDeliveryMonth,
  formatCases,
  draftOf,
} from '../storageLocation.service'

const location = (overrides: Partial<StorageLocation> = {}): StorageLocation => ({
  id: 'loc-1',
  name: 'Nexus',
  cadence: 'fixed',
  delivery_months: [3, 9],
  min_volume_ml: 18000,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  ...overrides,
})

const wine = (overrides: Partial<Wine> = {}): Wine => ({
  id: 'w1',
  name: 'Test',
  vintage: 2018,
  tier: 2,
  region: 'Rioja',
  drinking_window_start: 2024,
  drinking_window_end: 2030,
  quantity_in_storage: 6,
  quantity_at_home: 0,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  ...overrides,
})

describe('validateLocation', () => {
  it('accepts the starting point, so a new location is saveable once named', () => {
    expect(validateLocation({ ...blankLocation(), name: 'Nexus' })).toBeNull()
  })

  it('needs a name', () => {
    expect(validateLocation(blankLocation())).toMatch(/name/i)
    expect(validateLocation({ ...blankLocation(), name: '   ' })).toMatch(/name/i)
  })

  it('needs a fixed-month location to have a month', () => {
    expect(
      validateLocation({ ...blankLocation(), name: 'X', delivery_months: [] })
    ).toMatch(/at least one delivery month/i)
  })

  it('lets a flexible location have no months at all', () => {
    // Free delivery means there is no slot to wait for
    expect(
      validateLocation({ ...blankLocation(), name: 'X', cadence: 'flexible', delivery_months: [] })
    ).toBeNull()
  })

  it('refuses a minimum below one bottle', () => {
    expect(validateLocation({ ...blankLocation(), name: 'X', min_volume_ml: 0 })).toMatch(/minimum/i)
  })

  it('refuses months that are not months', () => {
    expect(
      validateLocation({ ...blankLocation(), name: 'X', delivery_months: [13] })
    ).toMatch(/months of the year/i)
    expect(
      validateLocation({ ...blankLocation(), name: 'X', renewal_month: 0 })
    ).toMatch(/renewal month/i)
  })
})

describe('describeLocation', () => {
  it('reads as the rule it is', () => {
    expect(describeLocation(location())).toBe('March & September · min 4 cases')
  })

  it('says when a prepaid year rolls over', () => {
    expect(describeLocation(location({ renewal_month: 6 }))).toMatch(/renews June/)
  })

  it('says any month for free delivery', () => {
    expect(describeLocation(location({ cadence: 'flexible', min_volume_ml: 9000 }))).toBe(
      'Any month · min 2 cases'
    )
  })
})

describe('isBeforeRenewal', () => {
  const prepaid = location({ renewal_month: 6 })

  it('prefers the months running up to the renewal', () => {
    expect(isBeforeRenewal(prepaid, 5)).toBe(true)
    expect(isBeforeRenewal(prepaid, 4)).toBe(true)
    expect(isBeforeRenewal(prepaid, 3)).toBe(true)
  })

  it('does not prefer the renewal month itself, which is too late', () => {
    // The charge has been taken; this year is already paid for
    expect(isBeforeRenewal(prepaid, 6)).toBe(false)
  })

  it('does not prefer the months just after, which are the cheapest to wait out', () => {
    expect(isBeforeRenewal(prepaid, 7)).toBe(false)
    expect(isBeforeRenewal(prepaid, 11)).toBe(false)
  })

  it('wraps round the turn of the year', () => {
    // A February renewal is approached through November and December
    const february = location({ renewal_month: 2 })
    expect(isBeforeRenewal(february, 12)).toBe(true)
    expect(isBeforeRenewal(february, 11)).toBe(true)
    expect(isBeforeRenewal(february, 1)).toBe(true)
    expect(isBeforeRenewal(february, 3)).toBe(false)
  })

  it('never prefers a location billed by the time stored', () => {
    // There is no anniversary to beat; waiting is what is cheap here
    for (let month = 1; month <= 12; month++) {
      expect(isBeforeRenewal(location(), month)).toBe(false)
    }
  })
})

describe('locationName', () => {
  it('names an unset location rather than leaving a blank', () => {
    expect(locationName(undefined, [])).toBe('Unallocated')
  })

  it('falls back to unallocated for a location that has been deleted', () => {
    expect(locationName('gone', [location()])).toBe('Unallocated')
  })

  it('names a real one', () => {
    expect(locationName('loc-1', [location()])).toBe('Nexus')
  })
})

describe('bottlesPerLocation', () => {
  it('counts what is in storage, by locker', () => {
    const counts = bottlesPerLocation([
      wine({ id: 'a', storage_location_id: 'loc-1', quantity_in_storage: 6 }),
      wine({ id: 'b', storage_location_id: 'loc-1', quantity_in_storage: 3 }),
      wine({ id: 'c', quantity_in_storage: 12 }),
    ])
    expect(counts.get('loc-1')).toBe(9)
    expect(counts.get(UNALLOCATED)).toBe(12)
  })

  it('ignores bottles already at home, which are in no locker', () => {
    const counts = bottlesPerLocation([
      wine({ storage_location_id: 'loc-1', quantity_in_storage: 0, quantity_at_home: 4 }),
    ])
    expect(counts.get('loc-1')).toBeUndefined()
  })
})

describe('groupWinesByLocation', () => {
  const nexus = location({ id: 'nexus', name: 'Nexus' })
  const berry = location({ id: 'berry', name: 'Berry Bros' })
  const cellar = [
    wine({ id: 'a', storage_location_id: 'nexus' }),
    wine({ id: 'b', storage_location_id: 'berry' }),
    wine({ id: 'c' }),
  ]
  const line = (id: string, quantity: number) => ({
    id, name: 'X', vintage: 2018, tier: 2 as const, quantity,
  })

  it('splits a delivery by the locker each wine came from', () => {
    const groups = groupWinesByLocation(
      [line('a', 6), line('b', 3), line('a', 6)],
      cellar,
      [nexus, berry]
    )
    expect(groups.map(g => `${g.name}:${g.bottles}`)).toEqual(['Berry Bros:3', 'Nexus:12'])
  })

  it('says nothing when everything came from one place', () => {
    // A heading telling you the only source was the only source is noise
    const groups = groupWinesByLocation([line('a', 6)], cellar, [nexus, berry])
    expect(groups).toHaveLength(1)
    expect(groups[0].showHeading).toBe(false)
  })

  it('heads every group once more than one locker is involved', () => {
    const groups = groupWinesByLocation([line('a', 6), line('b', 6)], cellar, [nexus, berry])
    expect(groups.every(g => g.showHeading)).toBe(true)
  })

  it('gathers wines with no locker under unallocated', () => {
    const groups = groupWinesByLocation([line('c', 6), line('a', 6)], cellar, [nexus, berry])
    expect(groups.map(g => g.name)).toEqual(['Nexus', 'Unallocated'])
  })

  it('keeps the planner\'s order within a group', () => {
    // Promoting one wine should not reshuffle the others around it
    const groups = groupWinesByLocation(
      [line('a', 1), line('a', 2), line('a', 3)],
      cellar,
      [nexus]
    )
    expect(groups[0].wines.map(w => w.quantity)).toEqual([1, 2, 3])
  })

  it('treats a wine the delivery names but the cellar has lost as unallocated', () => {
    const groups = groupWinesByLocation([line('ghost', 6)], cellar, [nexus])
    expect(groups[0].name).toBe('Unallocated')
  })
})

/**
 * Minimums are volumes, because "two cases" is a quantity of wine: six
 * magnums meet it as surely as twelve bottles do.
 */
describe('volume minimums', () => {
  it('reads a location saved in bottles as 75cl bottles', () => {
    // Saved before minimums were volumes; nobody should have to re-enter it
    const legacy = { ...location(), min_volume_ml: undefined, min_bottles: 12 }
    expect(minVolumeMl(legacy)).toBe(9000)
  })

  it('prefers the volume once one is saved', () => {
    expect(minVolumeMl({ min_volume_ml: 4500, min_bottles: 24 })).toBe(4500)
  })

  it('opens a legacy location for editing as a volume', () => {
    const legacy = { ...location(), min_volume_ml: undefined, min_bottles: 12 }
    expect(draftOf(legacy).min_volume_ml).toBe(9000)
  })

  it('takes the unallocated minimum from the cellar setting', () => {
    expect(unallocatedRules(24).min_volume_ml).toBe(18000)
    expect(unallocatedRules(12).min_volume_ml).toBe(9000)
  })

  it('says cases in words a person would use', () => {
    expect(formatCases(4500)).toBe('1 case')
    expect(formatCases(9000)).toBe('2 cases')
    expect(formatCases(6750)).toBe('1.5 cases')
  })
})

describe('when a location can deliver', () => {
  const fixed = { cadence: 'fixed' as const, delivery_months: [3, 9] }
  const flexible = { cadence: 'flexible' as const, delivery_months: [] }

  it('limits a fixed location to its months', () => {
    expect(isDeliveryMonth(fixed, 3)).toBe(true)
    expect(isDeliveryMonth(fixed, 4)).toBe(false)
  })

  it('lets a flexible location deliver any month', () => {
    for (let month = 1; month <= 12; month++) expect(isDeliveryMonth(flexible, month)).toBe(true)
  })

  it('finds the next slot, across the turn of the year', () => {
    expect(nextDeliveryMonth(fixed, 2026, 3)).toEqual({ year: 2026, month: 9 })
    expect(nextDeliveryMonth(fixed, 2026, 10)).toEqual({ year: 2027, month: 3 })
    expect(nextDeliveryMonth(flexible, 2026, 12)).toEqual({ year: 2027, month: 1 })
  })
})
