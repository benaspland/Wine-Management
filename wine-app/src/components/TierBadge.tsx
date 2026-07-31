import { TIER_LABELS } from '../types/index'
import type { Tier } from '../types/index'

/**
 * Tier, as one pill on a single-hue intensity scale.
 *
 * Tier is ordinal — a ranking — so five steps of one accent read faster
 * than five arbitrary colours, and reuse the brass already in the skin
 * rather than introducing hues. It also fixes a plain inconsistency:
 * Premium rendered as a solid white chip while Fine rendered as a gold
 * outline, so the same kind of badge looked like two different things.
 *
 * Only the top tier is filled, which is what makes it read as rare.
 */

const TIER_STYLE: Record<Tier, string> = {
  1: 'border-white/15 text-outline',
  2: 'border-primary-container/25 text-primary-container/60',
  3: 'border-primary-container/35 text-primary-container/75',
  4: 'border-primary-container/60 text-primary-container',
  5: 'border-primary-container bg-primary-container text-on-primary',
}

interface TierBadgeProps {
  tier: number
  /** `sm` for tiles and rows, `md` where the tier leads. */
  size?: 'sm' | 'md'
  className?: string
}

export default function TierBadge({ tier, size = 'sm', className = '' }: TierBadgeProps) {
  const key = (tier in TIER_STYLE ? tier : 1) as Tier
  const label = TIER_LABELS[key]

  return (
    <span
      className={`inline-flex items-center border rounded-full font-bold tracking-widest uppercase whitespace-nowrap ${
        size === 'md' ? 'px-3 py-1 text-[11px]' : 'px-2.5 py-0.5 text-[10px]'
      } ${TIER_STYLE[key]} ${className}`}
    >
      {label}
    </span>
  )
}
