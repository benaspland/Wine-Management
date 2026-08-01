import type { Wine } from '../types/index'
import { House, Warehouse } from 'lucide-react'
import HoldButton from './HoldButton'
import { wineDisplayName } from '../services/wine.service'

/**
 * Shows where a wine's bottles physically are — the core inventory
 * state (home vs professional storage) made visible at a glance.
 * The home count is highlighted when > 0: that's the "can I drink
 * this tonight?" signal.
 *
 * Given a consume handler, that same count becomes the control for it.
 * A separate button was a third object on a card that already had two
 * chips and a photo; it appeared only on cards with bottles at home, so
 * it made those rows 20px taller than the rest; and it was the
 * brightest thing on the screen for an action taken a few times a
 * month. The number of bottles at home is exactly what "drink one"
 * acts on, so it is the control.
 */

interface LocationBadgeProps {
  wine: Wine
  /** Tap: drink one now. Omit to render the count as plain text. */
  onConsume?: () => void
  /** Hold: choose the date and add a note. */
  onConsumeDetailed?: () => void
  disabled?: boolean
}

export default function LocationBadge({
  wine,
  onConsume,
  onConsumeDetailed,
  disabled,
}: LocationBadgeProps) {
  const atHome = wine.quantity_at_home > 0
  const canConsume = atHome && onConsume && onConsumeDetailed

  return (
    <div className="flex items-center gap-3 text-xs font-medium">
      {canConsume ? (
        /* py-2.5 -my-2.5 buys a 36px touch target — the same as the
           button it replaces — while taking no more room in the row
           than the plain text it replaces, so a card with bottles at
           home is exactly as tall as one without.

           A soft fill rather than an outline, and no letter-spaced
           capitals: it has to read as a different kind of thing from
           the tier and status pills above it, which look similar and do
           nothing when tapped. */
        <HoldButton
          onTap={onConsume}
          onHold={onConsumeDetailed}
          progressColor="rgba(255, 255, 255, 0.25)"
          disabled={disabled}
          aria-label={`Drink ${wineDisplayName(wine.producer, wine.name)}`}
          // Still says how many are at home: making the count tappable
          // must not cost the fact it was showing in the first place.
          title={`${wine.quantity_at_home} at home — tap to mark one consumed, hold to set the date and add a note`}
          className="-my-2.5 rounded-full bg-primary-container/15 px-2.5 py-2.5 text-primary-container hover:bg-primary-container/25 disabled:opacity-50 transition-colors"
        >
          <span className="flex items-center gap-1">
            <House size={14} aria-hidden="true" />
            {wine.quantity_at_home}
          </span>
        </HoldButton>
      ) : (
        <span
          className={`flex items-center gap-1 ${atHome ? 'text-primary' : 'text-outline opacity-60'}`}
          title={`${wine.quantity_at_home} at home`}
        >
          <House size={14} aria-hidden="true" />
          {wine.quantity_at_home}
        </span>
      )}

      <span
        className={`flex items-center gap-1 ${
          wine.quantity_in_storage > 0 ? 'text-on-surface/80' : 'text-outline opacity-60'
        }`}
        title={`${wine.quantity_in_storage} in storage`}
      >
        <Warehouse size={14} aria-hidden="true" />
        {wine.quantity_in_storage}
      </span>
    </div>
  )
}
