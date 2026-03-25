import type { Wine } from '../types/index'
import { TIER_LABELS } from '../types/index'
import { WineService } from '../services/wine.service'

interface WineCardProps {
  wine: Wine
  onSelect: (wine: Wine) => void
  onConsume: (wineId: string) => Promise<void>
  isLoading?: boolean
}

export default function WineCard({ wine, onSelect, onConsume, isLoading }: WineCardProps) {
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

  const handleConsume = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (wine.quantity === 0) return
    try {
      await onConsume(wine.id)
    } catch (error) {
      alert(`Error: ${(error as Error).message}`)
    }
  }

  return (
    <div
      onClick={() => onSelect(wine)}
      className="relative group cursor-pointer"
    >
      <div className="bg-surface-container-low p-6 pt-0 rounded-xl transition-all duration-300 hover:bg-surface-container h-full flex flex-col">
        {/* Bottle Image */}
        <div className="relative -mt-12 mb-6 flex justify-center h-80">
          {wine.image_url ? (
            <img
              alt={`${wine.producer} ${wine.name}`}
              className="h-full object-contain drop-shadow-[0_20px_20px_rgba(0,0,0,0.6)] group-hover:scale-105 transition-transform duration-500"
              src={wine.image_url}
            />
          ) : (
            <div className="h-full w-24 bg-surface-container rounded flex items-center justify-center opacity-50">
              <span className="material-symbols-outlined text-3xl text-outline">wine_bar</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 space-y-4">
          {/* Header */}
          <div className="flex justify-between items-start">
            <div>
              <span className="text-primary text-xs font-bold tracking-[0.2em] uppercase">
                {wine.country}, {wine.region}
              </span>
              <h3 className="font-headline text-2xl mt-1 text-on-surface leading-tight">
                {wine.producer}
              </h3>
              <p className="text-outline text-sm font-light">{wine.name}</p>
            </div>
            <button
              onClick={handleConsume}
              disabled={wine.quantity === 0 || isLoading}
              title={wine.quantity === 0 ? 'No bottles available' : 'Mark as consumed'}
              className="w-10 h-10 flex items-center justify-center rounded-lg bg-surface-container-highest text-outline-variant hover:text-error disabled:opacity-50 transition-colors"
            >
              <span className="material-symbols-outlined">wine_bar</span>
            </button>
          </div>

          {/* Tier & Details Badges */}
          <div className="flex flex-wrap gap-2 pt-2">
            <span className={`${tierBgColor} px-3 py-1 text-[10px] font-black tracking-widest uppercase whitespace-nowrap rounded-sm shadow-sm`}>
              {tierLabel}
            </span>
            <span className="bg-surface-container-high px-3 py-1 text-[10px] font-bold tracking-tighter text-on-surface-variant uppercase whitespace-nowrap">
              {wine.varietal.split(':')[0].trim()}
            </span>
            <span className={`bg-surface-container-high px-3 py-1 text-[10px] font-bold tracking-tighter uppercase whitespace-nowrap ${drinkingColor}`}>
              {drinkingStatus}
            </span>
          </div>

          {/* Footer Stats */}
          <div className="pt-4 border-t border-outline-variant/10 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary scale-90" style={{ fontVariationSettings: "'FILL' 1, 'wght' 400" }}>
                liquor
              </span>
              <span className="text-xs text-on-surface/80 font-medium">
                {wine.quantity} {wine.quantity === 1 ? 'Bottle' : 'Bottles'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 bg-surface-container-highest px-2 py-1 rounded text-[10px] text-outline font-bold tracking-widest uppercase">
              <span className="text-primary">●</span>
              {wine.format}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
