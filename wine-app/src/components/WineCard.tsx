import type { Wine } from '../types/index'
import { WineService } from '../services/wine.service'
import WineInfo from './WineInfo'
import LocationBadge from './LocationBadge'
import { wineDisplayName } from '../services/wine.service'
import { Wine as WineIcon } from 'lucide-react'
import HoldButton from './HoldButton'
import TierBadge from './TierBadge'

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

  const grape = wine.varietal?.split(':')[0].trim()

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
      <div className="panel overflow-hidden h-full flex flex-col transition-colors duration-300 hover:bg-surface-container">
        {/* Label photo as the card's header rather than an object floating
            over its top edge. The overhang was designed for cut-out bottle
            renders, where a neck rising past the card reads as deliberate;
            a rectangular photograph just looks stuck on.

            A portrait label in a full-width band would otherwise leave two
            thirds of that band empty, so a blurred, darkened copy of the
            same photo fills the space behind it. Nothing is cropped — the
            label stays whole and legible — and the band fills edge to edge. */}
        {wine.image_url && (
          <div className="relative h-40 overflow-hidden">
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-cover bg-center scale-125 blur-2xl opacity-40"
              style={{ backgroundImage: `url("${wine.image_url}")` }}
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/20 to-surface-container-low"
            />
            <img
              alt={wineDisplayName(wine.producer, wine.name)}
              loading="lazy"
              decoding="async"
              src={wine.image_url}
              className="relative h-full w-full object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.55)] group-hover:scale-105 transition-transform duration-500"
            />
          </div>
        )}

        <div className="p-5 flex-1 flex flex-col gap-4">
          {/* The wine leads. Region was set in amber caps above the name,
              which made the place louder than the thing.

              Identity comes from WineInfo — the component the detail
              panel uses — so producer, wine and classification each get
              their own line and the two screens agree. The second line
              carries whatever the wine has there: a cuvée for most, an
              appellation for an estate. Both belong on a card, which
              gives them a line of their own; it is the cellar list,
              putting producer and wine on one line, that has to drop an
              appellation to avoid reading as a single run-on name.
              WineInfo still hides a name that merely repeats the
              producer, as a château's does. */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <WineInfo
                wine={wine}
                producerSize="lg"
                nameSize="sm"
                classificationSize="xs"
                showClassification={true}
                layout="vertical"
              />
              <p className="text-xs text-outline mt-1.5">
                {wine.vintage} · {wine.region}
                {wine.country ? `, ${wine.country}` : ''}
              </p>
            </div>

            {/* Icon only, matching the list and the schedule: the same
                mark means the same thing everywhere. Shown only when
                there is something to drink. */}
            {wine.quantity_at_home > 0 && (
              <HoldButton
                onTap={handleConsume}
                onHold={handleConsumeDetailed}
                progressColor="rgba(255, 255, 255, 0.4)"
                disabled={isLoading}
                aria-label={`Drink ${wineDisplayName(wine.producer, wine.name)}`}
                title="Tap to mark consumed, hold to set the date and add a note"
                className="h-10 w-10 shrink-0 rounded-full bg-primary-container text-on-primary hover:bg-primary disabled:opacity-50 transition-colors"
              >
                <WineIcon size={16} aria-hidden="true" />
              </HoldButton>
            )}
          </div>

          {/* Ordered by how much they matter: quality, then readiness,
              then grape. The varietal used to be the widest and loudest
              chip of the three. */}
          <div className="flex flex-wrap items-center gap-2">
            <TierBadge tier={wine.tier} />
            <span
              className={`px-3 py-1 text-[10px] font-bold tracking-wider uppercase whitespace-nowrap rounded-full bg-surface-container-high ${drinkingColor}`}
            >
              {drinkingStatus}
            </span>
            {grape && (
              <span className="px-3 py-1 text-[10px] font-medium tracking-wider uppercase text-outline truncate max-w-[45%]">
                {grape}
              </span>
            )}
          </div>

          {/* Footer sits at the card's foot whatever the name's length,
              so a grid of cards lines up along the bottom */}
          <div className="mt-auto pt-3 border-t border-outline-variant/60 flex justify-between items-center">
            <LocationBadge wine={wine} />
            <span className="text-[10px] text-outline font-bold tracking-widest uppercase">
              {wine.format}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
