import type { WineType } from '../types/index'

/**
 * What colour a wine is.
 *
 * This used to be thirteen grape names with everything else falling
 * through to Red, which was survivable while the value only fed a
 * filter — but it now tints the thumbnail on every row, so a Muscadet
 * shown as a red bottle is a visible lie. Melon de Bourgogne,
 * Hondarrabi Zuri, Godello, Furmint, Assyrtiko and the rest of this
 * collection's whites were all "Red".
 *
 * Style beats grape, then grape beats name. A Champagne is Chardonnay
 * and Pinot Noir, so reading the grape first calls it White; sparkling,
 * fortified and rosé are what a wine was *made into* and override the
 * fruit it was made from. Only once no style is named does the grape
 * decide, and only if that is silent does the name — an appellation
 * frequently states the colour when the blend does not ("Muscadet" and
 * "Chablis" are white however they are made up).
 *
 * The caller can override the lot with an explicit column.
 */

/** Made-into: these override whatever grape is in the bottle. */
const STYLE_RULES: Array<{ type: WineType; terms: string[] }> = [
  {
    type: 'Fortified',
    terms: [
      'port', 'porto', 'sherry', 'jerez', 'madeira', 'marsala', 'vin doux',
      'banyuls', 'maury', 'rutherglen', 'tawny', 'oloroso', 'amontillado',
      'fino', 'manzanilla', 'pedro ximenez', 'pedro ximénez', 'px',
    ],
  },
  {
    type: 'Sparkling',
    terms: [
      'champagne', 'prosecco', 'cava', 'cremant', 'crémant', 'franciacorta',
      'sekt', 'lambrusco', 'espumante', 'spumante', 'metodo classico',
      'blanc de blancs', 'blanc de noirs', 'petillant', 'pétillant',
      'pet nat', 'pét nat', 'sparkling', 'brut', 'extra brut',
    ],
  },
  {
    type: 'Rosé',
    terms: ['rosé', 'rosato', 'rosado', 'clairet', 'oeil de perdrix'],
  },
]

/** Made-from: consulted only when no style is named. */
const COLOUR_RULES: Array<{ type: WineType; terms: string[] }> = [
  {
    type: 'White',
    terms: [
      // Grapes
      'chardonnay', 'sauvignon blanc', 'riesling', 'pinot gris', 'pinot grigio',
      'pinot blanc', 'gruner', 'grüner', 'veltliner', 'albarino', 'albariño',
      'chenin', 'semillon', 'sémillon', 'viognier', 'marsanne', 'roussanne',
      'gewurztraminer', 'gewürztraminer', 'muscadet', 'melon de bourgogne',
      'godello', 'verdejo', 'verdicchio', 'vermentino', 'garganega', 'cortese',
      'fiano', 'greco', 'falanghina', 'arneis', 'trebbiano', 'furmint',
      'assyrtiko', 'hondarrabi zuri', 'txakolina', 'txakoli', 'silvaner',
      'sylvaner', 'scheurebe', 'muscat', 'moscato', 'torrontes', 'torrontés',
      'viura', 'macabeo', 'xarel', 'parellada', 'palomino', 'colombard',
      'picpoul', 'clairette', 'bourboulenc', 'ugni blanc', 'grillo',
      'catarratto', 'malvasia', 'rkatsiteli', 'welschriesling',
      // Appellations and styles that are white whatever the blend
      'chablis', 'sancerre', 'pouilly-fume', 'pouilly-fumé', 'pouilly-fuisse',
      'pouilly-fuissé', 'meursault', 'montrachet', 'corton-charlemagne',
      'condrieu', 'vouvray', 'savennieres', 'savennières', 'soave', 'gavi',
      'orvieto', 'rueda', 'sauternes', 'barsac', 'tokaji', 'blanc',
      'bianco', 'weiss', 'branco',
    ],
  },
  {
    type: 'Red',
    terms: [
      'cabernet', 'merlot', 'pinot noir', 'syrah', 'shiraz', 'tempranillo',
      'nebbiolo', 'sangiovese', 'grenache', 'garnacha', 'malbec', 'carmenere',
      'carménère', 'mourvedre', 'mourvèdre', 'monastrell', 'petit verdot',
      'zinfandel', 'primitivo', 'barbera', 'dolcetto', 'aglianico', 'nerello',
      "nero d'avola", 'montepulciano', 'corvina', 'touriga', 'cinsault',
      'gamay', 'blaufrankisch', 'blaufränkisch', 'zweigelt', 'spatburgunder',
      'spätburgunder', 'pinotage', 'tannat', 'mencia', 'mencía', 'bobal',
      'graciano', 'mazuelo', 'carignan', 'rouge', 'rosso', 'tinto', 'noir',
    ],
  },
]

/** Word-ish boundary: "port" must not match "portugieser" or "oporto". */
function mentions(haystack: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, 'i').test(haystack)
}

/**
 * Detects from the grape first, then the wine's name. Returns undefined
 * when neither says anything, so the caller decides what "unknown"
 * means rather than being handed a confident guess.
 */
export function detectWineType(varietal?: string, wineName?: string): WineType | undefined {
  const sources = [varietal, wineName].map(source => (source ?? '').toLowerCase()).filter(Boolean)

  // A style named anywhere wins outright
  for (const text of sources) {
    for (const { type, terms } of STYLE_RULES) {
      if (terms.some(term => mentions(text, term))) return type
    }
  }

  // Then the grape, then the name
  for (const text of sources) {
    for (const { type, terms } of COLOUR_RULES) {
      if (terms.some(term => mentions(text, term))) return type
    }
  }

  return undefined
}

const TYPES: WineType[] = ['Red', 'White', 'Rosé', 'Sparkling', 'Fortified']

/** Matches a CSV cell to a wine type, tolerating case and accents. */
export function normalizeWineType(value?: string): WineType | undefined {
  const raw = (value ?? '').trim().toLowerCase()
  if (!raw) return undefined
  const found = TYPES.find(type => type.toLowerCase() === raw)
  if (found) return found
  if (raw === 'rose' || raw === 'rosado' || raw === 'rosato') return 'Rosé'
  if (raw === 'white' || raw === 'blanc' || raw === 'bianco') return 'White'
  if (raw === 'red' || raw === 'rouge' || raw === 'rosso' || raw === 'tinto') return 'Red'
  return undefined
}
