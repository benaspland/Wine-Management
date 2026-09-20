import { z } from 'zod'
import type { Wine, WineType } from '../types/index'
import { webSearchEnabled } from './aiSettings.service'
import {
  CLAUDE_MODEL,
  ClaudeError,
  createClaudeClient,
  describeFailure,
} from './claudeClient.service'

/**
 * Look a wine up with Claude and fill in what is known about it.
 *
 * The producer, the wine name and the vintage are the question; the
 * origin, drinking-and-service and tasting fields are the answer. What
 * is in the cellar and what it cost are the user's own facts and are
 * never touched.
 *
 * The design problem here is not getting an answer — a model will always
 * produce one — it is getting an honest one. Three things guard against
 * invention, and they are deliberately independent:
 *
 *   1. The prompt, which says what to do when the wine is unknown and
 *      makes "I don't know" the correct answer rather than a failure.
 *   2. The schema, in which every field is nullable and the model must
 *      state outright whether it identified the wine, so declining a
 *      single field is a normal thing to express rather than something
 *      it has to talk its way around.
 *   3. Arithmetic, below, which checks what came back against what a
 *      wine can actually be. A prompt can be ignored; 40% alcohol or a
 *      window closing before it opens cannot survive a range check.
 *
 * The third exists because the first two are advisory. Only the third is
 * enforcement.
 */

const WINE_TYPES = ['Red', 'White', 'Rosé', 'Sparkling', 'Fortified'] as const

/**
 * Every field nullable, on purpose.
 *
 * A schema that demands a number for alcohol content forces a number to
 * be produced whether or not one is known — the model cannot comply and
 * abstain at the same time. Nullable everywhere means abstaining is
 * always available, which is what makes the instruction to abstain
 * something it can actually follow.
 *
 * No `min`/`max` here either: the API strips numeric constraints from
 * the schema, so they would be a guarantee that isn't one. The range
 * checks live in `plausible()` where they are real and testable.
 */
const LookupSchema = z.object({
  found: z.boolean(),
  not_found_reason: z.string().nullable(),
  country: z.string().nullable(),
  region: z.string().nullable(),
  classification: z.string().nullable(),
  wine_type: z.enum(WINE_TYPES).nullable(),
  varietal: z.string().nullable(),
  alcohol_percent: z.number().nullable(),
  drinking_window_start: z.number().nullable(),
  drinking_window_end: z.number().nullable(),
  serving_temp_min: z.number().nullable(),
  serving_temp_max: z.number().nullable(),
  critic_ratings: z.string().nullable(),
  flavor_profile: z.string().nullable(),
  notes: z.string().nullable(),
  sources: z.array(z.string()),
})

export type LookupPayload = z.infer<typeof LookupSchema>

/** The form fields a lookup may fill. Nothing about stock or price. */
export interface LookupFields {
  country: string
  region: string
  classification: string
  wine_type: WineType
  varietal: string
  alcohol_percent: string
  drinking_window_start: string
  drinking_window_end: string
  serving_temp_min: string
  serving_temp_max: string
  critic_ratings: string
  flavor_profile: string
  notes: string
}

export type WineLookupResult =
  | {
      status: 'found'
      fields: Partial<LookupFields>
      sources: string[]
      /** Fields the model returned that failed a sanity check. */
      rejected: string[]
    }
  | { status: 'not_found'; reason: string }

export interface LookupQuestion {
  producer: string
  name: string
  vintage: number
}

export const LOOKUP_MODEL = CLAUDE_MODEL

/**
 * The instruction.
 *
 * Written around one idea: a null is a correct answer. Models invent
 * because a blank feels like a failure to be helpful, so the prompt
 * removes that pressure explicitly rather than only forbidding the
 * invention. It also names the specific ways a wine lookup goes wrong —
 * answering about the wrong vintage, about the producer's better-known
 * cuvée, or about what wines of that region are typically like — because
 * each of those is a way to be confidently wrong while feeling accurate.
 */
