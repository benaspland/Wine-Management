/**
 * ImportService tests — CSV ingestion is the primary data-entry path for
 * the whole collection, so this suite covers both the real committed
 * collection file (wine-data.csv, 126 rows) and synthetic edge cases:
 * malformed rows, missing columns, duplicates, quoting, and the
 * individual field parsers.
 *
 * Several tests are labelled CHARACTERIZATION: they pin current behavior
 * that is questionable (silent duplicate skips, the Bordeaux name
 * rewrite, dropped "94+" ratings, ignored Size column). If that behavior
 * is deliberately fixed, update these tests as part of the fix.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import * as db from '../database'
import { ImportService } from '../import.service'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Mock localStorage for tests (same pattern as workflows.integration.test.ts)
const localStorageMock = (() => {
  let store: Record<string, string> = {}

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

const HEADER =
  'Vintage,Country,Region,Wine,Quantity,Size,Peak Drinking Window,Classification,' +
  'Wine Rating,Professional Critic Ratings,Wine Notes,Varietal,Alcohol Level,' +
  'Flavour Profile,Recommended Service Temp'

const COLUMNS = HEADER.split(',')

/**
 * Build a CSV data row from column overrides. Defaults form a valid row
 * whose Wine field ("Chateau Testino") parses deterministically via the
 * château rule: producer "Chateau Testino", name "Testino".
 */
function row(overrides: Partial<Record<string, string>> = {}): string {
  const defaults: Record<string, string> = {
    Vintage: '2018',
    Country: 'Italy',
    Region: 'Tuscany',
    Wine: 'Chateau Testino',
    Quantity: '6',
    Size: '750ml',
    'Peak Drinking Window': '2025-2040',
    Classification: '-',
    'Wine Rating': '3',
    'Professional Critic Ratings': 'JS 93 : RP 91',
    'Wine Notes': 'Test notes',
    Varietal: 'Sangiovese',
    'Alcohol Level': '13.5%',
    'Flavour Profile': 'Cherry : Earth',
    'Recommended Service Temp': '16-18°C',
  }
  const merged = { ...defaults, ...overrides }
  return COLUMNS.map((col) => {
    const value = merged[col] ?? ''
    return value.includes(',') || value.includes('"')
      ? `"${value.replace(/"/g, '""')}"`
      : value
  }).join(',')
}

function csvFile(content: string): File {
  return new File([content], 'wines.csv', { type: 'text/csv' })
}

function csv(...rows: string[]): File {
  return csvFile([HEADER, ...rows].join('\n'))
}

beforeEach(async () => {
  localStorage.clear()
  await db.initializeDatabase()
})

// ===========================================================================
// PART 1: the real collection file
// ===========================================================================

