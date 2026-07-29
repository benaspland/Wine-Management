/**
 * Splitting a wine's full name into producer, wine and classification.
 *
 * The naive approach — scan for a boundary word and guess where the
 * producer ends — fails differently in every region: it tears
 * "Brunello di Montalcino" in half at the second "di", it makes the
 * producer of a Burgundy the entire string, and it decides a German
 * Riesling is called "GG".
 *
 * So this works the other way round. Anything we can positively
 * identify — a classification, an appellation, a known producer, a
 * quoted cuvée — is recognised and removed; whatever is left at the
 * front is the producer. Region drives which appellations are worth
 * looking for, because appellations are region-scoped by definition.
 *
 * Where nothing is recognised the old heuristic still runs, but the
 * result is flagged low-confidence so the import can report it rather
 * than let a bad split surface silently weeks later.
 */

export interface ParsedWineName {
  producer: string
  /** The wine itself; empty where the estate name is the wine, as in Bordeaux. */
  name: string
  /** Only set when inferred from the name; the CSV column wins over this. */
  classification?: string
  /** Explicit colour marker, e.g. "(Rouge)" on a white-village red. */
  colour?: 'Red' | 'White' | 'Rosé'
  /** False when nothing was recognised and the fallback guessed. */
  confident: boolean
}

// ============================================================================
// KNOWLEDGE BASE
// ============================================================================

/**
 * Appellations and denominations by region, in the form they appear on
 * a label. Order matters only in that the matcher prefers the longest
 * match, so "Brunello di Montalcino" wins over a bare "Montalcino".
 */
const APPELLATIONS: Record<string, string[]> = {
  Tuscany: [
    'Brunello di Montalcino',
    'Rosso di Montalcino',
    'Vino Nobile di Montepulciano',
    'Rosso di Montepulciano',
    'Chianti Classico',
    'Chianti Rufina',
    'Chianti',
    'Maremma Toscana',
    'Bolgheri Sassicaia',
    'Bolgheri',
    'Carmignano',
    'Vernaccia di San Gimignano',
    'Toscana',
  ],
  Piedmont: [
    'Barolo Riserva',
    'Barbaresco Riserva',
    'Barolo',
    'Barbaresco',
    "Barbera d'Alba",
    "Barbera d'Asti",
    "Dolcetto d'Alba",
    'Langhe Nebbiolo',
    'Nebbiolo d’Alba',
    'Roero Arneis',
    'Roero',
    'Gattinara',
    'Gavi',
    'Moscato d’Asti',
  ],
  Burgundy: [
    // Villages and grand crus. Longer names first is handled by the
    // matcher, but grouping them keeps this readable.
    'Gevrey-Chambertin',
    'Chambolle-Musigny',
    'Morey-St-Denis',
    'Morey-Saint-Denis',
    'Vosne-Romanee',
    'Vosne-Romanée',
    'Nuits-St-Georges',
    'Nuits-Saint-Georges',
    'Puligny-Montrachet',
    'Chassagne-Montrachet',
    'Aloxe-Corton',
    'Savigny-les-Beaune',
    'Marsannay',
    'Fixin',
    'Meursault',
    'Pommard',
    'Volnay',
    'Beaune',
    'Santenay',
    'Chassagne',
    'Puligny',
    'Chablis',
    'Corton-Charlemagne',
    'Corton',
    'Montrachet',
    'Chambertin',
    'Musigny',
    'Clos de Vougeot',
    'Echezeaux',
    'Bourgogne Blanc',
    'Bourgogne Rouge',
    'Bourgogne',
    'Macon',
    'Mâcon',
    'Pouilly-Fuisse',
    'Saint-Aubin',
    // Abbreviation used on some merchant lists for Morey-St-Denis
    'MSD',
  ],
  Rioja: ['Rioja'],
  'Ribera del Duero': ['Ribera del Duero'],
  Priorat: ['Priorat'],
  'Basque Country': ['Txakolina', 'Txakoli'],
  Valdeorras: ['Valdeorras'],
  Rhone: ['Cote-Rotie', 'Côte-Rôtie', 'Hermitage', 'Cornas', 'Saint-Joseph', 'Chateauneuf-du-Pape'],
  Champagne: ['Champagne'],
}

/**
 * Producers that cannot be inferred structurally. German labels read
 * producer + vineyard + grape + ripeness with no appellation, and
 * "Kupp" looks exactly like a producer to any algorithm; several
 * Spanish estates have the same problem. Listing the handful we own is
 * duller than a clever rule and right every time. The CSV's Producer
 * column extends this per import.
 */
