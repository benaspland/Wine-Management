import type { Tier } from '../types/index'
import type { ImportWineRow } from './workflows.service'
import * as workflows from './workflows.service'

interface CSVRow {
  Vintage: string
  Country: string
  Region: string
  Wine: string
  Quantity: string
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
] as const

/** Columns a file must contain; everything else is optional. */
export const CSV_REQUIRED_COLUMNS = ['Vintage', 'Country', 'Region', 'Wine', 'Quantity'] as const

export class ImportService {
  static async importFromCSV(
    file: File
  ): Promise<{ success: number; skipped: number; failed: number; errors: string[] }> {
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

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      try {
        const row = this.parseCsvLine(line, headers)
        const wine = this.csvRowToWine(row)
        winestoImport.push(wine)
      } catch (error) {
        errors.push(`Row ${i + 1}: ${(error as Error).message}`)
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

  private static csvRowToWine(row: CSVRow): ImportWineRow {
    // Parse wine name into producer + name
    const parsed = this.parseWineName(row.Wine)
    const producer = parsed.producer
    let name = parsed.name

    // Extract classification from wine name if not already in CSV Classification field
    let classification = row.Classification?.trim() || ''

    // Check if wine name contains classification keywords and extract them
    const classificationKeywords =
      /\b(Grand Cru|1er Cru|Premier Cru|Village|Appellation|AOC|DOCG|DOC|Classico|Riserva|Superiore)\b/gi
    const matches = name.match(classificationKeywords)

    if (matches && matches.length > 0) {
      // Use the first matched classification if not already set
      if (!classification || classification === '-') {
        classification = matches[0]
      }
      // Clean the classification keywords from the wine name
      name = name.replace(classificationKeywords, '').trim()
      // Clean up extra spaces
      name = name.replace(/\s+/g, ' ')
    }

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

    const format = row.Size?.trim()

    // Optional per-bottle price; tolerate currency symbols and thousands
    // separators ("£25.50", "1,200"). Absent/unparseable means unrecorded.
    const rawPrice = (row['Purchase Price'] ?? '').replace(/[^0-9.]/g, '')
    const purchasePrice = rawPrice ? parseFloat(rawPrice) : NaN

    // Optional purchase provenance. Unparseable values are left unrecorded
    // rather than failing the row — they're reference data, not inventory.
    const merchant = row.Merchant?.trim()

    return {
      name,
      vintage: parseInt(row.Vintage),
      tier,
      region: row.Region.trim(),
      producer: producer,
      classification: classification || undefined,
      wine_type: this.detectWineType(row.Varietal),
      varietal: row.Varietal.trim(),
      country: row.Country.trim(),
      alcohol_percent: isNaN(alcoholPercent) ? undefined : alcoholPercent,
      serving_temp_min: tempMin,
      serving_temp_max: tempMax,
      flavor_profile: row['Flavour Profile'].trim() || undefined,
      notes: row['Wine Notes']?.trim() || undefined,
      critic_ratings: JSON.stringify(criticRatings),
      format: format && format !== '-' ? format : undefined,
      purchase_price: !isNaN(purchasePrice) && purchasePrice > 0 ? purchasePrice : undefined,
      purchase_date: this.parsePurchaseDate(row['Purchase Date']),
      merchant: merchant && merchant !== '-' ? merchant : undefined,
      drinking_window_start: start,
      drinking_window_end: end,
      quantity_in_storage: quantity,
      quantity_at_home: 0, // Imported wines go to storage
    }
  }

  private static parseWineName(fullName: string): { producer: string; name: string } {
    const trimmed = fullName.trim()

    // Handle Bordeaux/château pattern: "Chateau/Château/Clos {Name}"
    const chateauMatch = trimmed.match(/^(Chateau|Château|Clos|Ch\.|Domaine)\s+(.+)$/i)
    if (chateauMatch) {
      const chateauName = chateauMatch[2].trim()
      return {
        producer: trimmed, // Keep full name as producer
        name: chateauName // Display without prefix
      }
    }

    // Handle Piedmont/Italian pattern: "Barolo: Fratelli Alessandria, Comune di Verduno"
    // Format: {WineType}: {Producer}, {Location/Cru}
    const piedmontMatch = trimmed.match(/^([^:]+):\s*([^,]+),\s*(.+)$/)
    if (piedmontMatch) {
      const wineType = piedmontMatch[1].trim() // "Barolo"
      const producer = piedmontMatch[2].trim() // "Fratelli Alessandria"
      const location = piedmontMatch[3].trim() // "Comune di Verduno"
      return {
        producer,
        name: `${wineType} ${location}` // "Barolo Comune di Verduno"
      }
    }

    // Handle quoted wine names: "Producer Name 'Wine Name'"
    const quotedMatch = trimmed.match(/^([^']+)'([^']+)'$/)
    if (quotedMatch) {
      return {
        producer: quotedMatch[1].trim(),
        name: quotedMatch[2].trim()
      }
    }

    const parts = trimmed.split(' ')

    if (parts.length <= 1) {
      return { producer: parts[0], name: parts[0] }
    }

    // Look for boundary indicators (these mark where wine name typically starts)
    const wineNameStartPatterns = [
      /^(Vina|Vineyard|Reserve|Reserva|Grand|Cru|AOC|DOC|DOCG|Classico|Riserva|Superiore)$/i,
      /^[A-Z][a-z]*\s+(di|da|d'|de|le|la|al|degli|delle)$/i, // "Rosso di", "Brunello di", etc.
    ]

    // Find where the wine name likely starts
    let nameStartIndex = parts.length // default: no split, all is name

    for (let i = 0; i < parts.length - 1; i++) {
      const nextPart = parts[i + 1]

      // Check for wine name start patterns
      for (const pattern of wineNameStartPatterns) {
        if (pattern.test(nextPart)) {
          nameStartIndex = i + 1
          break
        }
      }

      // Italian pattern: "Producer di Sotto" → producer is usually 1-2 words before "di/da/di Sotto/di Montalcino"
      if (i > 0 && /^(di|da|d'|de)$/i.test(nextPart)) {
        // Check if this looks like a wine type descriptor
        const afterPrep = parts[i + 2]
        if (afterPrep && /^[A-Z]/.test(afterPrep) && afterPrep.length > 3) {
          nameStartIndex = i + 1
          break
        }
      }
    }

    // French pattern: "Domaine Producer Appellation"
    // If we see "Domaine" or "Château", producer is typically next 1-2 words
    if (/^(Domaine|Château|Clos|Abbaye)$/i.test(parts[0]) && parts.length >= 3) {
      // Domaine + next 1-2 words = producer, rest = name
      nameStartIndex = parts[1] && /^[A-Z]/.test(parts[2]) ? 2 : 1
    }

    if (nameStartIndex === 0) nameStartIndex = 1
    if (nameStartIndex >= parts.length) nameStartIndex = Math.max(1, parts.length - 1)

    const producer = parts.slice(0, nameStartIndex).join(' ')
    const name = parts.slice(nameStartIndex).join(' ') || producer

    return { producer: producer.trim(), name: name.trim() }
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

  private static detectWineType(varietal: string): 'Red' | 'White' | 'Rosé' | 'Sparkling' | 'Fortified' {
    const lower = varietal.toLowerCase()

    // Sparkling indicators
    if (lower.includes('champagne') || lower.includes('prosecco') || lower.includes('cava')) {
      return 'Sparkling'
    }

    // Fortified indicators
    if (lower.includes('port') || lower.includes('sherry') || lower.includes('madeira')) {
      return 'Fortified'
    }

    // Red wine indicators
    if (
      lower.includes('cabernet') ||
      lower.includes('merlot') ||
      lower.includes('pinot noir') ||
      lower.includes('syrah') ||
      lower.includes('tempranillo') ||
      lower.includes('nebbiolo') ||
      lower.includes('sangiovese')
    ) {
      return 'Red'
    }

    // White wine indicators
    if (
      lower.includes('chardonnay') ||
      lower.includes('sauvignon') ||
      lower.includes('riesling') ||
      lower.includes('pinot gris') ||
      lower.includes('grüner') ||
      lower.includes('albariño')
    ) {
      return 'White'
    }

    // Rosé indicators
    if (lower.includes('rosé') || lower.includes('rose')) {
      return 'Rosé'
    }

    // Default to Red if uncertain (most wines are red)
    return 'Red'
  }
}
