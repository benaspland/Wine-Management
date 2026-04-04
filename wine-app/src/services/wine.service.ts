import type { Wine } from '../types/index'

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
