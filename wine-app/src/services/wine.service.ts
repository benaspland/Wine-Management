import type { Wine } from '../types/index'

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