describe('ImportService - real collection CSV (wine-data.csv)', () => {
  const csvPath = path.join(__dirname, '../../../..', 'wine-data.csv')
  const realFile = () => csvFile(fs.readFileSync(csvPath, 'utf-8'))

  it('imports 125 of 126 rows with no errors (one exact duplicate row)', async () => {
    const result = await ImportService.importFromCSV(realFile())

    expect(result.success).toBe(125)
    expect(result.failed).toBe(0)
    expect(result.errors).toEqual([])

    const wines = await db.getAllWines()
    expect(wines.length).toBe(125)
  })

  it('CHARACTERIZATION: the duplicate row is skipped silently, not reported', async () => {
    // "Barbaresco: Produttori del Barbaresco, Normale" (2021) appears twice
    // in the file. The importer deduplicates on name+vintage+producer, but
    // the skip is invisible in the returned result — success excludes it
    // and errors stay empty.
    const result = await ImportService.importFromCSV(realFile())
    expect(result.success + result.failed).toBe(125)

    const wines = await db.getAllWines()
    const duplicated = wines.filter(
      (w) =>
        w.producer === 'Produttori del Barbaresco' &&
        w.name === 'Barbaresco Normale' &&
        w.vintage === 2021
    )
    expect(duplicated.length).toBe(1)
  })

  it('places every imported bottle in storage, none at home', async () => {
    await ImportService.importFromCSV(realFile())
    const wines = await db.getAllWines()

    const totalInStorage = wines.reduce((sum, w) => sum + w.quantity_in_storage, 0)
    expect(totalInStorage).toBe(614)
    expect(wines.every((w) => w.quantity_at_home === 0)).toBe(true)
    expect(wines.every((w) => Number.isInteger(w.quantity_in_storage) && w.quantity_in_storage > 0)).toBe(true)
  })

  it('produces only valid wine records', async () => {
    await ImportService.importFromCSV(realFile())
    const wines = await db.getAllWines()

    for (const wine of wines) {
      expect(wine.name.trim()).not.toBe('')
      expect(wine.producer?.trim()).not.toBe('')
      expect(wine.vintage).toBeGreaterThanOrEqual(1800)
      expect(wine.tier).toBeGreaterThanOrEqual(1)
      expect(wine.tier).toBeLessThanOrEqual(5)
      expect(wine.drinking_window_start).toBeLessThanOrEqual(wine.drinking_window_end)
      if (wine.alcohol_percent !== undefined) {
        expect(Number.isNaN(wine.alcohol_percent)).toBe(false)
      }
    }
  })

  it('re-importing the same file is idempotent', async () => {
    await ImportService.importFromCSV(realFile())
    const second = await ImportService.importFromCSV(realFile())

    expect(second.success).toBe(0)
    expect(second.failed).toBe(0)
    expect(second.errors).toEqual([])

    const wines = await db.getAllWines()
    expect(wines.length).toBe(125)
  })

  it('CHARACTERIZATION: every Bordeaux wine is renamed to "Bordeaux"', async () => {
    // For France/Bordeaux rows the importer overwrites the parsed wine name
    // with the region, so all ~19 Bordeaux wines end up named "Bordeaux"
    // and are distinguishable only by producer. Destructive — the parsed
    // château name is discarded.
    await ImportService.importFromCSV(realFile())
    const wines = await db.getAllWines()

    const bordeaux = wines.filter((w) => w.country === 'France' && w.region === 'Bordeaux')
    expect(bordeaux.length).toBeGreaterThanOrEqual(15)
    expect(bordeaux.every((w) => w.name === 'Bordeaux')).toBe(true)
    // The producer still carries the château identity
    expect(bordeaux.some((w) => w.producer === 'Chateau Gloria')).toBe(true)
  })

  it('parses the Piedmont "Type: Producer, Cru" pattern into producer + name', async () => {
    await ImportService.importFromCSV(realFile())
    const wines = await db.getAllWines()

    // Source row: 2011,"Barolo: Massolino, Margheria",...
    const massolino = wines.find((w) => w.producer === 'Massolino' && w.vintage === 2011)
    expect(massolino).toBeDefined()
    expect(massolino?.name).toBe('Barolo Margheria')
  })

  it('CHARACTERIZATION: the Size column is ignored — Magnum formats are lost', async () => {
    // The CSV records bottle Size (75cl/Magnum) but csvRowToWine never maps
    // it to the wine's format field, so every import loses format data.
    await ImportService.importFromCSV(realFile())
    const wines = await db.getAllWines()

    // 2011 Barolo: Massolino, Margheria is a Magnum in the CSV
    const magnumRow = wines.find((w) => w.producer === 'Massolino' && w.vintage === 2011)
    expect(magnumRow?.format).toBeUndefined()
  })

  it('CHARACTERIZATION: critic ratings with "+" qualifiers are dropped', async () => {
    // "RP 94+" does not match the rating parser's /^(\w+)\s+(\d+)$/ and is
    // silently omitted from the stored ratings.
    await ImportService.importFromCSV(realFile())
    const wines = await db.getAllWines()

    // Source row: Chateau Grand-Puy-Lacoste 2016, "JS 96 : NM 95 : RP 94+ : JA 94"
    const gpl = wines.find((w) => w.producer === 'Chateau Grand-Puy-Lacoste' && w.vintage === 2016)
    expect(gpl).toBeDefined()
    const ratings = JSON.parse((gpl!.critic_ratings as string) ?? '{}') as Record<string, number>
    expect(ratings).toEqual({ js: 96, nm: 95, ja: 94 })
    expect(ratings.rp).toBeUndefined()
  })
})

// ===========================================================================
// PART 2: structural edge cases
// ===========================================================================