export function buildSystemPrompt(): string {
  return [
    'You fill in reference details for a single bottle in a private wine cellar.',
    '',
    'The user gives you a producer, a wine name and a vintage. Your job is to',
    'report what is actually known about that exact bottling in that exact year.',
    '',
    'Rules, in order of importance:',
    '',
    '1. A null is a correct answer. For any field you do not know for this exact',
    '   wine and vintage, return null. Returning null for every field except the',
    '   ones you are sure of is a good answer, not a failed one. An invented',
    '   value is worse than no value, because the user cannot tell it apart from',
    '   a real one.',
    '',
    '2. Never substitute a neighbouring fact. Do not answer about a different',
    '   vintage of the same wine, a different cuvée from the same producer, or a',
    '   different producer with a similar name. If you can only find the 2019 and',
    '   the user asked about the 2020, that is not an answer — set found to false.',
    '',
    '3. Do not generalise from the region or the grape. "Most Barolo is 14%" is',
    '   not knowledge of this wine. Typical values for a style are exactly the',
    '   kind of plausible invention this task must avoid. If the only basis for a',
    '   number is what wines like it usually are, return null.',
    '',
    '4. If you cannot identify the wine at all, set found to false and put a short',
    '   plain explanation in not_found_reason — say what you searched for and what',
    '   was missing. Leave every other field null.',
    '',
    '5. critic_ratings holds published scores you can actually attribute, written',
    '   as "JS 97 : RP 96" — critic abbreviation, score, separated by " : ".',
    '   Never estimate a score. If you cannot attribute it to a named critic for',
    '   this vintage, return null.',
    '',
    '6. drinking_window_start and drinking_window_end are four-digit years, from',
    '   producer or critic drinking guidance for this vintage. If no such guidance',
    '   exists, return null rather than estimating from the vintage.',
    '',
    '7. serving_temp_min and serving_temp_max are degrees Celsius.',
    '   alcohol_percent is the stated ABV on the label for this vintage.',
    '',
    '8. classification is the wine\'s own appellation rank or quality tier as it',
    '   appears on the label — "1er Cru", "DOCG", "VDP Grosse Lage", "Gran',
    '   Reserva". Not the region, not a score, not a description. If the wine',
    '   carries no such designation, return null rather than inventing a tier.',
    '',
    '9. varietal is the grape or blend, separated by " : " — for example',
    '   "Cabernet Sauvignon : Merlot". flavor_profile is a handful of tasting',
    '   descriptors in the same form — "Blackberry : Cassis : Graphite".',
    '',
    '10. notes is two or three sentences on the wine — what it is, what marks it',
    '    out. Keep it factual.',
    '',
    '11. sources lists the URLs you actually consulted. If you did not consult',
    '    any, return an empty array; do not invent citations.',
  ].join('\n')
}

export function buildUserPrompt({ producer, name, vintage }: LookupQuestion): string {
  return [
    `Producer: ${producer}`,
    `Wine: ${name}`,
    `Vintage: ${vintage}`,
    '',
    'Report what is known about this exact wine and vintage.',
  ].join('\n')
}

