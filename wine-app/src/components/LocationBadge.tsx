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
  /**
   * Take the whole row and push the two counts to its opposite ends
   * rather than grouping them. On a card that lands the home count —
   * which is also the control — directly under the drinking status,
   * the label that says whether to use it.
   */
  spread?: boolean
  /** Tap: drink one now. Omit to render the count as plain text. */
  onConsume?: () => void
  /** Hold: choose the date and add a note. */
  onConsumeDetailed?: () => void
  disabled?: boolean
}

export default function LocationBadge({
  wine,
  spread,
  onConsume,
  onConsumeDetailed,
  disabled,
}: LocationBadgeProps) {
  const atHome = wine.quantity_at_home > 0
  const canConsume = atHome && onConsume && onConsumeDetailed

  const storage = (
    <span
      className={`flex items-center gap-1 ${
        wine.quantity_in_storage > 0 ? 'text-on-surface/80' : 'text-outline opacity-60'
      }`}
      title={`${wine.quantity_in_storage} in storage`}
    >
      <Warehouse size={14} aria-hidden="true" />
      {wine.quantity_in_storage}
    </span>
  )

  return (
    <div
      className={`flex items-center text-xs font-medium ${
        spread ? 'flex-1 justify-between' : 'gap-3'
      }`}
    >
      {spread && storage}
      {canConsume ? (
        /* The target and the pill are deliberately different sizes.
           Padding on the button gives a 42px area a finger can hit;
           the negative margin takes back that padding *and* the pill's
           own 3px, so the control occupies exactly the 16px the plain
           text did and a card with bottles at home stays exactly as
           tall as one without. Matching the two would leave the pill's
           padding in the row and cost 6px a card.

           The fill sits on the inner span, not the button, so what you
           *see* is a 22px pill rather than the whole target painted
           in — the target is generous, the mark is not.

           A soft fill rather than an outline, and no letter-spaced
           capitals: it has to read as a different kind of thing from
           the tier and status pills above it, which look similar and do
           nothing when tapped. */
        <HoldButton
          onTap={onConsume}
          onHold={onConsumeDetailed}
          progressColor="rgba(255, 255, 255, 0.18)"
          disabled={disabled}
          aria-label={`Drink ${wineDisplayName(wine.producer, wine.name)}`}
          // Still says how many are at home: making the count tappable
          // must not cost the fact it was showing in the first place.
          title={`${wine.quantity_at_home} at home — tap to mark one consumed, hold to set the date and add a note`}
          className="-my-[13px] -mx-1 rounded-full px-1 py-2.5 disabled:opacity-50"
        >
          <span className="flex items-center gap-1 rounded-full bg-primary-container/15 px-2 py-[3px] text-primary-container hover:bg-primary-container/25 transition-colors">
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

      {!spread && storage}
    </div>
  )
}
