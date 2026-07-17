import { useEffect, useState } from 'react'
import type { Wine, ConsumptionLogEntry } from '../types/index'
import { TIER_LABELS } from '../types/index'
import WineInfo from './WineInfo'
import LocationBadge from './LocationBadge'
import { wineDisplayName } from '../services/wine.service'
import { X, Wine as WineIcon, Minus, Plus } from 'lucide-react'

interface WineDetailPanelProps {
  wine: Wine
  onClose: () => void
  onConsume: (wineId: string) => Promise<void>
  onMoveToHome: (wineId: string, quantity: number) => Promise<void>
  onEdit: (wine: Wine) => void
  onDelete: (wineId: string) => Promise<void>
  isLoading?: boolean
  scheduledDeliveryDate?: string
  consumptionLog?: ConsumptionLogEntry[]
}

export default function WineDetailPanel({
  wine,
  onClose,
  onConsume,
  onMoveToHome,
  onEdit,
  onDelete,
  isLoading,
  scheduledDeliveryDate,
  consumptionLog,
}: WineDetailPanelProps) {
  const tierLabel = TIER_LABELS[wine.tier]
  const criticRatings: Record<string, number> = typeof wine.critic_ratings === 'string'
    ? JSON.parse(wine.critic_ratings || '{}')
    : (wine.critic_ratings || {})
  const totalBottles = wine.quantity_in_storage + wine.quantity_at_home

  // Bottles to bring home in one action; defaults to everything in storage.
  // Render-time reset (not an effect) whenever the wine or its storage
  // count changes, per React's "adjusting state on prop change" pattern.
  const [moveQuantity, setMoveQuantity] = useState(Math.max(1, wine.quantity_in_storage))
  const stepperKey = `${wine.id}:${wine.quantity_in_storage}`
  const [lastStepperKey, setLastStepperKey] = useState(stepperKey)
  if (lastStepperKey !== stepperKey) {
    setLastStepperKey(stepperKey)
    setMoveQuantity(Math.max(1, wine.quantity_in_storage))
  }

  // Escape closes the panel, matching the backdrop click
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const handleConsume = async () => {
    try {
      await onConsume(wine.id)
      if (wine.quantity_at_home <= 1) {
        onClose()
      }
    } catch {
      // Feedback (toast/alert) is the caller's responsibility
    }
  }

  const handleMoveToHome = async () => {
    try {
      await onMoveToHome(wine.id, moveQuantity)
    } catch (error) {
      alert(`Error: ${(error as Error).message}`)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Delete "${wineDisplayName(wine.producer, wine.name)} ${wine.vintage}"? This cannot be undone.`)) {
      return
    }
    try {
      await onDelete(wine.id)
      onClose()
    } catch (error) {
      alert(`Error: ${(error as Error).message}`)
    }
  }

  return (
    <>
      {/* Backdrop: click anywhere outside the panel to dismiss */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className="fixed inset-0 bg-black/40 z-40"
        data-testid="panel-backdrop"
      />
      <aside className="fixed inset-y-0 right-0 w-full md:w-[480px] bg-surface z-50 shadow-2xl flex flex-col transform transition-transform duration-500 glass-panel border-l border-[#504532]/10 overflow-y-auto">
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close panel"
          className="absolute top-4 right-6 text-[#9C8F78] hover:text-on-surface z-10"
        >
          <X size={28} />
        </button>

        <div className="p-8 pt-20 md:pt-14 space-y-10">
          {/* Hero Bottle */}
          <div className="relative group">
            <div className="absolute -top-12 -left-8 font-headline text-[10rem] opacity-5 font-bold select-none">
              {wine.vintage}
            </div>
            <div className="flex justify-center">
              {wine.image_url ? (
                <img
                  alt={wineDisplayName(wine.producer, wine.name)}
                  loading="lazy"
                  decoding="async"
                  className="w-64 h-auto object-contain drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)] transform hover:scale-105 transition-transform duration-700"
                  src={wine.image_url}
                />
              ) : (
                <div className="w-full h-24 bg-surface-container rounded-2xl flex items-center justify-center opacity-50">
                  <WineIcon size={32} className="text-outline" aria-hidden="true" />
                </div>
              )}
            </div>
          </div>

          {/* Header Info */}
          <div className="space-y-3">
            <div className="flex flex-col gap-1 text-primary-container font-label text-xs tracking-[0.2em] font-bold uppercase">
              <span className="opacity-80">
                {wine.region}, {wine.country}
              </span>
            </div>
            <WineInfo
              wine={wine}
              producerSize="2xl"
              nameSize="base"
              classificationSize="sm"
              showClassification={true}
              layout="vertical"
            />
          </div>

          {/* Scores */}
          {Object.keys(criticRatings).length > 0 && (
            <div className="flex gap-4">
              {Object.entries(criticRatings).slice(0, 2).map(([critic, score]) => (
                <div
                  key={critic}
                  className="flex-1 bg-surface-container-low p-5 rounded-xl border-l-2 border-primary-container"
                >
                  <p className="text-[10px] text-outline tracking-widest uppercase mb-1">
                    {critic.toUpperCase()}
                  </p>
                  <p className="font-headline text-3xl font-bold text-on-surface">{score}</p>
                </div>
              ))}
            </div>
          )}

          {/* Critic Notes */}
          {wine.notes && (
            <div className="space-y-4">
              <h3 className="font-headline text-xl font-bold border-b border-outline-variant/20 pb-2">
                Critic Note
              </h3>
              <p className="font-body text-sm leading-relaxed text-secondary opacity-80">
                {wine.notes}
              </p>
            </div>
          )}

          {/* Key Details Grid */}
          <div className="grid grid-cols-2 gap-y-4 pt-4 border-t border-outline-variant/10">
            <div>
              <p className="text-[10px] text-outline uppercase tracking-wider">Optimal Window</p>
              <p className="text-sm font-medium">
                {wine.drinking_window_start} — {wine.drinking_window_end}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-outline uppercase tracking-wider">Serving Temp</p>
              <p className="text-sm font-medium">
                {wine.serving_temp_min}°C — {wine.serving_temp_max}°C
              </p>
            </div>
            <div>
              <p className="text-[10px] text-outline uppercase tracking-wider">Varietal</p>
              <p className="text-sm font-medium">{wine.varietal}</p>
            </div>
            <div>
              <p className="text-[10px] text-outline uppercase tracking-wider">Alcohol</p>
              <p className="text-sm font-medium">{wine.alcohol_percent}% ABV</p>
            </div>
            {typeof wine.purchase_price === 'number' && wine.purchase_price > 0 && (
            <div>
              <p className="text-[10px] text-outline uppercase tracking-wider">Purchase Price</p>
              <p className="text-sm font-medium">
                £{wine.purchase_price.toLocaleString()} <span className="text-outline">/ bottle</span>
              </p>
            </div>
          )}
          {scheduledDeliveryDate && (
              <div>
                <p className="text-[10px] text-outline uppercase tracking-wider">
                  {new Date(scheduledDeliveryDate) <= new Date() ? 'Delivered' : 'Scheduled Delivery'}
                </p>
                <p className="text-sm font-medium">
                  {new Date(scheduledDeliveryDate).toLocaleDateString('en-US', {
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>
            )}
          </div>

          {/* Flavor Profile */}
          {wine.flavor_profile && (
            <div className="space-y-3">
              <h3 className="font-headline text-xl font-bold">Flavor Profile</h3>
              <div className="flex flex-wrap gap-2">
                {wine.flavor_profile.split(':').map((flavor, idx) => (
                  <span
                    key={idx}
                    className="bg-surface-container-high px-3 py-1 text-xs rounded-full text-on-surface-variant border border-outline-variant/20"
                  >
                    {flavor.trim()}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tier & Inventory */}
          <div className="flex items-center gap-2 pt-4 border-t border-outline-variant/10">
            <span className="text-[10px] text-outline uppercase tracking-wider">Tier</span>
            <span className="bg-primary-container text-on-primary-fixed-variant px-3 py-1 text-xs font-bold tracking-widest uppercase rounded-sm">
              {tierLabel}
            </span>
            <div className="ml-auto flex items-center gap-3">
              <LocationBadge wine={wine} />
              <span className="text-[10px] text-outline uppercase tracking-wider">
                {totalBottles} {totalBottles === 1 ? 'Bottle' : 'Bottles'}
              </span>
            </div>
          </div>

          {/* Consumption History */}
          {consumptionLog && consumptionLog.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-headline text-xl font-bold">Consumption History</h3>
              <ul className="space-y-2">
                {consumptionLog.slice(0, 3).map(entry => (
                  <li key={entry.id} className="flex items-baseline gap-3 text-sm">
                    <span className="text-on-surface font-medium whitespace-nowrap">
                      {new Date(entry.consumed_date).toLocaleDateString('en-US', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                    {entry.notes && <span className="text-outline italic truncate">{entry.notes}</span>}
                  </li>
                ))}
                {consumptionLog.length > 3 && (
                  <li className="text-xs text-outline">
                    + {consumptionLog.length - 3} more
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="pt-6 pb-12 flex flex-col gap-3">
            {wine.quantity_at_home > 0 && (
              <button
                onClick={handleConsume}
                disabled={isLoading}
                className="btn-primary w-full disabled:opacity-50"
              >
                Extract Bottle
              </button>
            )}

            {wine.quantity_in_storage > 0 && (
              <div className="flex items-stretch gap-2">
                <div className="flex items-center rounded-full border border-outline-variant/30">
                  <button
                    onClick={() => setMoveQuantity(q => Math.max(1, q - 1))}
                    disabled={isLoading || moveQuantity <= 1}
                    aria-label="Fewer bottles"
                    className="px-3 self-stretch text-outline-variant hover:text-on-surface disabled:opacity-40"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="w-8 text-center text-sm font-bold" data-testid="move-quantity">
                    {moveQuantity}
                  </span>
                  <button
                    onClick={() => setMoveQuantity(q => Math.min(wine.quantity_in_storage, q + 1))}
                    disabled={isLoading || moveQuantity >= wine.quantity_in_storage}
                    aria-label="More bottles"
                    className="px-3 self-stretch text-outline-variant hover:text-on-surface disabled:opacity-40"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <button
                  onClick={handleMoveToHome}
                  disabled={isLoading}
                  className="btn-primary flex-1 disabled:opacity-50"
                >
                  Move to Home
                </button>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => onEdit(wine)}
                disabled={isLoading}
                className="flex-1 border border-outline-variant/30 text-outline-variant hover:text-outline py-3 text-xs tracking-widest uppercase font-bold rounded-full disabled:opacity-50 transition-colors"
              >
                Edit
              </button>
              <button
                onClick={handleDelete}
                disabled={isLoading}
                className="flex-1 border border-red-500/30 text-red-400 hover:text-red-300 hover:border-red-500/50 py-3 text-xs tracking-widest uppercase font-bold rounded-full disabled:opacity-50 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
