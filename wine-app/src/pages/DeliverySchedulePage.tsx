import { useEffect, useState } from 'react'
import { useWineStore } from '../store/wineStore'
import { useDeliverySchedule } from '../hooks/useDeliverySchedule'
import MessageModal from '../components/MessageModal'
import { wineDisplayName, formatDeliveryMonth } from '../services/wine.service'
import { useToastStore } from '../store/toastStore'
import { ChevronDown, Lock, MapPin } from 'lucide-react'
import PageHeading from '../components/PageHeading'
import * as db from '../services/database'
import { UNALLOCATED, UNALLOCATED_RULES, groupWinesByLocation, locationName } from '../services/storageLocation.service'
import type { StorageLocation } from '../types/index'
import DeliveryStatusBadge, { type DeliveryState } from '../components/DeliveryStatusBadge'

export default function DeliverySchedulePage() {
  const wines = useWineStore(state => state.wines)
  const { schedule: deliverySchedule, error: scheduleError, cellarCapacity, promoteWine, deferWine, confirmDelivery } =
    useDeliverySchedule()

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const showToast = useToastStore(state => state.show)
  /** The lockers, so each delivery can say where it is coming from. */
  const [storageLocations, setStorageLocations] = useState<StorageLocation[]>([])
  useEffect(() => {
    db.getAllStorageLocations()
      .then(setStorageLocations)
      .catch(() => setStorageLocations([]))
  }, [])

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

  const toggleCollapse = (key: string) => {
    setFlipped(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  /**
   * Each locker's next delivery is its earliest one not yet confirmed.
   *
   * Derived from position, not from the date: a delivery whose date has
   * passed but which you never confirmed is still the next thing to
   * deal with, and calling it complete would say something that hasn't
   * happened. Lockers run on their own timetables, so each has its own
   * next delivery — within one locker, "next up" never sits below a
   * "planned" card.
   */
  const nextUpKeys = new Set<string>()
  const seenLocations = new Set<string | undefined>()
  for (const d of deliverySchedule) {
    if (d.status === 'completed' || seenLocations.has(d.locationId)) continue
    seenLocations.add(d.locationId)
    nextUpKeys.add(d.key)
  }

  type Entry = (typeof deliverySchedule)[number]
  const stateOf = (delivery: Entry): DeliveryState =>
    delivery.status === 'completed' ? 'complete' : nextUpKeys.has(delivery.key) ? 'next' : 'planned'

  /** Only next deliveries open by default; the rest are a list of dates. */
  const isExpanded = (delivery: Entry) => (stateOf(delivery) === 'next') !== flipped.has(delivery.key)

  /** Where a delivery comes from, once there is more than one place it could. */
  const sourceOf = (delivery: Entry): string | null => {
    if (storageLocations.length === 0) return null
    if (delivery.locationId === undefined) return 'Several locations'
    if (delivery.locationId === UNALLOCATED) return UNALLOCATED_RULES.name
    return locationName(delivery.locationId, storageLocations)
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

  const handleDeferWine = async (wineId: string, key: string, wineName: string) => {
    setIsDelaying(true)
    try {
      await deferWine(wineId, key)
      flashMessage('success', `${wineName} deferred to a future delivery`)
    } catch (error) {
      flashMessage('error', `Failed to defer: ${(error as Error).message}`)
    } finally {
      setIsDelaying(false)
    }
  }

  const handleConfirmDelivery = async (delivery: Entry) => {
    try {
      await confirmDelivery(delivery.key)
      const source = sourceOf(delivery)
      flashMessage(
        'success',
        `${formatDeliveryMonth(delivery.date)} delivery${source ? ` from ${source}` : ''} confirmed`
      )
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
            const source = sourceOf(delivery)

            return (
              <div
                key={delivery.key}
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
                  onClick={() => toggleCollapse(delivery.key)}
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
                      {source && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-on-surface-variant">
                          <MapPin size={11} aria-hidden="true" />
                          {source}
                        </p>
                      )}
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
                    {groupWinesByLocation(delivery.wines, wines, storageLocations).map(group => (
                    <div key={group.name} className="mb-4 last:mb-0">
                      {/* Only worth a heading when there is more than one
                          place involved; a single-source delivery needs
                          no label telling you it came from one place. */}
                      {group.showHeading && (
                        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-outline">
                          <MapPin size={11} aria-hidden="true" />
                          {group.name}
                          <span className="font-normal tracking-normal">
                            {group.bottles} {group.bottles === 1 ? 'bottle' : 'bottles'}
                          </span>
                        </p>
                      )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {group.wines.map(wine => (
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
                                onClick={() => handleDeferWine(wine.id, delivery.key, wineDisplayName(wine.producer, wine.name))}
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
                    </div>
                    ))}

                    {/* The one solid button on the screen, and only on
                        the delivery that is actually next: confirming a
                        2029 delivery today would put its wines in the
                        house four years early. */}
                    {state === 'next' && (
                      <button
                        onClick={() => handleConfirmDelivery(delivery)}
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