describe('ImportService - file structure and malformed input', () => {
  it('rejects a CSV missing a required column', async () => {
    const withoutQuantity = COLUMNS.filter((c) => c !== 'Quantity').join(',')
    const file = csvFile([withoutQuantity, '2018,Italy,Tuscany,Chateau Testino,750ml'].join('\n'))

    await expect(ImportService.importFromCSV(file)).rejects.toThrow(
      'Missing required column: Quantity'
    )
  })

  it('rejects an empty file', async () => {
    await expect(ImportService.importFromCSV(csvFile(''))).rejects.toThrow(
      'CSV file is empty or has no data rows'
    )
  })

  it('rejects a header-only file', async () => {
    await expect(ImportService.importFromCSV(csvFile(HEADER))).rejects.toThrow(
      'CSV file is empty or has no data rows'
    )
  })

  it('reports a malformed row by line number and continues with the rest', async () => {
    const file = csv(
      row({ Wine: 'Chateau Uno', Vintage: '2015' }),
      row({ Wine: 'Chateau Due', Vintage: '2016', 'Peak Drinking Window': 'TBD' }),
      row({ Wine: 'Chateau Tre', Vintage: '2017' })
    )

    const result = await ImportService.importFromCSV(file)

    expect(result.success).toBe(2)
    expect(result.errors).toHaveLength(1)
    // Line numbering is 1-based including the header, so data row 2 = "Row 3"
    expect(result.errors[0]).toContain('Row 3')
    expect(result.errors[0]).toContain('Invalid drinking window: TBD')

    const wines = await db.getAllWines()
    expect(wines.map((w) => w.name).sort()).toEqual(['Tre', 'Uno'])
  })

  it('parses quoted fields containing commas without shifting columns', async () => {
    const file = csv(
      row({
        Wine: 'Barolo: Fratelli Alessandria, Comune di Verduno',
        Quantity: '4',
        Varietal: 'Nebbiolo',
      })
    )

    const result = await ImportService.importFromCSV(file)
    expect(result.success).toBe(1)

    const wines = await db.getAllWines()
    expect(wines[0].producer).toBe('Fratelli Alessandria')
    expect(wines[0].name).toBe('Barolo Comune di Verduno')
    // Columns after the quoted field must not shift
    expect(wines[0].quantity_in_storage).toBe(4)
    expect(wines[0].varietal).toBe('Nebbiolo')
    expect(wines[0].alcohol_percent).toBe(13.5)
  })

  it('unescapes doubled quotes inside quoted fields', async () => {
    const file = csv(
      row({ 'Flavour Profile': 'Cherry, "wild" berries' })
    )

    await ImportService.importFromCSV(file)
    const wines = await db.getAllWines()
    expect(wines[0].flavor_profile).toBe('Cherry, "wild" berries')
  })

  it('skips blank lines between and after rows', async () => {
    const content = [
      HEADER,
      row({ Wine: 'Chateau Uno', Vintage: '2015' }),
      '',
      row({ Wine: 'Chateau Due', Vintage: '2016' }),
      '',
      '',
    ].join('\n')

    const result = await ImportService.importFromCSV(csvFile(content))
    expect(result.success).toBe(2)
    expect(result.errors).toEqual([])
  })
})

// ===========================================================================
// PART 3: row validation and duplicates
// ===========================================================================

describe('ImportService - validation and duplicate handling', () => {
  it('rejects a non-numeric vintage via workflow validation', async () => {
    const file = csv(row({ Vintage: 'NV' }))

    const result = await ImportService.importFromCSV(file)

    expect(result.success).toBe(0)
    expect(result.failed).toBe(1)
    expect(result.errors[0]).toContain('vintage')
    expect(result.errors[0]).toContain('Must be 4-digit year >= 1800')
    expect(await db.getAllWines()).toHaveLength(0)
  })

  it('rejects an inverted drinking window', async () => {
    const file = csv(row({ 'Peak Drinking Window': '2040-2025' }))

    const result = await ImportService.importFromCSV(file)

    expect(result.success).toBe(0)
    expect(result.failed).toBe(1)
    expect(result.errors[0]).toContain('drinking_window')
    expect(await db.getAllWines()).toHaveLength(0)
  })

  it('CHARACTERIZATION: a garbage quantity silently imports as 0 bottles', async () => {
    // parseInt('lots') is NaN, which the importer coerces to 0 — the row
    // imports "successfully" with zero bottles instead of being flagged.
    const file = csv(row({ Quantity: 'lots' }))

    const result = await ImportService.importFromCSV(file)

    expect(result.success).toBe(1)
    expect(result.errors).toEqual([])
    const wines = await db.getAllWines()
    expect(wines[0].quantity_in_storage).toBe(0)
  })

  it('skips a duplicate appearing later in the same file', async () => {
    const file = csv(
      row({ Wine: 'Chateau Uno', Vintage: '2015', Quantity: '6' }),
      row({ Wine: 'Chateau Uno', Vintage: '2015', Quantity: '3' })
    )

    const result = await ImportService.importFromCSV(file)

    expect(result.success).toBe(1)
    const wines = await db.getAllWines()
    expect(wines).toHaveLength(1)
    // First occurrence wins; the duplicate's quantity is not merged
    expect(wines[0].quantity_in_storage).toBe(6)
  })

  it('does not treat the same name/vintage from different producers as duplicates', async () => {
    const file = csv(
      row({ Wine: 'Barolo: Massolino, Margheria', Vintage: '2015' }),
      row({ Wine: 'Barolo: Vietti, Margheria', Vintage: '2015' })
    )

    const result = await ImportService.importFromCSV(file)

    expect(result.success).toBe(2)
    const producers = (await db.getAllWines()).map((w) => w.producer).sort()
    expect(producers).toEqual(['Massolino', 'Vietti'])
  })

  it('does not treat different vintages of the same wine as duplicates', async () => {
    const file = csv(
      row({ Wine: 'Chateau Uno', Vintage: '2015' }),
      row({ Wine: 'Chateau Uno', Vintage: '2016' })
    )

    const result = await ImportService.importFromCSV(file)
    expect(result.success).toBe(2)
    expect(await db.getAllWines()).toHaveLength(2)
  })
})

