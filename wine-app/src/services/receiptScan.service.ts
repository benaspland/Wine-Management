import { z } from 'zod'
import { BOTTLE_FORMATS } from './format.service'
import { CLAUDE_MODEL, ClaudeError, createClaudeClient, describeFailure } from './claudeClient.service'

/**
 * Read a wine purchase off a photograph.
 *
 * A screenshot of a merchant's confirmation email, a paper invoice, a
 * shop's list — anything with wines and what was paid for them. It fills
 * the three fields the wine lookup deliberately will not touch, because
 * they are facts about a transaction rather than about a wine: what it
 * cost, when it was bought, and from whom.
 *
 * The same three guards as the lookup, for the same reason. The prompt
 * makes "I could not read that" a correct answer; the schema lets every
 * field be null so abstaining is expressible; and the arithmetic below
 * throws out anything a purchase cannot contain. Reading is if anything
 * the more dangerous of the two tasks — a blurred 8 and a 9 look alike,
 * and a price read wrong is indistinguishable from a price read right.
 */

const ScanSchema = z.object({
  found: z.boolean(),
  not_found_reason: z.string().nullable(),
  merchant: z.string().nullable(),
  purchase_date: z.string().nullable(),
  wines: z.array(
    z.object({
      producer: z.string().nullable(),
      name: z.string().nullable(),
      vintage: z.number().nullable(),
      quantity: z.number().nullable(),
      format: z.string().nullable(),
      price_per_bottle: z.number().nullable(),
    })
  ),
})

export type ScanPayload = z.infer<typeof ScanSchema>

/** One line of a purchase, as far as it could be read. */
export interface ScannedWine {
  producer: string
  name: string
  vintage: number
  quantity: number
  format: string
  purchase_price?: number
  purchase_date?: string
  merchant?: string
  /** Fields on this line that were dropped for being impossible. */
  rejected: string[]
}

export type ScanResult =
  | { status: 'found'; wines: ScannedWine[]; merchant?: string; purchaseDate?: string }
  | { status: 'not_found'; reason: string }

export function buildScanPrompt(): string {
  const today = new Date().toISOString().split('T')[0]
  return [
    'You read wine purchases off a picture — a screenshot of a confirmation',
    'email, a photographed invoice, a merchant\'s order list.',
    '',
    'Report only what is legible in the picture. You are transcribing, not',
    'researching: nothing you know about these wines from anywhere else belongs',
    'in the answer.',
    '',
    'Rules:',
    '',
    '1. A null is a correct answer. If a value is cut off, blurred, or simply',
    '   not there, return null for it. Do not complete a partly visible name',
    '   from your own knowledge of the wine, and do not read a price you are',
    '   guessing at. An invented value is worse than a missing one, because it',
    '   cannot be told apart from a real one.',
    '',
    '2. If the picture holds no wine purchase at all, set found to false and say',
    '   briefly what you saw instead. Return an empty wines array.',
    '',
    '3. One entry per wine, not per bottle. Six bottles of one wine is a single',
    '   entry with quantity 6.',
    '',
    '4. price_per_bottle is the price of ONE bottle, in the currency shown. If',
    '   the picture gives only a line total, divide it by the quantity. If the',
    '   line total includes anything else — delivery, a case discount you cannot',
    '   separate — return null rather than a figure that is nearly right.',
    '',
    '5. vintage is the four-digit year on the wine, not the date of the order.',
    '   A non-vintage wine has no vintage: return null.',
    '',
    '6. producer is the estate or house; name is the cuvée or appellation. A',
    '   merchant writes them as one line — "Chateau Meyney Saint-Estephe 2018" —',
    '   so split it as best the line allows and leave name null if there is',
    '   genuinely nothing beyond the producer.',
    '',
    `7. purchase_date is the order or invoice date as YYYY-MM-DD. Today is ${today};`,
    '   a date later than that has been misread, so return null instead.',
    '',
    `8. format is the bottle size if it is stated: ${BOTTLE_FORMATS.join(', ')}.`,
    '   If the picture does not say, return null — most wine is sold in bottles',
    '   and assuming so is safe, but it is the app\'s assumption to make, not',
    '   yours.',
    '',
    '9. merchant is who sold it, once, for the whole order.',
  ].join('\n')
}