/** Blank strings are "unknown" too, not an answer of "". */
function text(value: string | null): string | undefined {
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * What a wine can actually be.
 *
 * These are not style preferences, they are the limits of the physical
 * object: no wine is 40% alcohol, none is served at 60°C, and no
 * drinking window closes before it opens. A value outside them is not a
 * value with a mistake in it — it is evidence the model was generating
 * rather than reporting, so it is dropped and named rather than shown to
 * the user as though it had been looked up.
 */
export function plausible(
  payload: LookupPayload,
  vintage: number
): { fields: Partial<LookupFields>; rejected: string[] } {
  const fields: Partial<LookupFields> = {}
  const rejected: string[] = []

  const country = text(payload.country)
  if (country) fields.country = country
  const region = text(payload.region)
  if (region) fields.region = region

  // A classification is a rank off a label, not a sentence about one.
  // Anything long enough to be prose is the model describing the wine in
  // a box meant for "1er Cru".
  const classification = text(payload.classification)
  if (classification) {
    if (classification.length <= 60) fields.classification = classification
    else rejected.push('classification')
  }
  const varietal = text(payload.varietal)
  if (varietal) fields.varietal = varietal
  const flavour = text(payload.flavor_profile)
  if (flavour) fields.flavor_profile = flavour
  const notes = text(payload.notes)
  if (notes) fields.notes = notes
  if (payload.wine_type) fields.wine_type = payload.wine_type

  // Table wine sits around 11-15%, fortified up to about 22. Outside
  // 4-25 it is not wine.
  const abv = payload.alcohol_percent
  if (abv !== null) {
    if (abv >= 4 && abv <= 25) fields.alcohol_percent = String(abv)
    else rejected.push('alcohol %')
  }

  // A window cannot open before the grapes were picked, cannot close
  // before it opens, and no producer guides a century ahead.
  const start = payload.drinking_window_start
  const end = payload.drinking_window_end
  if (start !== null || end !== null) {
    const startOk = start !== null && Number.isInteger(start) && start >= vintage && start <= vintage + 60
    const endOk = end !== null && Number.isInteger(end) && end >= vintage && end <= vintage + 100
    if (startOk && endOk && start <= end) {
      fields.drinking_window_start = String(start)
      fields.drinking_window_end = String(end)
    } else {
      // Half a window is not a window: one year without the other would
      // be filed as a real range by everything downstream.
      rejected.push('drinking window')
    }
  }

  // Champagne is served at 6, a big red at 18. Nothing sensible lies
  // outside 2-22, and min above max is not a range.
  const tempMin = payload.serving_temp_min
  const tempMax = payload.serving_temp_max
  if (tempMin !== null || tempMax !== null) {
    const inRange = (t: number | null) => t !== null && t >= 2 && t <= 22
    if (inRange(tempMin) && inRange(tempMax) && tempMin! <= tempMax!) {
      fields.serving_temp_min = String(tempMin)
      fields.serving_temp_max = String(tempMax)
    } else if (inRange(tempMin) && tempMax === null) {
      fields.serving_temp_min = String(tempMin)
    } else if (inRange(tempMax) && tempMin === null) {
      fields.serving_temp_max = String(tempMax)
    } else {
      rejected.push('serving temperature')
    }
  }

  // "JS 97 : RP 96" — a named critic and a number on a critic's scale.
  //
  // The name has to be a name: every word capitalised, at most three of
  // them. Allowing any words at all let "probably about 95" through as a
  // score, which is a hedge wearing a critic's clothes — precisely the
  // shape an invented rating takes.
  const ratings = text(payload.critic_ratings)
  if (ratings) {
    const CRITIC = /^[A-Z][A-Za-z.&'-]*(?:\s[A-Z][A-Za-z.&'-]*){0,2}\s+(\d{1,3}(?:\.\d)?)$/
    const scored = ratings
      .split(':')
      .map(part => part.trim())
      .filter(part => part.length <= 28)
      .filter(part => {
        const match = CRITIC.exec(part)
        if (!match) return false
        const score = Number.parseFloat(match[1])
        return score >= 50 && score <= 100
      })
    if (scored.length > 0) fields.critic_ratings = scored.join(' : ')
    else rejected.push('critic scores')
  }

  return { fields, rejected }
}

/**
 * Which looked-up fields may actually be written, and which must not.
 *
 * Adding a wine, everything on the form is a placeholder — a type of
 * Red, a window of "this year to ten years' time" — so the lookup writes
 * over all of it and nothing is lost.
 *
 * Editing one is the opposite case. The wine already has values that
 * were imported, corrected by hand, or typed deliberately, and a lookup
 * that overwrote them would quietly undo that work: the most likely
 * reason to look up a wine you already own is that its record is thin,
 * not that it is wrong. So on edit the lookup fills gaps only, and says
 * which fields it left alone — clearing a field and looking up again is
 * how you ask for a replacement, and the message is what makes that
 * discoverable.
 *
 * A field counts as a gap when the stored wine has nothing in it, or
 * when the box on screen is empty right now. The first is the usual
 * case: a wine with no serving temperature recorded still shows 15-18°C
 * in the form, because the form has to put something in the box, and
 * reading that as an existing value would make the field most worth
 * filling unfillable. The second is what makes "clear it and look up
 * again" actually true — an empty box has nothing to protect, so filling
 * one is never destructive, and without this the advice would only work
 * after saving and reopening.
 */
