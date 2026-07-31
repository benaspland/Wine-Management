import type { Wine } from '../types/index'
import { TIER_LABELS } from '../types/index'
import { wineDisplayName, wineTileName } from '../services/wine.service'
import { Wine as WineIcon, House, Warehouse } from 'lucide-react'
import HoldButton from './HoldButton'
import WineThumbnail from './WineThumbnail'

interface WineListRowProps {
  wine: Wine
  onSelect: (wine: Wine) => void
  onConsume: (wineId: string) => Promise<void>
  /** Hold: log with a chosen date and tasting note. */
  onConsumeDetailed: (wine: Wine) => void
  isLoading?: boolean
}

/**
 * The same ordinal scale the tier badge uses, at dot scale. A row this
 * narrow has no width for a pill once the thumbnail and the drink
 * button have taken theirs, but the encoding has to agree with the card
 * and the panel — so it is the same five steps of one accent, not the
 * old mix where Premium was solid white and Fine was a gold outline.
 */
const TIER_DOT: Record<number, string> = {
  5: 'bg-primary-container',
  4: 'bg-primary-container/70',
  3: 'bg-primary-container/45',
  2: 'bg-primary-container/25',
  1: 'bg-white/15',
}

/**
 * Compact row for the list view: scannable at 125-wine scale where the
 * card grid is not.
 *
 * The name gets the width and may wrap to two lines — truncating it is
 * false economy when two vintages of the same château are otherwise
 * indistinguishable. Everything else (vintage, region, where the
 * bottles are) is secondary and shares the line beneath.
 */
export default function WineListRow({
  wine,
  onSelect,
  onConsume,
  onConsumeDetailed,
  isLoading,
}: WineListRowProps) {
  const atHome = wine.quantity_at_home > 0

  const handleConsume = () => {
    if (!atHome) return
    void onConsume(wine.id)
  }

  const handleConsumeDetailed = () => {
    if (!atHome) return
    onConsumeDetailed(wine)
  }

  return (
    <div
      onClick={() => onSelect(wine)}
      className="panel flex items-start gap-3 px-4 py-3 hover:bg-surface-container cursor-pointer transition-colors"
    >
      <WineThumbnail wine={wine} />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-on-surface leading-snug line-clamp-2 flex items-start gap-2">
          <span
            className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${TIER_DOT[wine.tier]}`}
            title={TIER_LABELS[wine.tier]}
            aria-hidden="true"
          />
          <span className="min-w-0">{wineTileName(wine.producer, wine.name, wine.region)}</span>
        </p>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-outline">
          <span className="truncate">
            {wine.vintage} · {wine.region}
          </span>
          <span className="flex items-center gap-2 shrink-0" aria-hidden="true">
            <span
              className={`flex items-center gap-1 ${atHome ? 'text-primary' : 'opacity-60'}`}
              title={`${wine.quantity_at_home} at home`}
            >
              <House size={12} />
              {wine.quantity_at_home}
            </span>
            <span
              className={`flex items-center gap-1 ${wine.quantity_in_storage > 0 ? 'text-on-surface/70' : 'opacity-60'}`}
              title={`${wine.quantity_in_storage} in storage`}
            >
              <Warehouse size={12} />
              {wine.quantity_in_storage}
            </span>
          </span>
        </div>
      </div>

      {/* Only shown when there is something to drink: a permanently
          greyed-out glass reads as broken rather than unavailable, and
          bringing a bottle home is done from the detail panel this row
          opens.

          Icon only, and filled rather than outlined. A labelled pill
          cost roughly 190px — enough that the one row with an action
          was the only one whose name could not fit. Identical to the
          consume button on the schedule page, so the same mark means
          the same thing wherever it appears. */}
      {atHome && (
        <HoldButton
          onTap={handleConsume}
          onHold={handleConsumeDetailed}
          progressColor="rgba(255, 255, 255, 0.4)"
          disabled={isLoading}
          title="Tap to mark consumed, hold to set the date and add a note"
          aria-label={`Drink ${wineDisplayName(wine.producer, wine.name)}`}
          className="h-10 w-10 shrink-0 rounded-full bg-primary-container text-on-primary hover:bg-primary disabled:opacity-50 transition-colors"
        >
          <WineIcon size={16} aria-hidden="true" />
        </HoldButton>
      )}
    </div>
  )
}
