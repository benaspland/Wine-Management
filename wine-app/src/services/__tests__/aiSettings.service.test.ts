/**
 * Where the API key lives, and — more importantly — where it doesn't.
 *
 * The app has no server, so the key sits in the browser. That is a
 * deliberate trade with one hard rule attached: it must never leave this
 * device by any path the app itself provides. The backup and the CSV
 * export are those paths, and both are files a user mails to themselves.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  looksLikeApiKey,
  storedApiKey,
  saveApiKey,
  hasApiKey,
  webSearchEnabled,
  setWebSearchEnabled,
} from '../aiSettings.service'
import * as db from '../database'

beforeEach(() => {
  localStorage.clear()
})

describe('the API key', () => {
  it('round-trips and reports itself present', () => {
    expect(hasApiKey()).toBe(false)
    saveApiKey('sk-ant-api03-EXAMPLE-NOT-A-REAL-KEY-000000')
    expect(storedApiKey()).toBe('sk-ant-api03-EXAMPLE-NOT-A-REAL-KEY-000000')
    expect(hasApiKey()).toBe(true)
  })

  it('is removed rather than stored blank when cleared', () => {
    saveApiKey('sk-ant-api03-EXAMPLE-NOT-A-REAL-KEY-000000')
    saveApiKey('   ')
    expect(storedApiKey()).toBe('')
    expect(hasApiKey()).toBe(false)
  })

  it('recognises a Console key, and a paste that went wrong', () => {
    expect(looksLikeApiKey('sk-ant-api03-EXAMPLE-NOT-A-REAL-KEY-000000')).toBe(true)
    expect(looksLikeApiKey('my key is sk-ant-...')).toBe(false)
    expect(looksLikeApiKey('hunter2')).toBe(false)
  })

  it('never appears in a backup file', async () => {
    // The backup is a file people email to themselves; a key in it is a
    // key in an inbox
    await db.initializeDatabase()
    saveApiKey('sk-ant-api03-EXAMPLE-NOT-A-REAL-KEY-000000')

    const backup = JSON.stringify(await db.exportDatabase())

    expect(backup).not.toContain('sk-ant-')
    expect(backup).not.toContain('wine-app-anthropic-key')
  })
})

describe('web search', () => {
  it('is on unless it has been turned off', () => {
    // Grounding is the difference between a checkable answer and a
    // confident one, so it is not something you have to discover
    expect(webSearchEnabled()).toBe(true)
  })

  it('remembers being turned off, and back on', () => {
    setWebSearchEnabled(false)
    expect(webSearchEnabled()).toBe(false)
    setWebSearchEnabled(true)
    expect(webSearchEnabled()).toBe(true)
  })
})
