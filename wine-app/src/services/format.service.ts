/**
 * Bottle format normalisation.
 *
 * Merchants and spreadsheets describe the same bottle a dozen ways —
 * "750ml", "75cl", "0.75L", "Bottle" — and a collection imported from
 * several sources ends up with all of them, which fragments the format
 * filter and makes identical bottles look different on the cards.
 *
 * Everything funnels through normalizeFormat() into the trade names the
 * app displays. Matching is deliberately generous: explicit trade words
 * first, then any volume it can parse (with a tolerance band that
 * absorbs "70cl"-style slips), then a fuzzy pass for typos. Anything
 * still unrecognised is returned untouched rather than guessed at —
 * losing the user's original value would be worse than an odd label.
 */

export const BOTTLE_FORMATS = ['Half Bottle', 'Bottle', 'Magnum', 'Double Magnum'] as const

export type BottleFormat = (typeof BOTTLE_FORMATS)[number]

/** Nominal volume in millilitres, and the band that maps onto it. */
const VOLUME_BANDS: Array<{ format: BottleFormat; min: number; max: number }> = [
  { format: 'Half Bottle', min: 300, max: 430 },
  { format: 'Bottle', min: 640, max: 860 },
  { format: 'Magnum', min: 1300, max: 1700 },
  { format: 'Double Magnum', min: 2700, max: 3300 },
]

/**
 * Trade words, most specific first — "Double Magnum" must beat "Magnum",
 * and "Half Bottle" must beat "Bottle". `magn` rather than `magnum`
 * catches plurals and common misspellings.
 */
const WORD_RULES: Array<{ pattern: RegExp; format: BottleFormat }> = [
  { pattern: /double\s*magn|doppio\s*magn/, format: 'Double Magnum' },
  // Jeroboam is 3L for still wine (Bordeaux); Champagne uses it for 4.5L
  { pattern: /jero?boam/, format: 'Double Magnum' },
  { pattern: /magn/, format: 'Magnum' },
  { pattern: /half|demi/, format: 'Half Bottle' },
  { pattern: /bottle|btl/, format: 'Bottle' },
]

/** Spellings we fuzzy-match against, mapped to their canonical name. */
const FUZZY_TARGETS: Array<{ word: string; format: BottleFormat }> = [
  { word: 'halfbottle', format: 'Half Bottle' },
  { word: 'half', format: 'Half Bottle' },
  { word: 'bottle', format: 'Bottle' },
  { word: 'magnum', format: 'Magnum' },
  { word: 'doublemagnum', format: 'Double Magnum' },
]

/**
 * Optimal string alignment distance — Levenshtein plus transpositions,
 * so "bottel" is one mistake away from "bottle" rather than two.
 * Inputs are a few characters long, so the full matrix is fine.
 */
function editDistance(a: string, b: string): number {
  const rows = a.length + 1
  const cols = b.length + 1
  const d: number[][] = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)

      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }

  return d[rows - 1][cols - 1]
}

/** Parse any volume mentioned in the text, in millilitres. */
function parseVolumeMl(text: string): number | undefined {
  // European decimal commas ("0,75l") become dots before parsing
  const cleaned = text.replace(/(\d),(\d)/g, '$1.$2')

  const withUnit = cleaned.match(/(\d+(?:\.\d+)?)\s*(ml|cl|cls|l|lt|ltr|litre|liter)\b/)
  if (withUnit) {
    const amount = parseFloat(withUnit[1])
    const unit = withUnit[2]
    if (unit === 'ml') return amount
    if (unit.startsWith('cl')) return amount * 10
    return amount * 1000
  }

  // Bare number: infer the unit from magnitude — "1.5" is litres,
  // "75" centilitres, "750" millilitres.
  const bare = cleaned.match(/^(\d+(?:\.\d+)?)$/)
  if (bare) {
    const amount = parseFloat(bare[1])
    if (amount <= 5) return amount * 1000
    if (amount < 300) return amount * 10
    return amount
  }

  return undefined
}

/**
 * Convert any reasonable size description to a trade name. Blank and
 * placeholder values become undefined; unrecognised values are returned
 * trimmed but otherwise unchanged.
 */
export function normalizeFormat(raw?: string): string | undefined {
  const trimmed = (raw ?? '').trim()
  if (!trimmed || trimmed === '-') return undefined

  const lower = trimmed.toLowerCase()

  for (const rule of WORD_RULES) {
    if (rule.pattern.test(lower)) return rule.format
  }

  const ml = parseVolumeMl(lower)
  if (ml !== undefined) {
    const band = VOLUME_BANDS.find(b => ml >= b.min && ml <= b.max)
    if (band) return band.format
  }

  // Last resort: a typo close enough to one of the trade names
  const letters = lower.replace(/[^a-z]/g, '')
  if (letters.length >= 4) {
    for (const target of FUZZY_TARGETS) {
      const tolerance = target.word.length <= 6 ? 1 : 2
      if (editDistance(letters, target.word) <= tolerance) return target.format
    }
  }

  return trimmed
}

/**
 * Bottles per delivery case. Standard, half and magnum cases all work
 * out at roughly 4.5 litres; 3L bottles are handled singly.
 */
export function bottlesPerCase(format?: string): number {
  switch (normalizeFormat(format)) {
    case 'Half Bottle':
      return 12
    case 'Magnum':
      return 3
    case 'Double Magnum':
      return 1
    default:
      return 6
  }
}

/** Large formats are rationed to one per year by the schedulers. */
export function isMagnumOrLarger(format?: string): boolean {
  const normalized = normalizeFormat(format)
  return normalized === 'Magnum' || normalized === 'Double Magnum'
}
