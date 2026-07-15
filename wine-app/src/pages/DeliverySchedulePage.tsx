import { useState } from 'react'
import { useWineStore } from '../store/wineStore'
import { useDeliverySchedule } from '../hooks/useDeliverySchedule'
import MessageModal from '../components/MessageModal'

export default function DeliverySchedulePage() {
  const wines = useWineStore(state => state.wines)
  const { schedule: deliverySchedule, error: scheduleError, cellarCapacity, promoteWine, deferWine, confirmDelivery } =
    useDeliverySchedule()

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
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

  const flashMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    if (type === 'success') {
      setTimeout(() => setMessage(null), 3000)
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

      {/* Cellar Capacity Overview */}
      <div className="bg-surface-container-low p-6 rounded-lg mb-6">
        <h2 className="text-xl font-bold mb-4">Home Cellar Capacity</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-outline text-sm">Currently at Home</p>
            <p className="text-3xl font-bold text-primary">{currentWinesAtHome}</p>
          </div>
          <div>
            <p className="text-outline text-sm">Capacity</p>
            <p className="text-3xl font-bold text-on-surface">{cellarCapacity}</p>
          </div>
          <div>
            <p className="text-outline text-sm">Available Space</p>
            <p className={`text-3xl font-bold ${availableCapacity > 0 ? 'text-success' : 'text-error'}`}>
              {availableCapacity}
            </p>
          </div>
        </div>
      </div>

      {/* Delivery Schedule */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-on-surface mb-4">Upcoming Deliveries</h2>

        {scheduleError && (
          <div className="bg-surface-container-low p-6 rounded-lg text-center">
            <p className="text-error">Failed to generate delivery schedule: {scheduleError}</p>
          </div>
        )}

        {!scheduleError && deliverySchedule.length === 0 ? (
          <div className="bg-surface-container-low p-6 rounded-lg text-center">
            <p className="text-outline">No deliveries scheduled</p>
          </div>
        ) : (
          deliverySchedule.map(delivery => {
            const isCollapsed = collapsedDeliveries.has(delivery.date)
            const totalBottles = delivery.wines.reduce((sum, w) => sum + w.quantity, 0)
            const totalWines = delivery.wines.length

            return (
              <div key={delivery.date} className="bg-surface-container rounded-lg border border-outline-variant overflow-hidden">
                <button
                  onClick={() => toggleCollapse(delivery.date)}
                  className="w-full p-4 flex justify-between items-center hover:bg-surface-container-high transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="material-symbols-outlined text-outline text-sm transition-transform duration-200"
                      style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                    >
                      expand_more
                    </span>
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
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded text-sm font-medium ${
                      delivery.status === 'completed' ? 'bg-success/20 text-success' :
                      delivery.status === 'in_transit' ? 'bg-warning/20 text-warning' :
                      'bg-primary/20 text-primary'
                    }`}>
                      {delivery.status}
                    </span>
                    {delivery.locked && (
                      <span className="px-3 py-1 rounded text-sm bg-outline/20 text-outline">
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
                          <div key={wine.id} className="bg-surface p-3 rounded border border-outline-variant text-sm">
                            <div className="flex justify-between items-start gap-2">
                              <div className="min-w-0">
                                <p className="font-semibold text-on-surface">
                                  {wine.producer} {wine.name}
                                </p>
                                <p className="text-outline text-xs">
                                  {wine.vintage} • Qty: {wine.quantity} {wine.format || '750ml'}
                                </p>
                              </div>
                              {canModify && (
                                <div className="shrink-0">
                                  {isFirstDelivery ? (
                                    <button
                                      onClick={() => handleDeferWine(wine.id, delivery.date, `${wine.producer} ${wine.name}`)}
                                      disabled={isDelaying || delivery.wines.length <= 1}
                                      className="px-2 py-1 bg-surface-container-high text-on-surface rounded text-xs font-medium hover:bg-outline/20 transition-colors disabled:opacity-50 whitespace-nowrap"
                                      title="Defer this wine to a future delivery"
                                    >
                                      {isDelaying ? '...' : 'Defer'}
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handlePromoteWine(wine.id, wine.quantity, `${wine.producer} ${wine.name}`)}
                                      disabled={isPromoting}
                                      className="px-2 py-1 bg-primary text-on-primary rounded text-xs font-medium hover:opacity-90 transition-colors disabled:opacity-50 whitespace-nowrap"
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
                        className="w-full px-4 py-2 bg-primary text-on-primary rounded font-medium hover:opacity-90"
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
