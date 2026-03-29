/**
 * Delivery and consumption configuration constants
 * These values are used throughout the scheduling algorithms
 */

export const DELIVERY_CONFIG = {
  // Delivery scheduling
  months: [3, 9], // March and September
  minBottles: 24, // Minimum bottles per delivery
  annualTarget: 30, // Target wines per year
  capacityDefault: 80, // Default home cellar capacity
  deliveryFillRatio: 0.75, // Fill 75% of available capacity per delivery

  // Tier constraints
  tier45StartYear: 2029, // High tier wines (4-5) not before this year
  tier45MinSpacingYears: 3, // Minimum years between consuming same high-tier wine

  // Delivery thresholds by format
  thresholds: {
    halfBottle: 12, // 375ml bottles
    magnum: 3, // 1.5L bottles
    standard: 6, // 750ml bottles
  },
} as const

/**
 * Get the next delivery month and year from current date
 * Deliveries happen in March and September only
 */
export function getNextDeliveryDate(now: Date = new Date()): { year: number; month: number } {
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1 // 1-12

  if (currentMonth <= 3) {
    return { year: currentYear, month: 3 }
  } else if (currentMonth <= 9) {
    return { year: currentYear, month: 9 }
  } else {
    return { year: currentYear + 1, month: 3 }
  }
}

/**
 * Format delivery date as YYYY-MM-DD
 */
export function formatDeliveryDate(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

/**
 * Get minimum delivery threshold for a given bottle format
 */
export function getMinDeliveryThreshold(format: string): number {
  if (format.includes('375') || format.includes('half')) {
    return DELIVERY_CONFIG.thresholds.halfBottle
  }
  if (format.includes('1.5') || format.includes('magnum')) {
    return DELIVERY_CONFIG.thresholds.magnum
  }
  return DELIVERY_CONFIG.thresholds.standard
}
