import type { Wine } from '../types/index'
import { isEstateWine } from './wineName.service'

/**
 * One-line display name that avoids the "Chateau Meyney Meyney" effect:
 * the CSV importer derives name from producer for chateau-style wines
 * (producer "Chateau Meyney" -> name "Meyney"), so naive
 * `producer + name` concatenation repeats the suffix.
 */
export function wineDisplayName(producer: string | undefined, name: string): string {
  const p = producer?.trim() ?? ''
  const n = name.trim()
  if (!p) return n
  if (!n || p.toLowerCase().endsWith(n.toLowerCase())) return p
  return `${p} ${n}`
}

/**
 * One-line label for the compact surfaces — the cellar list and the
 * grid card.
 *
 * Where the second line is an appellation rather than a cuvée, it is
 * dropped: "Chateau Tronquoy Saint-Estephe" reads as one long name, and
 * the appellation is geography the region line beside it already
 * carries. A cuvée is kept, because without it two wines from the same
 * estate are indistinguishable. The detail panel still shows both.
 */
export function wineTileName(
  producer: string | undefined,
  name: string,
  region?: string
): string {
  if (isEstateWine(producer, region)) return producer?.trim() || name.trim()
  return wineDisplayName(producer, name)
}

/**
 * Critic ratings as a plain object. The importer stores them as a JSON
 * string while the form stores an object, so every reader must handle
 * both — iterating a raw string yields one entry per character, which
 * silently corrupts anything built from it (notably CSV export).
 * Unparseable values are treated as "no ratings" rather than throwing.
 */
export function criticRatingsOf(
  ratings: string | Record<string, number> | undefined
): Record<string, number> {
  if (!ratings) return {}
  if (typeof ratings !== 'string') return ratings
  try {
    const parsed: unknown = JSON.parse(ratings)
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, number>)
      : {}
  } catch {
    return {}
  }
}

/**
 * The five states of getDrinkingWindowLabel. "Hold" carries its year,
 * so the type stays open at that one point.
 */
export type DrinkingStatus =
  | `Hold (${number})`
  | `Drink (${number})`
  | `Peak (${number})`
  | 'Last Year'
  | 'Past Peak'

export class WineService {
  // Check if wine can be consumed (within window)
  static canConsume(wine: Wine): boolean {
    const now = new Date().getFullYear()
    return now >= wine.drinking_window_start && now <= wine.drinking_window_end
  }

  /**
   * Where a wine is in its drinking window.
   *
   * Each state carries the year it turns on: "Hold (2028)" is when it
 * opens, "Drink (2040)" and "Peak (2027)" are when it shuts. That is
 * more use than "Ready to Drink", and short enough to sit beside a tier
 * chip without wrapping the row — which the long form did.
 *
 * Ordered most specific first. It used to test "in the window" second,
   * which is true of a wine at its peak and of one in its final year —
   * so those two branches sat below a condition that had already caught
   * them, and the app could only ever say Hold, Drink or Past
   * Peak. Three of the five states were unreachable.
   */
  static getDrinkingWindowLabel(wine: Wine, now = new Date().getFullYear()): DrinkingStatus {
    if (now < wine.drinking_window_start) return `Hold (${wine.drinking_window_start})`
    if (now > wine.drinking_window_end) return 'Past Peak'
    if (now === wine.drinking_window_end) return 'Last Year'
    if (now >= wine.drinking_window_end - 1) return `Peak (${wine.drinking_window_end})`
    return `Drink (${wine.drinking_window_end})`
  }
}

/**
 * The drinking window as a phrase: "Drink · 2024-2029".
 *
 * The verb comes from getDrinkingWindowLabel, so the schedule and the
 * cellar cannot drift into two vocabularies for the same fact — the
 * chip says DRINK (2029) and this says Drink · 2024-2029, but they are
 * the same state machine. The window is spelled out in full here
 * because this is where you decide whether to open a bottle tonight,
 * and "by 2029" answers less than "2024 to 2029" does.
 */
export function drinkingWindowSummary(
  wine: Pick<Wine, 'drinking_window_start' | 'drinking_window_end'>,
  now = new Date().getFullYear()
): string {
  const state = WineService.getDrinkingWindowLabel(wine as Wine, now)
  const verb = state.replace(/\s*\(\d+\)$/, '')
  return `${verb} \u00b7 ${wine.drinking_window_start}\u2013${wine.drinking_window_end}`
}

/** Just the years, for a wine you cannot act on yet. */
export function drinkingWindowYears(
  wine: Pick<Wine, 'drinking_window_start' | 'drinking_window_end'>
): string {
  return `${wine.drinking_window_start}\u2013${wine.drinking_window_end}`
}

/**
 * Critic scores as typed and as shown: "JS 97 : RP 96".
 *
 * The same shape the CSV column uses, so a score entered by hand and one
 * imported are the same thing — and the form can round-trip a wine that
 * arrived either way.
 */
export function formatCriticRatings(
  ratings: string | Record<string, number> | undefined
): string {
  return Object.entries(criticRatingsOf(ratings))
    .map(([critic, score]) => `${critic.toUpperCase()} ${score}`)
    .join(' : ')
}

/** Parses that format back, ignoring anything that is not "NAME 97". */
export function parseCriticRatings(text: string): Record<string, number> {
  const result: Record<string, number> = {}
  for (const part of text.split(':')) {
    // Allow qualifiers like "RP 94+" - keep the numeric score
    const match = part.trim().match(/^(\w+)\s+(\d+)\+?$/)
    if (match) result[match[1].toLowerCase()] = parseInt(match[2])
  }
  return result
}

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/**
 * "Sep 2032" — the month a delivery lands, without the day.
 *
 * A delivery window is a month, not a date, so a day in it was precision
 * the schedule does not have. Written from a fixed table rather than
 * toLocaleDateString: en-GB abbreviates September to "Sept", which is
 * four letters where every other month is three.
 */
export function formatDeliveryMonth(date: string | Date): string {
  const value = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(value.getTime())) return ''
  return `${SHORT_MONTHS[value.getMonth()]} ${value.getFullYear()}`
}