// ===========================================================================
// PART 4: field parsers (exercised through the public import surface)
// ===========================================================================

describe('ImportService - field parsing', () => {
  async function importOne(overrides: Partial<Record<string, string>>) {
    const result = await ImportService.importFromCSV(csv(row(overrides)))
    expect(result.success).toBe(1)
    const wines = await db.getAllWines()
    return wines[0]
  }

  it('parses the drinking window into start and end years', async () => {
    const wine = await importOne({ 'Peak Drinking Window': '2026-2048' })
    expect(wine.drinking_window_start).toBe(2026)
    expect(wine.drinking_window_end).toBe(2048)
  })

  it('parses serving temperature range and falls back to 15-18 when unparseable', async () => {
    const parsed = await importOne({ 'Recommended Service Temp': '8-10°C' })
    expect(parsed.serving_temp_min).toBe(8)
    expect(parsed.serving_temp_max).toBe(10)

    localStorage.clear()
    await db.initializeDatabase()

    const fallback = await importOne({ 'Recommended Service Temp': 'Chilled' })
    expect(fallback.serving_temp_min).toBe(15)
    expect(fallback.serving_temp_max).toBe(18)
  })

  it('parses colon-separated critic ratings into a keyed object', async () => {
    const wine = await importOne({ 'Professional Critic Ratings': 'JS 97 : RP 96 : WE 96 : TA 94' })
    expect(JSON.parse((wine.critic_ratings as string) ?? '{}')).toEqual({ js: 97, rp: 96, we: 96, ta: 94 })
  })

  it('parses alcohol percentage and omits it when missing', async () => {
    const withAlcohol = await importOne({ 'Alcohol Level': '14.5%' })
    expect(withAlcohol.alcohol_percent).toBe(14.5)

    localStorage.clear()
    await db.initializeDatabase()

    const withoutAlcohol = await importOne({ 'Alcohol Level': '' })
    expect(withoutAlcohol.alcohol_percent).toBeUndefined()
  })

  it('clamps the wine rating into the 1-5 tier range', async () => {
    const high = await importOne({ 'Wine Rating': '9' })
    expect(high.tier).toBe(5)

    localStorage.clear()
    await db.initializeDatabase()

    const missing = await importOne({ 'Wine Rating': '' })
    expect(missing.tier).toBe(1)
  })

  it('detects wine type from the varietal', async () => {
    const cases: Array<[string, string]> = [
      ['Nebbiolo', 'Red'],
      ['Chardonnay', 'White'],
      ['Champagne Blend', 'Sparkling'],
      ['Vintage Port', 'Fortified'],
      ['Grenache Rosé', 'Rosé'],
      // Unknown varietals default to Red
      ['Zweigelt', 'Red'],
    ]

    for (const [varietal, expected] of cases) {
      localStorage.clear()
      await db.initializeDatabase()
      const wine = await importOne({ Varietal: varietal })
      expect(wine.wine_type, `varietal: ${varietal}`).toBe(expected)
    }
  })

  it('extracts classification keywords from the wine name when the CSV field is empty', async () => {
    const wine = await importOne({ Wine: 'Chateau Testino Grand Cru', Classification: '-' })
    expect(wine.classification).toBe('Grand Cru')
    // The keyword is removed from the display name
    expect(wine.name).toBe('Testino')
  })

  it('CHARACTERIZATION: the Bordeaux rule overwrites the wine name with the region', async () => {
    const wine = await importOne({
      Wine: 'Chateau Margaux',
      Country: 'France',
      Region: 'Bordeaux',
    })
    expect(wine.producer).toBe('Chateau Margaux')
    expect(wine.name).toBe('Bordeaux')
  })
})
