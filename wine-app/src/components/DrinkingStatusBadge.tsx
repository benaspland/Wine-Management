import type { DrinkingStatus } from '../services/wine.service'

/**
 * Where a wine is in its drinking window.
 *
 * Same shape as the tier badge — an outline pill — because they sit
 * side by side and two different shapes for two chips is noise. What
 * separates them is colour, and the rule is that **quality is brass and
 * time is not**. Tier runs on the accent; this runs on a neutral-to-warm
 * ramp that never touches it, so "Ready to Drink" can never be mistaken
 * for a quality mark the way it was when both were the same gold.
 *
 * Drink is bright neutral rather than green: it is the commonest state
 * in a cellar and wants to read as "live", not as a congratulation.
 * Green is kept for Peak, which is the one moment actually worth
 * celebrating — and, being rare, never fights the green accent of the
 * Charcoal & Verdant skin.
 */

const STATUS_STYLE: Array<{ match: (s: string) => boolean; className: string }> = [
  { match: s => s.startsWith('Hold'), className: 'border-outline-variant text-outline' },
  { match: s => s.startsWith('Drink'), className: 'border-on-surface/35 text-on-surface' },
  { match: s => s.startsWith('Peak'), className: 'border-success/50 text-success' },
  { match: s => s === 'Last Year', className: 'border-warn/60 text-warn' },
  { match: s => s === 'Past Peak', className: 'border-danger/60 text-danger' },
]

const FALLBACK = 'border-outline-variant text-outline'

interface DrinkingStatusBadgeProps {
  status: DrinkingStatus
  className?: string
}

export default function DrinkingStatusBadge({ status, className = '' }: DrinkingStatusBadgeProps) {
  const style = STATUS_STYLE.find(entry => entry.match(status))?.className ?? FALLBACK

  return (
    <span
      className={`inline-flex items-center border rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-widest uppercase whitespace-nowrap ${style} ${className}`}
    >
      {status}
    </span>
  )
}
