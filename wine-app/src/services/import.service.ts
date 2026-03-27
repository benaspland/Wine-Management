import type { Wine, Tier } from '../types/index'
import * as db from './database'

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
}

export class ImportService {
  static async importFromCSV(file: File): Promise<{ success: number; failed: number; errors: string[] }> {
    const text = await file.text()
    const lines = text.trim().split('\n')

    if (lines.length < 2) {
      throw new Error('CSV file is empty or has no data rows')
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
    const requiredHeaders = ['Vintage', 'Country', 'Region', 'Wine', 'Quantity', 'Size']

    for (const header of requiredHeaders) {
      if (!headers.includes(header)) {
        throw new Error(`Missing required column: ${header}`)
      }
    }

    let success = 0
    let failed = 0
    const errors: string[] = []

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      try {
        const row = this.parseCsvLine(line, headers)
        const wine = this.csvRowToWine(row)
        await db.createWine(wine)
        success++
      } catch (error) {
        failed++
        errors.push(`Row ${i + 1}: ${(error as Error).message}`)
      }
    }

    return { success, failed, errors }
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

    const row: any = {}
    headers.forEach((header, index) => {
      row[header] = values[index] || ''
    })

    return row as CSVRow
  }

  private static csvRowToWine(row: CSVRow): Omit<Wine, 'id' | 'created_at' | 'updated_at'> {
    // Parse wine name into producer + name
    const { producer, name } = this.parseWineName(row.Wine)

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

    return {
      producer,
      name,
      vintage: parseInt(row.Vintage),
      country: row.Country.trim(),
      region: row.Region.trim(),
      classification: row.Classification.trim(),
      wine_type: this.detectWineType(row.Varietal),
      varietal: row.Varietal.trim(),
      tier,
      location: 'storage',
      quantity: parseInt(row.Quantity),
      format: row.Size.trim(),
      drinking_window_start: start,
      drinking_window_end: end,
      alcohol_percent: isNaN(alcoholPercent) ? 0 : alcoholPercent,
      serving_temp_min: tempMin,
      serving_temp_max: tempMax,
      notes: row['Wine Notes'].trim(),
      critic_ratings: criticRatings,
      flavor_profile: row['Flavour Profile'].trim(),
      image_url: undefined,
    }
  }

  private static parseWineName(fullName: string): { producer: string; name: string } {
    const trimmed = fullName.trim()

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
      const match = part.trim().match(/^(\w+)\s+(\d+)$/)
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
