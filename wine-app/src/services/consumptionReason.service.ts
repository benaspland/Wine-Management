/**
 * Why a bottle left the cellar.
 *
 * Not every bottle that leaves gets drunk — one is given away, one turns
 * out to be corked, one goes into a risotto. The stock movement is the
 * same either way, so the schedules and counts are unaffected; what
 * changes is what the record says happened, which is the difference
 * between a cellar log and a tasting log.
 *
 * Entries written before this existed have no reason at all. They are
 * read as "drank" — that is what logging a bottle meant at the time, so
 * inferring anything else would put words in the record.
 */

export type ConsumptionReason = 'drank' | 'gifted' | 'sold' | 'corked' | 'cooking' | 'lost'

export const DEFAULT_REASON: ConsumptionReason = 'drank'

interface ReasonCopy {
  /** In the dropdown. */
  label: string
  /** In a history row, where "drank" needs no saying. */
  chip: string
  /** In the toast: "Chateau Meyney 2019 <verb>". */
  verb: string
}

export const CONSUMPTION_REASONS: Record<ConsumptionReason, ReasonCopy> = {
  drank: { label: 'Drank', chip: '', verb: 'consumed' },
  gifted: { label: 'Gifted', chip: 'Gifted', verb: 'logged as gifted' },
  sold: { label: 'Sold', chip: 'Sold', verb: 'logged as sold' },
  corked: { label: 'Corked or faulty', chip: 'Corked', verb: 'logged as corked' },
  cooking: { label: 'Cooking', chip: 'Cooking', verb: 'logged for cooking' },
  lost: { label: 'Lost or broken', chip: 'Lost', verb: 'logged as lost' },
}

/** Drank first — it is the overwhelming case and the default. */
export const REASON_ORDER: ConsumptionReason[] = [
  'drank',
  'gifted',
  'sold',
  'corked',
  'cooking',
  'lost',
]

/** An unrecorded reason is "drank", as is anything unrecognised. */
export function reasonOf(value: string | undefined): ConsumptionReason {
  return value && value in CONSUMPTION_REASONS ? (value as ConsumptionReason) : DEFAULT_REASON
}

/** What to show beside a history entry, or nothing when it was drunk. */
export function reasonChip(value: string | undefined): string {
  return CONSUMPTION_REASONS[reasonOf(value)].chip
}

export function reasonVerb(value: string | undefined): string {
  return CONSUMPTION_REASONS[reasonOf(value)].verb
}
