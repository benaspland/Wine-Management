import type { Wine } from '../types/index'
import { TIER_LABELS } from '../types/index'
import { WineService } from '../services/wine.service'
import WineInfo from './WineInfo'
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
    drinkingStatus === 'Ready to Drink' ? 'text-primary' :
    drinkingStatus.includes('Wait') ? 'text-outline' :
    drinkingStatus === 'Peak' ? 'text-primary' :
    'text-outline'

  const tierLabel = TIER_LABELS[wine.tier]
  const tierBgColor =
    wine.tier === 5 ? 'bg-primary-container text-on-primary-fixed-variant' :
    wine.tier === 4 ? 'bg-on-surface text-surface' :
    wine.tier === 3 ? 'border border-primary/40 text-primary' :
    'bg-surface-container-high text-on-surface-variant'

  const handleConsume = () => {
    if (wine.quantity_at_home === 0) return
    void onConsume(wine.id)
  }

  const handleConsumeDetailed = () => {
    if (wine.quantity_at_home === 0) return
    onConsumeDetailed(wine)
  }

  return (
    <div
      onClick={() => onSelect(wine)}
      className="relative group cursor-pointer"
    >
      <div className={`bg-surface-container-low p-6 rounded-2xl transition-all duration-300 hover:bg-surface-container h-full flex flex-col ${wine.image_url ? 'pt-0' : ''}`}>
        {/* Bottle image only when one exists — a 320px placeholder box per
            wine was the biggest scroll cost in the grid. Kept modest for
            the same reason: a label photo at 320px pushed the wine's own
            name off the screen, so the picture arrived before the thing
            it belongs to. */}
        {wine.image_url && (
          <div className="relative -mt-6 mb-4 flex justify-center h-44">
            <img
              alt={wineDisplayName(wine.producer, wine.name)}
              loading="lazy"
              decoding="async"
              className="h-full object-contain drop-shadow-[0_20px_20px_rgba(0,0,0,0.6)] group-hover:scale-105 transition-transform duration-500"
              src={wine.image_url}
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 space-y-4">
          {/* Header */}
          <div className="flex justify-between items-start gap-3">
            <div className="flex-1 min-w-0">
              <span className="text-primary text-xs font-bold tracking-[0.2em] uppercase">
                {wine.country}, {wine.region}
              </span>
              <div className="mt-1">
                <WineInfo
                  wine={wine}
                  producerSize="2xl"
                  nameSize="sm"
                  classificationSize="xs"
                  showClassification={true}
                  layout="vertical"
                />
              </div>
            </div>
            {/* Hidden rather than disabled when nothing is at home: a
                greyed-out control invites taps and explains nothing */}
            {wine.quantity_at_home > 0 && (
              <HoldButton
                onTap={handleConsume}
                onHold={handleConsumeDetailed}
                progressStyle="fill"
                progressColor="rgba(255, 191, 0, 0.3)"
                disabled={isLoading}
                aria-label={`Drink ${wineDisplayName(wine.producer, wine.name)}`}
                title="Tap to mark consumed, hold to set the date and add a note"
                className="min-h-11 shrink-0 px-3.5 rounded-full bg-surface-container-highest text-on-surface-variant text-xs font-bold tracking-widest uppercase hover:bg-primary-container hover:text-on-primary disabled:opacity-40 transition-colors"
              >
                <WineIcon size={16} aria-hidden="true" />
                Drink
              </HoldButton>
            )}
          </div>

          {/* Tier & Details Badges */}
          <div className="flex flex-wrap gap-2 pt-2">
            <span className={`${tierBgColor} px-3 py-1 text-[10px] font-black tracking-widest uppercase whitespace-nowrap rounded-full shadow-sm`}>
              {tierLabel}
            </span>
            <span className="bg-surface-container-high px-3 py-1 text-[10px] font-bold tracking-tighter text-on-surface-variant uppercase whitespace-nowrap rounded-full">
              {wine.varietal ? wine.varietal.split(':')[0].trim() : 'Unknown'}
            </span>
            <span className={`bg-surface-container-high px-3 py-1 text-[10px] font-bold tracking-tighter uppercase whitespace-nowrap rounded-full ${drinkingColor}`}>
              {drinkingStatus}
            </span>
          </div>

          {/* Footer: where the bottles are */}
          <div className="pt-4 border-t border-outline-variant/10 flex justify-between items-center">
            <LocationBadge wine={wine} />
            <div className="flex items-center gap-1.5 bg-surface-container-highest px-2 py-1 rounded-full text-[10px] text-outline font-bold tracking-widest uppercase">
              <span className="text-primary">●</span>
              {wine.format}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
