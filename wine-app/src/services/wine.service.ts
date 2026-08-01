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
 * The five states of getDrinkingWindowLabel. "Wait" carries its year,
 * so the type stays open at that one point.
 */
export type DrinkingStatus =
  | `Wait (${number})`
  | 'Ready to Drink'
  | 'Peak'
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
   * Ordered most specific first. It used to test "in the window" second,
   * which is true of a wine at its peak and of one in its final year —
   * so those two branches sat below a condition that had already caught
   * them, and the app could only ever say Wait, Ready to Drink or Past
   * Peak. Three of the five states were unreachable.
   */
  static getDrinkingWindowLabel(wine: Wine, now = new Date().getFullYear()): DrinkingStatus {
    if (now < wine.drinking_window_start) return `Wait (${wine.drinking_window_start})`
    if (now > wine.drinking_window_end) return 'Past Peak'
    if (now === wine.drinking_window_end) return 'Last Year'
    if (now >= wine.drinking_window_end - 1) return 'Peak'
    return 'Ready to Drink'
  }
}
