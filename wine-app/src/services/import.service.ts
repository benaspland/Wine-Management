import type { Tier } from '../types/index'
import { detectWineType, normalizeWineType } from './wineType.service'
import { normalizeFormat } from './format.service'
import { parseWineName } from './wineName.service'
import type { ImportWineRow } from './workflows.service'
import * as workflows from './workflows.service'

interface CSVRow {
  Vintage: string
  Country: string
  Region: string
  Wine: string
  Quantity: string
  'At Home'?: string
  Size: string
  'Peak Drinking Window': string
  Classification: string
  'Wine Rating': string
  'Professional Critic Ratings': string
  'Wine Notes': string
  Varietal: string
  'Alcohol Level': string
  'Flavour Profile': string
  'Recommended Service Temp': string
  'Purchase Price'?: string
  'Purchase Date'?: string
  Merchant?: string
  Producer?: string
  Cuvee?: string
  'Wine Type'?: string
}

/**
 * The canonical CSV column order. Import reads these, export writes these,
 * and the Settings screen documents these — one list so the three can
 * never drift apart.
 */
export const CSV_COLUMNS = [
  'Vintage',
  'Country',
  'Region',
  'Wine',
  'Quantity',
  'At Home',
  'Size',
  'Peak Drinking Window',
  'Classification',
  'Wine Rating',
  'Professional Critic Ratings',
  'Wine Notes',
  'Varietal',
  'Alcohol Level',
  'Flavour Profile',
  'Recommended Service Temp',
  'Purchase Price',
  'Purchase Date',
  'Merchant',
  'Producer',
  'Cuvee',
  'Wine Type',
] as const

/** Columns a file must contain; everything else is optional. */
export const CSV_REQUIRED_COLUMNS = ['Vintage', 'Country', 'Region', 'Wine', 'Quantity'] as const