export function fieldsToApply(
  found: Partial<LookupFields>,
  existing?: Wine,
  /** What the form shows now, so a box just cleared counts as a gap. */
  onForm?: Partial<Record<keyof LookupFields, string>>
): { apply: Partial<LookupFields>; kept: (keyof LookupFields)[] } {
  if (!existing) return { apply: found, kept: [] }

  const alreadyKnown: Record<keyof LookupFields, boolean> = {
    country: !!existing.country?.trim(),
    region: !!existing.region?.trim(),
    classification: !!existing.classification?.trim(),
    wine_type: !!existing.wine_type,
    varietal: !!existing.varietal?.trim(),
    alcohol_percent: existing.alcohol_percent !== undefined && existing.alcohol_percent !== null,
    // A stored wine always has a drinking window — it is required — so
    // this is never a gap, and a researched window never displaces the
    // one the schedules have been planning around.
    drinking_window_start: true,
    drinking_window_end: true,
    serving_temp_min: existing.serving_temp_min !== undefined && existing.serving_temp_min !== null,
    serving_temp_max: existing.serving_temp_max !== undefined && existing.serving_temp_max !== null,
    critic_ratings: hasCriticRatings(existing.critic_ratings),
    flavor_profile: !!existing.flavor_profile?.trim(),
    notes: !!existing.notes?.trim(),
  }

  const apply: Partial<LookupFields> = {}
  const kept: (keyof LookupFields)[] = []
  for (const key of Object.keys(found) as (keyof LookupFields)[]) {
    const blankOnForm = onForm !== undefined && (onForm[key] ?? '').trim() === ''
    if (alreadyKnown[key] && !blankOnForm) kept.push(key)
    else Object.assign(apply, { [key]: found[key] })
  }
  return { apply, kept }
}

/** Stored either as "JS 97 : RP 96" or as a parsed map, so check both. */
function hasCriticRatings(ratings: Wine['critic_ratings']): boolean {
  if (!ratings) return false
  if (typeof ratings === 'string') return ratings.trim().length > 0
  return Object.keys(ratings).length > 0
}

/**
 * Only the http(s) ones, and only as many as are worth showing.
 *
 * A source list is the user's means of checking the answer, so an entry
 * that cannot be opened is worse than no entry — it lends the answer
 * weight it has not earned.
 */
export function usableSources(sources: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of sources) {
    const url = (raw ?? '').trim()
    if (!/^https?:\/\/\S+$/i.test(url) || seen.has(url)) continue
    seen.add(url)
    out.push(url)
    if (out.length === 5) break
  }
  return out
}

/**
 * Ask Claude about one wine.
 *
 * The SDK is imported here rather than at module scope so it is fetched
 * the first time a lookup runs, not on every cold start of the app — it
 * is by far the largest dependency and most sessions never open the add
 * form at all.
 */
export async function lookupWine(question: LookupQuestion): Promise<WineLookupResult> {
  const [client, { zodOutputFormat }] = await Promise.all([
    createClaudeClient(),
    import('@anthropic-ai/sdk/helpers/zod'),
  ])

  let message
  try {
    message = await client.messages.parse({
      model: LOOKUP_MODEL,
      max_tokens: 16000,
      system: buildSystemPrompt(),
      messages: [{ role: 'user', content: buildUserPrompt(question) }],
      output_config: { format: zodOutputFormat(LookupSchema) },
      // Reading the label beats recalling it. Without this the model is
      // working from memory, which is thinnest for exactly the small
      // growers most likely to be looked up.
      ...(webSearchEnabled()
        ? { tools: [{ type: 'web_search_20260209' as const, name: 'web_search' as const }] }
        : {}),
    })
  } catch (error) {
    throw new ClaudeError(describeFailure(error))
  }

  if (message.stop_reason === 'refusal') {
    throw new ClaudeError('Claude declined to answer this lookup.')
  }
  if (message.stop_reason === 'max_tokens') {
    throw new ClaudeError('The answer was cut off before it finished. Try again.')
  }

  const payload = message.parsed_output
  if (!payload) {
    throw new ClaudeError('Claude replied in a shape this app could not read.')
  }

  if (!payload.found) {
    return {
      status: 'not_found',
      reason:
        text(payload.not_found_reason) ??
        'Claude could not identify this wine and vintage.',
    }
  }

  const { fields, rejected } = plausible(payload, question.vintage)
  return { status: 'found', fields, sources: usableSources(payload.sources), rejected }
}

