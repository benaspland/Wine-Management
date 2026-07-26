/**
 * Every distinct wine name in the committed collection, parsed and
 * compared against a reviewed fixture.
 *
 * The point is not that the fixture is correct by construction — it was
 * checked by hand — but that any future change to a region rule shows
 * exactly which wines it improved and which it disturbed. Tuning
 * Burgundy should not quietly rearrange Piedmont.
 *
 * To update after an intended change: run with UPDATE_GOLDEN=1, then
 * read the diff before committing it.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { parseWineName } from '../wineName.service'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CSV_PATH = path.resolve(__dirname, '../../../../wine-data.csv')
const GOLDEN_PATH = path.resolve(__dirname, 'fixtures/wine-names.golden.json')

interface GoldenEntry {
  region: string
  source: string
  producer: string
  name: string
  classification?: string
  confident: boolean
}

/** Quote-aware split; the Piedmont rows contain commas inside quotes. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (char === ',' && !inQuotes) {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  cells.push(current.trim())
  return cells
}

function parseCollection(): GoldenEntry[] {
  const lines = fs.readFileSync(CSV_PATH, 'utf-8').trim().split('\n')
  const headers = splitCsvLine(lines[0])
  const wineIndex = headers.indexOf('Wine')
  const regionIndex = headers.indexOf('Region')

  const seen = new Set<string>()
  const entries: GoldenEntry[] = []

  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line)
    const source = cells[wineIndex]
    const region = cells[regionIndex]
    if (!source) continue

    const key = `${region}|${source}`
    if (seen.has(key)) continue
    seen.add(key)

    const parsed = parseWineName(source, region)
    entries.push({
      region,
      source,
      producer: parsed.producer,
      name: parsed.name,
      classification: parsed.classification,
      confident: parsed.confident,
    })
  }

  return entries.sort((a, b) =>
    a.region === b.region ? a.source.localeCompare(b.source) : a.region.localeCompare(b.region)
  )
}

describe('wine name parsing — full collection', () => {
  const parsed = parseCollection()

  it('matches the reviewed golden fixture', () => {
    const golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf-8')) as GoldenEntry[]

    if (process.env.UPDATE_GOLDEN) {
      fs.writeFileSync(GOLDEN_PATH, `${JSON.stringify(parsed, null, 2)}\n`)
    }

    expect(parsed).toEqual(golden)
  })

  it('recognises every wine in the collection', () => {
    // A guessed split is allowed by the parser, but none of these
    // labels should need it — a new one appearing means a region rule
    // is missing rather than the collection being unusual
    const guessed = parsed.filter(entry => !entry.confident)
    expect(guessed.map(g => `${g.region}: ${g.source}`)).toEqual([])
  })

  it('never leaves the wine name repeating the producer', () => {
    // The "Chateau Meyney Meyney" failure, asserted structurally
    const stutters = parsed.filter(
      entry =>
        entry.name &&
        entry.producer.toLowerCase().includes(entry.name.toLowerCase())
    )
    expect(stutters.map(s => `${s.producer} / ${s.name}`)).toEqual([])
  })

  it('never reduces a wine name to a bare classification or grape', () => {
    const meaningless = ['gg', 'riesling', 'godello', 'spatlese', 'kabinett', 'reserva', 'riserva']
    const bad = parsed.filter(entry => meaningless.includes(entry.name.trim().toLowerCase()))
    expect(bad.map(b => `${b.source} -> ${b.name}`)).toEqual([])
  })

  it('never starts a wine name with a dangling preposition', () => {
    // "di Montalcino" was the symptom of a torn denomination
    const dangling = parsed.filter(entry => /^(di|de|del|della|du|des)\b/i.test(entry.name))
    expect(dangling.map(d => `${d.source} -> ${d.name}`)).toEqual([])
  })

  it('gives every wine a producer', () => {
    expect(parsed.filter(entry => !entry.producer.trim())).toEqual([])
  })

  it('produces a unique producer+name per distinct label', () => {
    // Collisions would make the importer skip a genuinely different
    // wine as a duplicate
    const keys = parsed.map(entry => `${entry.producer}|${entry.name}`.toLowerCase())
    const duplicated = keys.filter((key, index) => keys.indexOf(key) !== index)
    expect([...new Set(duplicated)]).toEqual([])
  })
})