export class ImportService {
  static async importFromCSV(
    file: File
  ): Promise<{
    success: number
    skipped: number
    failed: number
    errors: string[]
    /** Rows whose producer/name split was guessed rather than recognised. */
    uncertain: string[]
    /** Non-fatal problems, e.g. home inventory over capacity. */
    warnings: string[]
  }> {
    const text = await file.text()
    const lines = text.trim().split('\n')

    if (lines.length < 2) {
      throw new Error('CSV file is empty or has no data rows')
    }

    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''))

    for (const header of CSV_REQUIRED_COLUMNS) {
      if (!headers.includes(header)) {
        throw new Error(`Missing required column: ${header}`)
      }
    }

    const winestoImport: ImportWineRow[] = []
    const errors: string[] = []
    const uncertain: string[] = []

    // First pass: read every row, and gather any producer stated
    // explicitly. A Producer column on one row then teaches the parser
    // about every other row by that producer.
    const rows: Array<{ row: CSVRow; lineNumber: number }> = []
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      rows.push({ row: this.parseCsvLine(line, headers), lineNumber: i + 1 })
    }

    const knownProducers = [
      ...new Set(rows.map(r => r.row.Producer?.trim()).filter((p): p is string => Boolean(p))),
    ]

    for (const { row, lineNumber } of rows) {
      try {
        const { wine, confident } = this.csvRowToWine(row, knownProducers)
        winestoImport.push(wine)
        if (!confident) {
          uncertain.push(`Row ${lineNumber}: "${row.Wine}" read as ${wine.producer} / ${wine.name}`)
        }
      } catch (error) {
        errors.push(`Row ${lineNumber}: ${(error as Error).message}`)
      }
    }

    // Use workflow to import all wines at once
    const result = await workflows.importWineCollection(winestoImport)

    // failed covers both parse-stage rejects and workflow validation failures
    return {
      success: result.imported,
      skipped: result.skipped,
      failed: errors.length + result.failed.length,
      errors: errors.concat(result.failed.map(f => `Row ${f.rowNumber}: ${f.field} - ${f.error}`)),
      uncertain,
      warnings: result.warnings,
    }
  }

  private static parseCsvLine(line: string, headers: string[]): CSVRow {
    // Simple CSV parsing - handles quoted fields
    const values: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      const nextChar = line[i + 1]

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim().replace(/^"|"$/g, ''))
        current = ''
      } else {
        current += char
      }
    }
    values.push(current.trim().replace(/^"|"$/g, ''))

    const row: Record<string, string> = {}
    headers.forEach((header, index) => {
      row[header] = values[index] || ''
    })

    return row as unknown as CSVRow
  }

  /**
   * @param knownProducers Producers named explicitly elsewhere in the
   * file, so one row's Producer column teaches the parser about the rest.
   */
  private static csvRowToWine(
    row: CSVRow,
    knownProducers: string[] = []
  ): { wine: ImportWineRow; confident: boolean } {
    // Explicit columns beat inference: for the handful of genuinely
    // awkward labels, stating the answer is better than any rule
    const explicitProducer = row.Producer?.trim()
    const explicitCuvee = row.Cuvee?.trim()

    const parsed = parseWineName(row.Wine, row.Region?.trim(), knownProducers)
    // Blank means "infer it", not "the name is empty". With ?? here, a
    // Cuvee column present but left blank — as it is in a file exported
    // from the app, or any template — silently replaced every parsed
    // wine name with nothing, leaving producers with no wine.
    const producer = explicitProducer || parsed.producer
    const name = explicitCuvee || parsed.name

    // The CSV column is authoritative; the parser only fills the gap
    const columnClassification = row.Classification?.trim()
    const classification =
      columnClassification && columnClassification !== '-'
        ? columnClassification
        : parsed.classification

    // Parse drinking window
    const { start, end } = this.parseDrinkingWindow(row['Peak Drinking Window'])

    // Parse serving temperature
    const { min: tempMin, max: tempMax } = this.parseTemperature(row['Recommended Service Temp'])

    // Parse critic ratings
    const criticRatings = this.parseCriticRatings(row['Professional Critic Ratings'])

    // Parse alcohol level
    const alcoholPercent = parseFloat(row['Alcohol Level'].replace('%', ''))

    // Get tier from Wine Rating (1-5)
    const tier = Math.max(1, Math.min(5, parseInt(row['Wine Rating']) || 1)) as Tier

    // Quantity must be a real number — a typo here would otherwise import 0 bottles
    const quantity = parseInt(row.Quantity)
    if (isNaN(quantity)) {
      throw new Error(`Invalid quantity: ${row.Quantity}`)
    }

    // Bottles already in the house. Imports otherwise assume everything
    // sits in professional storage, which is wrong for a collection
    // that has been drawn on for years. Clamped to the quantity owned:
    // a typo cannot conjure bottles that are not there.
    const rawAtHome = parseInt(row['At Home'] ?? '')
    const atHome = Number.isInteger(rawAtHome) ? Math.min(Math.max(rawAtHome, 0), quantity) : 0

    // Sources describe the same bottle many ways; store one trade name
    const format = normalizeFormat(row.Size)

    // Optional per-bottle price; tolerate currency symbols and thousands
    // separators ("£25.50", "1,200"). Absent/unparseable means unrecorded.
    const rawPrice = (row['Purchase Price'] ?? '').replace(/[^0-9.]/g, '')
    const purchasePrice = rawPrice ? parseFloat(rawPrice) : NaN

    // Optional purchase provenance. Unparseable values are left unrecorded
    // rather than failing the row — they're reference data, not inventory.
    const merchant = row.Merchant?.trim()

    return {
      wine: {
      name,
      vintage: parseInt(row.Vintage),
      tier,
      region: row.Region.trim(),
      producer: producer,
      classification: classification || undefined,
      // An explicit "(Rouge)" on the label beats guessing from varietal
      wine_type:
        normalizeWineType(row['Wine Type']) ??
        parsed.colour ??
        detectWineType(row.Varietal, row.Wine) ??
        'Red',
      varietal: row.Varietal.trim(),
      country: row.Country.trim(),
      alcohol_percent: isNaN(alcoholPercent) ? undefined : alcoholPercent,
      serving_temp_min: tempMin,
      serving_temp_max: tempMax,
      flavor_profile: row['Flavour Profile'].trim() || undefined,
      notes: row['Wine Notes']?.trim() || undefined,
      critic_ratings: JSON.stringify(criticRatings),
      format,
      purchase_price: !isNaN(purchasePrice) && purchasePrice > 0 ? purchasePrice : undefined,
      purchase_date: this.parsePurchaseDate(row['Purchase Date']),
      merchant: merchant && merchant !== '-' ? merchant : undefined,
      drinking_window_start: start,
      drinking_window_end: end,
      quantity_in_storage: quantity - atHome,
      quantity_at_home: atHome,
      },
      // Explicit columns make a row trustworthy however odd the label
      confident: parsed.confident || Boolean(explicitProducer),
    }
  }

  /**
   * Normalize a purchase date to YYYY-MM-DD. Accepts ISO (2024-03-15) and
   * UK day-first (15/03/2024, 15-03-2024, 15.03.2024) — the two forms a
   * spreadsheet in the UK actually produces. A 4-digit leading group means
   * ISO; otherwise the first number is the day. Anything else, or an
   * impossible date like 31/02, is treated as unrecorded.
   */
  static parsePurchaseDate(raw?: string): string | undefined {
    const value = (raw ?? '').trim()
    if (!value || value === '-') return undefined

    const iso = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
    if (iso) {
      return this.toIsoDate(parseInt(iso[1]), parseInt(iso[2]), parseInt(iso[3]))
    }

    const dayFirst = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
    if (dayFirst) {
      return this.toIsoDate(parseInt(dayFirst[3]), parseInt(dayFirst[2]), parseInt(dayFirst[1]))
    }

    return undefined
  }

  /** Build YYYY-MM-DD, rejecting calendar-invalid dates (e.g. 31 February). */
  private static toIsoDate(year: number, month: number, day: number): string | undefined {
    if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      return undefined
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  private static parseDrinkingWindow(window: string): { start: number; end: number } {
    // Parse "2022-2045" format
    const parts = window.split('-')
    const start = parseInt(parts[0])
    const end = parseInt(parts[1])

    if (isNaN(start) || isNaN(end)) {
      throw new Error(`Invalid drinking window: ${window}`)
    }

    return { start, end }
  }

  private static parseTemperature(temp: string): { min: number; max: number } {
    // Parse "16-18°C" format
    const match = temp.match(/(\d+)\s*-\s*(\d+)/)
    if (!match) {
      return { min: 15, max: 18 }
    }

    return { min: parseInt(match[1]), max: parseInt(match[2]) }
  }

  private static parseCriticRatings(ratings: string): Record<string, number> {
    // Parse "JS 97 : RP 96 : WE 96 : TA 94" format
    const result: Record<string, number> = {}

    const parts = ratings.split(':')
    for (const part of parts) {
      // Allow qualifiers like "RP 94+" — keep the numeric score
      const match = part.trim().match(/^(\w+)\s+(\d+)\+?$/)
      if (match) {
        result[match[1].toLowerCase()] = parseInt(match[2])
      }
    }

    return result
  }

}