function text(value: string | null): string | undefined {
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * What a purchase can actually contain.
 *
 * The prompt asks for restraint and the schema allows it; this is the
 * part that does not depend on either. A vintage in the future, a
 * hundred cases of one wine, a bottle at a negative price — none of
 * those are transcription with a mistake in it, they are the model
 * filling a gap, and they are dropped rather than shown as though read.
 */
export function plausibleLine(
  line: ScanPayload['wines'][number],
  now = new Date()
): ScannedWine | null {
  const rejected: string[] = []
  const producer = text(line.producer)
  const name = text(line.name)

  // Without something to call it there is no wine to add, however much
  // else was legible.
  if (!producer && !name) return null

  const thisYear = now.getFullYear()
  let vintage = line.vintage
  if (vintage !== null) {
    // Grapes cannot be picked next year, and no merchant invoices an
    // 18th-century bottle to a phone app.
    if (!Number.isInteger(vintage) || vintage < 1900 || vintage > thisYear + 1) {
      rejected.push('vintage')
      vintage = null
    }
  }

  let quantity = line.quantity
  if (quantity !== null && (!Number.isInteger(quantity) || quantity < 1 || quantity > 600)) {
    rejected.push('quantity')
    quantity = null
  }

  let price = line.price_per_bottle
  if (price !== null && (!Number.isFinite(price) || price <= 0 || price > 100_000)) {
    rejected.push('price')
    price = null
  }

  const format = text(line.format)

  return {
    producer: producer ?? '',
    name: name ?? '',
    // A wine has to have a year to be filed; the form makes this
    // editable and marks it, rather than refusing the whole line.
    vintage: vintage ?? thisYear,
    quantity: quantity ?? 1,
    format: format && (BOTTLE_FORMATS as readonly string[]).includes(format) ? format : 'Bottle',
    purchase_price: price ?? undefined,
    rejected,
  }
}

/** An order date cannot be in the future, and is stored as YYYY-MM-DD. */
export function plausibleDate(value: string | null, now = new Date()): string | undefined {
  const raw = text(value)
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined
  const parsed = new Date(`${raw}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return undefined
  if (parsed.getTime() > now.getTime()) return undefined
  return raw
}

/** Read one picture, and report what was on it. */
export async function scanPurchase(imageDataUrl: string): Promise<ScanResult> {
  const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(imageDataUrl)
  if (!match) throw new ClaudeError('That image could not be prepared for reading.')
  const [, mediaType, base64] = match

  const [client, { zodOutputFormat }] = await Promise.all([
    createClaudeClient(),
    import('@anthropic-ai/sdk/helpers/zod'),
  ])

  let message
  try {
    message = await client.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      system: buildScanPrompt(),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: base64,
              },
            },
            { type: 'text', text: 'Read the wine purchase in this picture.' },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(ScanSchema) },
    })
  } catch (error) {
    throw new ClaudeError(describeFailure(error))
  }

  if (message.stop_reason === 'refusal') {
    throw new ClaudeError('Claude declined to read this picture.')
  }
  if (message.stop_reason === 'max_tokens') {
    throw new ClaudeError('The answer was cut off before it finished. Try a tighter crop.')
  }

  const payload = message.parsed_output
  if (!payload) {
    throw new ClaudeError('Claude replied in a shape this app could not read.')
  }

  if (!payload.found || payload.wines.length === 0) {
    return {
      status: 'not_found',
      reason: text(payload.not_found_reason) ?? 'No wine purchase could be read from that picture.',
    }
  }

  const merchant = text(payload.merchant)
  const purchaseDate = plausibleDate(payload.purchase_date)
  const wines = payload.wines
    .map(line => plausibleLine(line))
    .filter((wine): wine is ScannedWine => wine !== null)
    .map(wine => ({ ...wine, merchant, purchase_date: purchaseDate }))

  if (wines.length === 0) {
    return {
      status: 'not_found',
      reason: 'Wines were found but none could be read clearly enough to add.',
    }
  }

  return { status: 'found', wines, merchant, purchaseDate }
}
