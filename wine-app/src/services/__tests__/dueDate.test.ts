import { describe, it, expect } from 'vitest'
import { dueDate } from '../deliveryPlanning.service'
import type { StorageLocation } from '../../types/index'

const NOW = new Date(2026, 10, 27) // 27 November 2026

const location = (id: string, overrides: Partial<StorageLocation>): StorageLocation => ({
  id,
  name: id,
  cadence: 'fixed',
  delivery_months: [3, 9],
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  ...overrides,
})

const flexible = location('berry', { cadence: 'flexible' })
const fixed = location('nexus', { delivery_months: [3, 9] })

describe('dueDate', () => {
  it('leaves a delivery this month or later where it is', () => {
    expect(dueDate('2026-11-01', 'berry', [flexible], NOW)).toBe('2026-11-01')
    expect(dueDate('2027-03-01', 'nexus', [fixed], NOW)).toBe('2027-03-01')
  })

  it('brings a missed delivery from a flexible location into this month', () => {
    expect(dueDate('2026-10-01', 'berry', [flexible], NOW)).toBe('2026-11-01')
  })

  it("moves a missed delivery from a fixed location to its next delivery month", () => {
    expect(dueDate('2026-09-01', 'nexus', [fixed], NOW)).toBe('2027-03-01')
  })

  it('uses this month when a fixed location delivers in it', () => {
    const november = location('nov', { delivery_months: [11] })
    expect(dueDate('2025-11-01', 'nov', [november], NOW)).toBe('2026-11-01')
  })

  it('follows the unallocated months for wine with no location', () => {
    expect(dueDate('2026-09-01', 'unallocated', [], NOW)).toBe('2027-03-01')
  })
})
