import { Check } from 'lucide-react'

/**
 * Where a delivery stands, as one outline pill.
 *
 * Same badge language as the cellar's tier chip: an outline pill on a
 * single hue, never a solid fill — the filled accent is reserved for
 * the one button that does something. Complete and Planned are both
 * neutral, since neither is asking for anything; the tick and the
 * dimmed card behind it are what separate "done" from "not yet".
 */

export type DeliveryState = 'complete' | 'next' | 'planned'

const STYLE: Record<DeliveryState, string> = {
  complete: 'border-outline-variant/70 text-outline',
  next: 'border-primary-container text-primary-container',
  planned: 'border-outline-variant/70 text-outline',
}

const LABEL: Record<DeliveryState, string> = {
  complete: 'Complete',
  next: 'Next up',
  planned: 'Planned',
}

export default function DeliveryStatusBadge({ state }: { state: DeliveryState }) {
  return (
    <span
      className={`inline-flex items-center gap-1 border rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap ${STYLE[state]}`}
    >
      {state === 'complete' && <Check size={11} aria-hidden="true" />}
      {LABEL[state]}
    </span>
  )
}
