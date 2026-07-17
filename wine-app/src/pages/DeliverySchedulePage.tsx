import { useState } from 'react'
import { useWineStore } from '../store/wineStore'
import { useDeliverySchedule } from '../hooks/useDeliverySchedule'
import MessageModal from '../components/MessageModal'
import { wineDisplayName } from '../services/wine.service'
import { useToastStore } from '../store/toastStore'
import { ChevronDown, Lock } from 'lucide-react'

export default function DeliverySchedulePage() {
  const wines = useWineStore(state => state.wines)
  const { schedule: deliverySchedule, error: scheduleError, cellarCapacity, promoteWine, deferWine, confirmDelivery } =
    useDeliverySchedule()

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const showToast = useToastStore(state => state.show)
  const [isPromoting, setIsPromoting] = useState(false)
  const [isDelaying, setIsDelaying] = useState(false)
  const [collapsedDeliveries, setCollapsedDeliveries] = useState<Set<string>>(new Set())

  const currentWinesAtHome = wines.reduce((sum, w) => sum + w.quantity_at_home, 0)

  const toggleCollapse = (date: string) => {
    setCollapsedDeliveries(prev => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  // Successes are non-blocking toasts; errors stay as a modal that must
  // be acknowledged before continuing to curate.
  const flashMessage = (type: 'success' | 'error', text: string) => {
    if (type === 'success') {
      showToast(text)
    } else {
      setMessage({ type, text })
    }
  }

  const handlePromoteWine = async (wineId: string, quantity: number, wineName: string) => {
    setIsPromoting(true)
    try {
      await promoteWine(wineId, quantity)
      flashMessage('success', `${wineName} promoted to next delivery`)
    } catch (error) {
      flashMessage('error', `Failed to promote: ${(error as Error).message}`)
    } finally {
      setIsPromoting(false)
    }
  }

  const handleDeferWine = async (wineId: string, date: string, wineName: string) => {
    setIsDelaying(true)
    try {
      await deferWine(wineId, date)
      flashMessage('success', `${wineName} deferred to a future delivery`)
    } catch (error) {
      flashMessage('error', `Failed to defer: ${(error as Error).message}`)
    } finally {
      setIsDelaying(false)
    }
  }

  const handleConfirmDelivery = async (date: string) => {
    try {
      await confirmDelivery(date)
      flashMessage('success', `Delivery for ${date} confirmed`)
    } catch (error) {
      flashMessage('error', `Failed to confirm delivery: ${(error as Error).message}`)
    }
  }

  const availableCapacity = cellarCapacity - currentWinesAtHome

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="font-headline text-4xl font-bold mb-6 text-on-surface">Delivery Schedule</h1>

      {/* Compact capacity strip: bottles at home / capacity, space left */}
      <div
        className="flex items-center gap-3 mb-8"
        role="meter"
        aria-valuenow={currentWinesAtHome}
        aria-valuemin={0}
        aria-valuemax={cellarCapacity}
        aria-label="Home cellar capacity"
        title={`${currentWinesAtHome} bottles at home of ${cellarCapacity} capacity`}
      >
        <div
          className="relative h-2.5 flex-1 rounded-full overflow-hidden"
          style={{ backgroundColor: 'rgba(255, 191, 0, 0.14)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${cellarCapacity > 0 ? Math.min(100, (currentWinesAtHome / cellarCapacity) * 100) : 0}%`,
              backgroundColor: availableCapacity <= cellarCapacity * 0.05 ? '#e66767' : '#ffbf00',
            }}
          />
        </div>
        <p className="text-sm whitespace-nowrap">
          <span className="font-semibold text-on-surface">{currentWinesAtHome}</span>
          <span className="text-outline"> / {cellarCapacity}</span>
          <span className={`ml-2 ${availableCapacity > 0 ? 'text-outline' : 'text-error'}`}>
            {availableCapacity} free
          </span>
        </p>
      </div>

      {/* Delivery Schedule */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-on-surface mb-4">Upcoming Deliveries</h2>

        {scheduleError && (
          <div className="bg-surface-container-low p-6 rounded-2xl text-center">
            <p className="text-error">Failed to generate delivery schedule: {scheduleError}</p>
          </div>
        )}

        {!scheduleError && deliverySchedule.length === 0 ? (
          <div className="bg-surface-container-low p-6 rounded-2xl text-center">
            <p className="text-outline">No deliveries scheduled</p>
          </div>
        ) : (
          deliverySchedule.map(delivery => {
            const isCollapsed = collapsedDeliveries.has(delivery.date)
            const totalBottles = delivery.wines.reduce((sum, w) => sum + w.quantity, 0)
            const totalWines = delivery.wines.length

            return (
              <div key={delivery.date} className="bg-surface-container rounded-2xl border border-outline-variant/40 overflow-hidden">
                <button
                  onClick={() => toggleCollapse(delivery.date)}
                  className="w-full p-4 flex justify-between items-center hover:bg-surface-container-high transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <ChevronDown
                      size={16}
                      aria-hidden="true"
                      className="text-outline transition-transform duration-200"
                      style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                    />
                    <div>
                      <h3 className="text-lg font-bold text-on-surface">
                        {new Date(delivery.date).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </h3>
                      <p className="text-xs text-outline mt-0.5">
                        {totalWines} {totalWines === 1 ? 'wine' : 'wines'} · {totalBottles} {totalBottles === 1 ? 'bottle' : 'bottles'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {/* Read-only status, styled to not look tappable */}
                    <span className="flex items-center gap-1.5 text-xs text-outline">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          delivery.status === 'completed' ? 'bg-success' :
                          delivery.status === 'in_transit' ? 'bg-warning' :
                          'bg-primary-container'
                        }`}
                        aria-hidden="true"
                      />
                      {delivery.status === 'completed' ? 'Delivered' :
                        delivery.status === 'in_transit' ? 'In transit' : 'Planned'}
                    </span>
                    {delivery.locked && delivery.status !== 'completed' && (
                      <span
                        className="flex items-center gap-1 text-xs text-outline"
                        title="You have customised this delivery (promoted or deferred wines), so regeneration keeps it as-is"
                      >
                        <Lock size={11} aria-hidden="true" />
                        Curated
                      </span>
                    )}
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="px-4 pb-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                      {delivery.wines.map(wine => {
                        const firstUpcoming = deliverySchedule.find(d => d.status !== 'completed')
                        const isFirstDelivery = delivery.date === firstUpcoming?.date
                        const canModify = delivery.status !== 'completed'

                        return (
                          <div key={wine.id} className="bg-surface p-3 rounded-xl border border-outline-variant/40 text-sm">
                            <div className="flex justify-between items-start gap-2">
                              <div className="min-w-0">
                                <p className="font-semibold text-on-surface">
                                  {wineDisplayName(wine.producer, wine.name)}
                                </p>
                                <p className="text-outline text-xs">
                                  {wine.vintage} • Qty: {wine.quantity} {wine.format || '750ml'}
                                </p>
                              </div>
                              {canModify && (
                                <div className="shrink-0">
                                  {isFirstDelivery ? (
                                    <button
                                      onClick={() => handleDeferWine(wine.id, delivery.date, wineDisplayName(wine.producer, wine.name))}
                                      disabled={isDelaying || delivery.wines.length <= 1}
                                      className="px-3 py-1.5 bg-surface-container-high text-on-surface rounded-full text-xs font-medium hover:bg-outline/20 transition-colors disabled:opacity-50 whitespace-nowrap"
                                      title="Defer this wine to a future delivery"
                                    >
                                      {isDelaying ? '...' : 'Defer'}
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handlePromoteWine(wine.id, wine.quantity, wineDisplayName(wine.producer, wine.name))}
                                      disabled={isPromoting}
                                      className="px-3 py-1.5 bg-primary text-on-primary rounded-full text-xs font-medium hover:opacity-90 transition-colors disabled:opacity-50 whitespace-nowrap"
                                      title="Promote to next delivery"
                                    >
                                      {isPromoting ? '...' : 'Promote'}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {delivery.status !== 'completed' && (
                      <button
                        onClick={() => handleConfirmDelivery(delivery.date)}
                        className="w-full px-4 py-2.5 bg-primary text-on-primary rounded-full font-medium hover:opacity-90"
                      >
                        Confirm Delivery
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {message && <MessageModal type={message.type} text={message.text} onClose={() => setMessage(null)} />}
    </div>
  )
}
