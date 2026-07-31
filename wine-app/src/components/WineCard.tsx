import type { Wine } from '../types/index'
import { WineService } from '../services/wine.service'
import WineInfo from './WineInfo'
import LocationBadge from './LocationBadge'
import { wineDisplayName } from '../services/wine.service'
import { Wine as WineIcon } from 'lucide-react'
import HoldButton from './HoldButton'
import TierBadge from './TierBadge'
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
  const drinkingColor =
    drinkingStatus === 'Ready to Drink' || drinkingStatus === 'Peak'
      ? 'text-primary'
      : drinkingStatus === 'Past Peak' || drinkingStatus === 'Last Year'
        ? 'text-warn'
        : 'text-outline'

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
      <div className="panel relative overflow-hidden h-full flex flex-col p-4 gap-3 transition-colors duration-300 hover:bg-surface-container">
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
              <span
                className={`px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase whitespace-nowrap rounded-full bg-surface-container-high ${drinkingColor}`}
              >
                {drinkingStatus}
              </span>
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
            </div>
          </div>

        </div>
        {/* In the corner, and out of the flow. Sitting beside the name
            it took 40px off the text column, which is what pushed
            "Domaine Latour-Giraud" onto two lines and split its two
            chips across two rows — the button was the reason that card
            was the tallest on the screen. */}
        {wine.quantity_at_home > 0 && (
          // Positioned by a wrapper: HoldButton sets its own `relative`
          // for the hold sweep, and that wins over an `absolute` passed
          // in — the button quietly stayed in the flow, landing bottom
          // left and adding its own height to every card.
          <span className="absolute bottom-3 right-3">
            <HoldButton
              onTap={handleConsume}
              onHold={handleConsumeDetailed}
              progressColor="rgba(255, 255, 255, 0.4)"
              disabled={isLoading}
              aria-label={`Drink ${wineDisplayName(wine.producer, wine.name)}`}
              title="Tap to mark consumed, hold to set the date and add a note"
              className="h-9 w-9 rounded-full bg-primary-container text-on-primary hover:bg-primary disabled:opacity-50 transition-colors"
            >
              <WineIcon size={15} aria-hidden="true" />
            </HoldButton>
          </span>
        )}
      </div>
    </div>
  )
}