const KNOWN_PRODUCERS = [
  // Germany
  'Peter Lauer',
  'Willi Schaefer',
  'Willi Schäfer',
  'Vollenweider',
  'Kunstler',
  'Künstler',
  'Schloss Johannisberg',
  'Schaefer-Frohlich',
  'Schäfer-Fröhlich',
  'Wagner-Stempel',
  'Egon Muller',
  'Egon Müller',
  'Dr. Loosen',
  'JJ Prum',
  'Joh. Jos. Prum',
  'Keller',
  // Spain
  'R. Lopez de Heredia',
  'R. López de Heredia',
  'Lopez de Heredia',
  'Oxer Bastegieta',
  'Vega Sicilia',
  '4 Monos',
  'Virgen del Galir',
  'Artadi',
  'La Rioja Alta',
  'Muga',
]

/**
 * Classification and quality tokens that belong in the classification
 * field rather than the wine's name. German ripeness levels (Kabinett,
 * Spätlese) are deliberately absent: they distinguish one wine from
 * another off the same vineyard, so they stay in the name.
 */
const CLASSIFICATION_TOKENS = [
  '1er Grand Cru Classe',
  'Grand Cru Classe de Graves',
  'Grand Cru Classe',
  'Premier Grand Cru',
  'Cru Bourgeois Exceptionnel',
  'Cru Bourgeois Superieur',
  'Cru Bourgeois',
  'Grand Cru',
  'Premier Cru',
  '1er Cru',
  '1ere Cru',
  'Gran Reserva',
  'Reserva',
  'Crianza',
  'Riserva',
  'DOCG',
  'DOCa',
  'DOC',
  'IGT',
  'AOC',
  'GG',
  'VDP',
]

/** Estate prefixes that mean the whole string names the producer. */
const ESTATE_PREFIX = /^(Chateau|Château|Ch\.|Clos|Domaine de|Castello di)\s+/i

/**
 * True when the estate itself is the wine, as for a Bordeaux château or
 * Clos Mogador. Such wines carry no cuvée: the second line, if used at
 * all, holds the appellation. Shared with the wine form so the label it
 * shows and the split the importer produces agree.
 */
export function isEstateWine(producer?: string, region?: string): boolean {
  if (ESTATE_PREFIX.test((producer ?? '').trim())) return true
  return (region ?? '').trim().toLowerCase() === 'bordeaux'
}

const COLOUR_MARKERS: Array<{ pattern: RegExp; colour: 'Red' | 'White' | 'Rosé' }> = [
  { pattern: /\((?:rouge|red)\)/i, colour: 'Red' },
  { pattern: /\((?:blanc|white)\)/i, colour: 'White' },
  { pattern: /\((?:rose|rosé|rosato)\)/i, colour: 'Rosé' },
]

// ============================================================================
// PARSER
// ============================================================================

const tidy = (value: string) => value.replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim()

/** Escape a dictionary entry for use inside a RegExp. */
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Find the earliest, longest appellation from a region's list. Longest
 * first prevents "Montrachet" matching inside "Chassagne-Montrachet"
 * and "Barolo" swallowing "Barolo Riserva".
 */
function findAppellation(text: string, region?: string): { term: string; index: number } | null {
  const terms = region ? APPELLATIONS[region] : undefined
  if (!terms) return null

  const sorted = [...terms].sort((a, b) => b.length - a.length)
  let best: { term: string; index: number } | null = null

  for (const term of sorted) {
    const match = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i').exec(text)
    if (!match) continue
    // Prefer the earliest appellation; among equals the longest wins,
    // which the sort already guarantees
    if (!best || match.index < best.index) {
      best = { term: text.slice(match.index, match.index + term.length), index: match.index }
    }
  }

  return best
}

function findKnownProducer(text: string, extra: string[] = []): string | null {
  const candidates = [...KNOWN_PRODUCERS, ...extra].sort((a, b) => b.length - a.length)
  for (const producer of candidates) {
    if (new RegExp(`^${escapeRegExp(producer)}\\b`, 'i').test(text)) {
      return text.slice(0, producer.length)
    }
  }
  return null
}

/** Pull classification words out, returning the remainder and what was found. */
function extractClassification(text: string): { rest: string; classification?: string } {
  const found: string[] = []
  let rest = text

  for (const token of CLASSIFICATION_TOKENS) {
    const pattern = new RegExp(`\\b${escapeRegExp(token)}\\b`, 'i')
    const match = pattern.exec(rest)
    if (match) {
      found.push(match[0])
      rest = rest.replace(pattern, ' ')
    }
  }

  return { rest: tidy(rest), classification: found.length ? found.join(' ') : undefined }
}

