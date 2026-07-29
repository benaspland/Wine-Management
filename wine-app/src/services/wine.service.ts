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

export class WineService {
  // Check if wine can be consumed (within window)
  static canConsume(wine: Wine): boolean {
    const now = new Date().getFullYear()
    return now >= wine.drinking_window_start && now <= wine.drinking_window_end
  }

  // Get drinking window label
  static getDrinkingWindowLabel(wine: Wine): string {
    const now = new Date().getFullYear()

    if (now < wine.drinking_window_start) {
      return `Wait (${wine.drinking_window_start})`
    } else if (now >= wine.drinking_window_start && now <= wine.drinking_window_end) {
      return 'Ready to Drink'
    } else if (now > wine.drinking_window_end - 2 && now < wine.drinking_window_end) {
      return 'Peak'
    } else if (now === wine.drinking_window_end) {
      return 'Last Year'
    } else {
      return 'Past Peak'
    }
  }
}
