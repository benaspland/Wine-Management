import type { Wine } from '../types/index'
import { WineService } from '../services/wine.service'
import WineInfo from './WineInfo'
import LocationBadge from './LocationBadge'
import { wineDisplayName } from '../services/wine.service'
import { Wine as WineIcon } from 'lucide-react'
import HoldButton from './HoldButton'
import TierBadge from './TierBadge'
import DrinkingStatusBadge from './DrinkingStatusBadge'
import WineThumbnail from './WineThumbnail'

interface WineCardProps {
  wine: Wine
  onSelect: (wine: Wine) => void
  onConsume: (wineId: string) => Promise<void>
  /** Hold: log with a chosen date and tasting note. */
  onConsumeDetailed: (wine: Wine) => void
  isLoading?: boolean
}

export default function WineCard({ wine, onSelect, onConsume, onConsumeDetailed, isLoading }: WineCardProps) {
  const drinkingStatus = WineService.getDrinkingWindowLabel(wine)

  const handleConsume = () => {
    if (wine.quantity_at_home === 0) return
    void onConsume(wine.id)
  }

  const handleConsumeDetailed = () => {
    if (wine.quantity_at_home === 0) return
    onConsumeDetailed(wine)
  }

  return (
    <div onClick={() => onSelect(wine)} className="group cursor-pointer h-full">
      <div className="panel overflow-hidden h-full flex flex-col p-4 gap-3 transition-colors duration-300 hover:bg-surface-container">
        {/* Thumbnail beside the text, not a band above it.

            A full-bleed photo header only appeared for wines that had a
            photo — one in this collection — so 124 cards began where the
            125th had an image, and the card's shape announced which
            records happened to be complete. It also cost 160px to do it.
            Beside the text the slot is always there, it fills the empty
            right half the identity block was leaving, and the card is
            shorter than the band alone used to be. Photos still show
            here at thumbnail scale, and full size in the detail panel. */}
        <div className="flex items-stretch gap-3.5">
          <WineThumbnail wine={wine} size="md" />

          <div className="flex-1 min-w-0 flex flex-col gap-2">
            {/* Identity comes from WineInfo — the component the detail
                panel uses — so producer, wine and classification each
                get their own line and the two screens agree. The second
                line carries whatever the wine has there: a cuvée for
                most, an appellation for an estate. */}
            <div>
              {/* No classification here. "1er Cru", "VDP Grosse Lage",
                  "Grand Cru Classe de Graves" — a line each, on every
                  card, saying something that does not help you pick a
                  bottle off a list. It stays in the detail panel, where
                  there is room for what a wine *is* as well as which
                  one it is. */}
              <WineInfo
                wine={wine}
                producerSize="base"
                nameSize="sm"
                showClassification={false}
                layout="vertical"
              />
              <p className="text-xs text-outline mt-1.5">
                {wine.vintage} · {wine.region}
                {wine.country ? `, ${wine.country}` : ''}
              </p>
            </div>

            {/* Quality, then readiness. The first grape of the blend
                used to sit here too, as bare text between two chips —
                a chip that had lost its background, saying the one
                thing about a wine you can usually infer from its name
                and its region. The panel lists the full blend. */}
            <div className="flex flex-wrap items-center gap-1.5">
              <TierBadge tier={wine.tier} />
              {/* Pushed to the card's right edge so every status chip
                  lands on the same vertical line and the column can be
                  scanned without reading it. Beside the tier chip they
                  started wherever "EVERYDAY" or "ICON" happened to end,
                  which is no column at all. The cost is a gap that
                  varies with the two labels' lengths; a scannable edge
                  is worth more than an even one. */}
              <DrinkingStatusBadge status={drinkingStatus} className="ml-auto" />
            </div>

            {/* Where the bottles are, and in what. This had a divider
                and a band to itself, which spent 40px of every card on
                two facts the list row carries inline. */}
            {/* Everything about the physical bottles on one line: how
                many, where, and what size. The size used to sit at the
                far right of its own row, as far from the counts as the
                card allowed, despite being the same kind of fact. */}
            <div className="mt-auto flex items-center gap-2.5 text-[10px] text-outline">
              <LocationBadge wine={wine} />
              <span className="font-bold tracking-widest uppercase">{wine.format}</span>

              {/* Inline with the counts, and left at its natural height.
                  Pinned to the card's corner it floated over whatever
                  happened to be at the bottom right — on a short card
                  that was the drinking-status chip, and the button sat
                  on top of the word. Overhanging it into the padding
                  with negative margins avoided the height but put the
                  collision back within a pixel or two; a row that is as
                  tall as the thing in it cannot collide with anything,
                  and only the cards with bottles at home pay for it. */}
              {wine.quantity_at_home > 0 && (
                <HoldButton
                  onTap={handleConsume}
                  onHold={handleConsumeDetailed}
                  progressColor="rgba(255, 255, 255, 0.4)"
                  disabled={isLoading}
                  aria-label={`Drink ${wineDisplayName(wine.producer, wine.name)}`}
                  title="Tap to mark consumed, hold to set the date and add a note"
                  className="ml-auto h-9 w-9 shrink-0 rounded-full bg-primary-container text-on-primary hover:bg-primary disabled:opacity-50 transition-colors"
                >
                  <WineIcon size={15} aria-hidden="true" />
                </HoldButton>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