function extractColour(text: string): { rest: string; colour?: 'Red' | 'White' | 'Rosé' } {
  for (const { pattern, colour } of COLOUR_MARKERS) {
    if (pattern.test(text)) {
      return { rest: tidy(text.replace(pattern, ' ')), colour }
    }
  }
  return { rest: text }
}

/**
 * The original positional heuristic, kept as the last resort for names
 * no dictionary recognises. Anything reaching here is flagged.
 */
function guessSplit(text: string): { producer: string; name: string } {
  const parts = text.split(' ')
  if (parts.length <= 1) return { producer: text, name: '' }

  // "Producer Cuvée" is the commonest unrecognised shape; two-word
  // producers are more common than two-word cuvées in this collection
  const producerWords = parts.length >= 4 ? 2 : 1
  return {
    producer: parts.slice(0, producerWords).join(' '),
    name: parts.slice(producerWords).join(' '),
  }
}

/**
 * Parse a full wine name into its parts.
 *
 * @param raw    The label text, e.g. "Domaine Latour-Giraud Meursault 1er Cru 'Boucheres'"
 * @param region The CSV region, which selects the appellation dictionary
 * @param extraProducers Producers learned from the CSV's Producer column
 */
export function parseWineName(
  raw: string,
  region?: string,
  extraProducers: string[] = []
): ParsedWineName {
  const trimmed = tidy(raw ?? '')
  if (!trimmed) return { producer: '', name: '', confident: false }

  const withoutColour = extractColour(trimmed)
  const colour = withoutColour.colour

  // --- Structured form used for Piedmont: "Barolo: Massolino, Margheria"
  const structured = withoutColour.rest.match(/^([^:]+):\s*([^,]+),\s*(.+)$/)
  if (structured) {
    const denomination = tidy(structured[1])
    const producer = tidy(structured[2])
    const cru = extractClassification(tidy(structured[3]))
    // Some communes share their name with the denomination ("Barolo:
    // Michele Chiarlo, Barolo"); saying it twice reads like a bug
    const isEcho = cru.rest.toLowerCase() === denomination.toLowerCase()
    return {
      producer,
      name: isEcho ? denomination : tidy(`${denomination} ${cru.rest}`),
      classification: cru.classification,
      colour,
      confident: true,
    }
  }

  const stripped = extractClassification(withoutColour.rest)
  const text = stripped.rest

  // --- Estates whose name is the wine: "Château Meyney", "Clos Mogador"
  if (ESTATE_PREFIX.test(text) && !findAppellation(text, region)) {
    return {
      producer: text,
      name: '',
      classification: stripped.classification,
      colour,
      confident: true,
    }
  }

  // --- A quoted cuvée always belongs to the wine, never the producer
  const quoted = text.match(/['‘’"]([^'‘’"]+)['‘’"]/)

  // --- Known producer prefix (Germany, Spain, anything hand-listed)
  const known = findKnownProducer(text, extraProducers)
  if (known) {
    return {
      producer: known,
      name: tidy(text.slice(known.length)),
      classification: stripped.classification,
      colour,
      confident: true,
    }
  }

  // --- Region appellation: everything before it is the producer
  const appellation = findAppellation(text, region)
  if (appellation) {
    let producerPart = tidy(text.slice(0, appellation.index))
    let namePart = tidy(text.slice(appellation.index))

    // A cuvée quoted ahead of the appellation belongs with the wine:
    // "Fattoria Le Pupille 'Saffredi' Maremma Toscana"
    if (quoted && text.indexOf(quoted[0]) < appellation.index) {
      const quoteStart = text.indexOf(quoted[0])
      producerPart = tidy(text.slice(0, quoteStart))
      namePart = tidy(text.slice(quoteStart))
    }

    if (producerPart) {
      return {
        producer: producerPart,
        name: namePart,
        classification: stripped.classification,
        colour,
        confident: true,
      }
    }

    // Appellation-led with no producer in front is a structured form we
    // did not recognise; fall through rather than invent a producer
  }

  const guess = guessSplit(text)
  return {
    producer: guess.producer,
    name: guess.name,
    classification: stripped.classification,
    colour,
    confident: false,
  }
}

/** Exposed for tests and for documenting which regions have rules. */
export const REGIONS_WITH_RULES = Object.keys(APPELLATIONS)
