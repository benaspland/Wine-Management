import { useState } from 'react'
import { useWineStore } from '../store/wineStore'
import { useDeliverySchedule } from '../hooks/useDeliverySchedule'
import MessageModal from '../components/MessageModal'
import { wineDisplayName, formatDeliveryMonth } from '../services/wine.service'
import { useToastStore } from '../store/toastStore'
import { ChevronDown, Lock } from 'lucide-react'
import PageHeading from '../components/PageHeading'
import DeliveryStatusBadge, { type DeliveryState } from '../components/DeliveryStatusBadge'

export default function DeliverySchedulePage() {
  const wines = useWineStore(state => state.wines)
  const { schedule: deliverySchedule, error: scheduleError, cellarCapacity, promoteWine, deferWine, confirmDelivery } =
    useDeliverySchedule()

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const showToast = useToastStore(state => state.show)
  const [isPromoting, setIsPromoting] = useState(false)
  const [isDelaying, setIsDelaying] = useState(false)
  /**
   * Dates the user has opened or shut *against* the default.
   *
   * Storing the exception rather than the state itself means the
   * defaults keep applying as the schedule moves: confirm the next
   * delivery and the one behind it opens on its own, without a stale
   * "collapsed" entry holding it shut.
   */
  const [flipped, setFlipped] = useState<Set<string>>(new Set())

  const currentWinesAtHome = wines.reduce((sum, w) => sum + w.quantity_at_home, 0)

  const toggleCollapse = (date: string) => {
    setFlipped(prev => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  /**
   * The next delivery is the earliest one not yet confirmed.
   *
   * Derived from position, not from the date: a delivery whose date has
   * passed but which you never confirmed is still the next thing to
   * deal with, and calling it complete would say something that hasn't
   * happened. The list is in date order, so everything after the first
   * unconfirmed entry is simply Planned — which is why "next up" can
   * never sit below a "planned" card.
   */
  const nextUpDate = deliverySchedule.find(d => d.status !== 'completed')?.date

  const stateOf = (delivery: { date: string; status: string }): DeliveryState =>
    delivery.status === 'completed' ? 'complete' : delivery.date === nextUpDate ? 'next' : 'planned'

  /** Only the next delivery opens by default; the rest are a list of dates. */
  const isExpanded = (delivery: { date: string; status: string }) =>
    (stateOf(delivery) === 'next') !== flipped.has(delivery.date)

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
    <div className="px-6 max-w-6xl mx-auto py-8">
      <PageHeading title="Delivery Schedule" />

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
        {/* Accent on a muted track, like the dashboard's storage split.
            A full cellar used to turn the whole bar red, which reads as
            a fault rather than a fact — the cellar being full is the
            plan working. The count beside it carries that news instead,
            in a word rather than by alarming the chart. */}
        <div className="relative h-2.5 flex-1 rounded-full overflow-hidden bg-surface-container-highest">
          <div
            className="h-full rounded-full bg-primary-container transition-all duration-500"
            style={{
              width: `${cellarCapacity > 0 ? Math.min(100, (currentWinesAtHome / cellarCapacity) * 100) : 0}%`,
            }}
          />
        </div>
        <p className="text-sm whitespace-nowrap">
          <span className="font-semibold text-on-surface">{currentWinesAtHome}</span>
          <span className="text-outline"> / {cellarCapacity}</span>
          <span
            className={`ml-2 ${
              availableCapacity <= 0
                ? 'text-error'
                : availableCapacity <= cellarCapacity * 0.05
                  ? 'text-warning'
                  : 'text-outline'
            }`}
          >
            {availableCapacity > 0 ? `${availableCapacity} free` : 'full'}
          </span>
        </p>
      </div>

      {/* Delivery Schedule */}
      <div className="space-y-4">
        {/* Not "Upcoming" any more: a delivery already in the house is
            listed too, above the ones still to come. */}
        <h3 className="font-headline text-xl font-bold text-on-surface mb-4">Deliveries</h3>

        {scheduleError && (
          <div className="panel p-6 text-center">
            <p className="text-error">Failed to generate delivery schedule: {scheduleError}</p>
          </div>
        )}

        {!scheduleError && deliverySchedule.length === 0 ? (
          <div className="panel p-6 text-center">
            <p className="text-outline">No deliveries scheduled</p>
          </div>
        ) : (
          deliverySchedule.map(delivery => {
            const state = stateOf(delivery)
            const expanded = isExpanded(delivery)
            const totalBottles = delivery.wines.reduce((sum, w) => sum + w.quantity, 0)
            const totalWines = delivery.wines.length

            return (
              <div
                key={delivery.date}
                /* Three states, told by the edge and the weight of the
                   card rather than by a dot of colour: done and faded,
                   next and outlined in accent, or simply on the list. */
                className={`panel overflow-hidden ${
                  state === 'complete'
                    ? 'opacity-[0.55]'
                    : state === 'next'
                      ? 'panel-accent'
                      : ''
                }`}
              >
                <button
                  onClick={() => toggleCollapse(delivery.date)}
                  aria-expanded={expanded}
                  className="w-full p-4 flex justify-between items-center gap-3 hover:bg-surface-container-high transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <ChevronDown
                      size={16}
                      aria-hidden="true"
                      className="shrink-0 text-outline transition-transform duration-200"
                      style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                    />
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold text-on-surface">
                        {formatDeliveryMonth(delivery.date)}
                      </h3>
                      <p className="text-xs text-outline mt-0.5">
                        {totalWines} {totalWines === 1 ? 'wine' : 'wines'} · {totalBottles} {totalBottles === 1 ? 'bottle' : 'bottles'}
                        {delivery.locked && state !== 'complete' && (
                          <span
                            className="inline-flex items-center gap-1 ml-2 align-middle"
                            title="You have customised this delivery (promoted or deferred wines), so regeneration keeps it as-is"
                          >
                            <Lock size={10} aria-hidden="true" />
                            Curated
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0">
                    <DeliveryStatusBadge state={state} />
                  </span>
                </button>

                {expanded && (
                  <div className="px-4 pb-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {delivery.wines.map(wine => (
                        <div key={wine.id} className="panel panel-sunken p-3 text-sm">
                          <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0">
                              {/* Two lines, breaking at spaces. A name
                                  long enough to need a third is rare
                                  enough that an ellipsis beats a card
                                  that grows to fit it. */}
                              <p className="font-semibold text-on-surface line-clamp-2">
                                {wineDisplayName(wine.producer, wine.name)}
                              </p>
                              {/* "6 bottles · Bottle" said the same
                                  thing twice; the count and the format
                                  belong together. */}
                              <p className="text-outline text-xs mt-0.5">
                                {wine.vintage} · {wine.quantity} × {wine.format || 'Bottle'}
                              </p>
                            </div>

                            {/* One action per state, and none once it is
                                done: a delivery already in the house has
                                nothing left to bring forward or put off.
                                Both are outlines — the only filled
                                button on this screen is the one that
                                commits a delivery. */}
                            {state === 'next' && (
                              <button
                                onClick={() => handleDeferWine(wine.id, delivery.date, wineDisplayName(wine.producer, wine.name))}
                                disabled={isDelaying || delivery.wines.length <= 1}
                                className="shrink-0 px-3 py-1.5 rounded-full border border-outline-variant text-outline-variant text-xs font-medium hover:text-on-surface hover:border-outline transition-colors disabled:opacity-40 whitespace-nowrap"
                                title="Defer this wine to a future delivery"
                              >
                                {isDelaying ? '...' : 'Defer'}
                              </button>
                            )}
                            {state === 'planned' && (
                              <button
                                onClick={() => handlePromoteWine(wine.id, wine.quantity, wineDisplayName(wine.producer, wine.name))}
                                disabled={isPromoting}
                                className="shrink-0 px-3 py-1.5 rounded-full border border-primary-container/60 text-primary-container text-xs font-medium hover:border-primary-container transition-colors disabled:opacity-40 whitespace-nowrap"
                                title="Promote to the next delivery"
                              >
                                {isPromoting ? '...' : 'Promote'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* The one solid button on the screen, and only on
                        the delivery that is actually next: confirming a
                        2029 delivery today would put its wines in the
                        house four years early. */}
                    {state === 'next' && (
                      <button
                        onClick={() => handleConfirmDelivery(delivery.date)}
                        className="btn-primary w-full mt-4"
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
