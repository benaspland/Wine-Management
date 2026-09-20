/**
 * A write that fails must say so.
 *
 * This is the bug behind "it said the wine was saved, and it wasn't":
 * persist() caught every storage failure, warned to a console no phone
 * shows, and resolved — so createWine resolved, the form closed, and the
 * toast announced a wine that had never reached disk. Every mutation in
 * the app went through the same path, so consuming a bottle or editing a
 * wine could vanish on reload just as quietly.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import * as db from '../database'
import { describeStorageFailure } from '../database'
import * as adapterModule from '../storage/adapter'

const makeWine = () => ({
  name: 'Test', producer: 'Producer', vintage: 2018, tier: 2 as const,
  region: 'Rioja', drinking_window_start: 2024, drinking_window_end: 2030,
  quantity_in_storage: 6, quantity_at_home: 0,
})

beforeEach(async () => {
  localStorage.clear()
  await db.initializeDatabase()
})
afterEach(() => vi.restoreAllMocks())

describe('a storage write that fails', () => {
  it('rejects the write rather than reporting success', async () => {
    vi.spyOn(adapterModule.IndexedDBAdapter.prototype, 'save').mockRejectedValue(
      Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' })
    )
    vi.spyOn(adapterModule.LocalStorageAdapter.prototype, 'save').mockRejectedValue(
      Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' })
    )

    await expect(db.createWine(makeWine())).rejects.toThrow(/run out of storage/)
  })

  it('succeeds normally when the write goes through', async () => {
    const wine = await db.createWine(makeWine())
    expect(wine.id).toBeTruthy()
  })
})

describe('describeStorageFailure', () => {
  it('names a full quota, because that is the one with a remedy', () => {
    expect(
      describeStorageFailure(Object.assign(new Error('x'), { name: 'QuotaExceededError' }))
    ).toMatch(/run out of storage/)
    expect(describeStorageFailure(new Error('Storage quota reached'))).toMatch(/run out of storage/)
  })

  it('passes anything else through rather than guessing', () => {
    expect(describeStorageFailure(new Error('database is closing'))).toMatch(/database is closing/)
  })
})
