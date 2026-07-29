import type { Wine } from '../types/index'
import { TIER_LABELS } from '../types/index'
import { WineService } from '../services/wine.service'
import LocationBadge from './LocationBadge'
import { wineDisplayName } from '../services/wine.service'
import { Wine as WineIcon } from 'lucide-react'
import HoldButton from './HoldButton'

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
        ? 'text-[#e0a03c]'
        : 'text-outline'

  const tierLabel = TIER_LABELS[wine.tier]
  const tierStyle =
    wine.tier === 5 ? 'bg-primary-container text-on-primary-fixed-variant' :
    wine.tier === 4 ? 'bg-on-surface text-surface' :
    wine.tier === 3 ? 'border border-primary/40 text-primary' :
    'bg-surface-container-high text-on-surface-variant'

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
      <div className="bg-surface-container-low rounded-2xl overflow-hidden h-full flex flex-col transition-colors duration-300 hover:bg-surface-container">
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
              className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/20 to-[#1c1b1b]"
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
              which made the place louder than the thing. */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {/* Sans, not the headline serif: serif is this app's
                  chrome — page titles and section headings — while the
                  data itself is set in Inter, as the list and detail
                  panel already do */}
              <h3 className="text-lg font-semibold leading-tight text-on-surface">
                {wineDisplayName(wine.producer, wine.name)}
              </h3>
              <p className="text-xs text-outline mt-1">
                {wine.vintage} · {wine.region}
                {wine.country ? `, ${wine.country}` : ''}
              </p>
              {wine.classification && wine.classification !== '-' && (
                <p className="text-xs text-outline-variant italic opacity-70 mt-0.5">
                  {wine.classification}
                </p>
              )}
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
            <span
              className={`${tierStyle} px-3 py-1 text-[10px] font-black tracking-widest uppercase whitespace-nowrap rounded-full`}
            >
              {tierLabel}
            </span>
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
          <div className="mt-auto pt-3 border-t border-outline-variant/10 flex justify-between items-center">
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
