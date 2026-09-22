/**
 * Which parts of the drinking schedule are history.
 *
 * History folds away by default: a past year holds nothing but bottles
 * already drunk, and scrolling through them to reach what to open
 * tonight is a cost paid every time the screen is opened, for
 * information wanted occasionally.
 *
 * The boundary is the month, not the day. A wine scheduled for this
 * month is still this month's business on the 30th, so the current
 * month stays open until it ends.
 */

/** A period is past once the month it names has ended. */
export function isPastPeriod(year: number, month: number, now = new Date()): boolean {
  const thisYear = now.getFullYear()
  if (year !== thisYear) return year < thisYear
  return month < now.getMonth() + 1
}

/**
 * What a folded period says about itself.
 *
 * "4 drunk" reads as a record; "4 wines" reads as a list still to get
 * through. Only the first is claimed, and only when it is true — past
 * periods hold only consumed bottles today, but that is a property of
 * how the planner happens to work, not something this needs to assume.
 */
export function periodSummary(wines: Array<{ consumed?: boolean }>): string {
  const drunk = wines.filter(wine => wine.consumed).length
  if (wines.length > 0 && drunk === wines.length) return `${drunk} drunk`
  return `${wines.length} ${wines.length === 1 ? 'wine' : 'wines'}`
}
