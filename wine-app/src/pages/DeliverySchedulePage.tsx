import { useState, useEffect } from 'react'
import { useWineStore } from '../store/wineStore'
import * as db from '../services/database'
import * as workflows from '../services/workflows.service'
import { ScheduleService } from '../services/schedule.service'
import type { DeliveryDisplayEntry } from '../services/schedule.service'
import MessageModal from '../components/MessageModal'
import { DELIVERY_CONFIG } from '../config/deliveryConfig'

export default function DeliverySchedulePage() {
  const wines = useWineStore(state => state.wines)
  const scheduleUpdateTrigger = useWineStore(state => state.scheduleUpdateTrigger)
  const loadWines = useWineStore(state => state.loadWines)
  const [deliverySchedule, setDeliverySchedule] = useState<DeliveryDisplayEntry[]>([])
  const [cellarCapacity, setCellarCapacity] = useState(80)
  const [currentWinesAtHome, setCurrentWinesAtHome] = useState(0)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isPromoting, setIsPromoting] = useState(false)
  const [isDelaying, setIsDelaying] = useState(false)
  const [collapsedDeliveries, setCollapsedDeliveries] = useState<Set<string>>(new Set())

  const toggleCollapse = (date: string) => {
    setCollapsedDeliveries(prev => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  // Load cellar config on mount
  useEffect(() => {
    db.getCellarConfig().then(config => {
      setCellarCapacity(config.max_home_capacity)
    })
  }, [])

  // Calculate current wines at home
  useEffect(() => {
    const total = wines
      .filter(w => w.quantity_at_home > 0)
      .reduce((sum, w) => sum + w.quantity_at_home, 0)
    setCurrentWinesAtHome(total)
  }, [wines])

  // Generate delivery schedule
  useEffect(() => {
    generateDeliverySchedule()
  }, [scheduleUpdateTrigger])

  const generateDeliverySchedule = async () => {
    try {
      const config = await db.getCellarConfig()
      const totalAtHome = wines
        .filter(w => w.quantity_at_home > 0)
        .reduce((sum, w) => sum + w.quantity_at_home, 0)

      // Fetch DB windows and their curated wine lists (for locked windows)
      // before generating the schedule so committed quantities can be
      // excluded from the scheduler — it then plans around them naturally.
      const dbWindows = await db.getAllDeliveryWindows()
      const lockedWindowWines = new Map<
        string,
        Array<{ wine_id: string; quantity: number }>
      >()
      const committedQuantities: Record<string, number> = {}
      for (const w of dbWindows) {
        if (w.locked) {
          const wws = await db.getDeliveryWindowWines(w.id)
          const wineList = wws.map(ww => ({ wine_id: ww.wine_id, quantity: ww.quantity }))
          lockedWindowWines.set(w.id, wineList)
          for (const ww of wineList) {
            committedQuantities[ww.wine_id] = (committedQuantities[ww.wine_id] || 0) + ww.quantity
          }
        }
      }

      // Generate in-memory delivery schedule for storage wines, excluding
      // bottles already committed to locked windows
      const deliveries = ScheduleService.generateDeliverySchedule(
        wines,
        config.max_home_capacity,
        totalAtHome,
        DELIVERY_CONFIG.months as [number, number],
        config.annual_consumption_target || 30,
        config.min_delivery_bottles || 24,
        committedQuantities
      )

      // Reconcile the in-memory schedule with DB-backed locked windows.
      // Displaced wines (deferred out of a locked window) are relocated to
      // the next unlocked delivery so they don't vanish from the schedule.
      const displaySchedule = ScheduleService.buildDisplaySchedule(
        deliveries,
        wines,
        dbWindows,
        lockedWindowWines,
        DELIVERY_CONFIG.months as [number, number]
      )

      setDeliverySchedule(displaySchedule)
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Failed to generate delivery schedule: ${(error as Error).message}`,
      })
    }
  }

  const ensureLockedWindow = async (delivery: DeliveryDisplayEntry): Promise<string> => {
    let windowId = delivery.windowId
    if (!windowId) {
      const newWindow = await db.createDeliveryWindow({
        scheduled_date: delivery.date,
        locked: false,
        status: 'planned',
      })
      windowId = newWindow.id
    }

    const window = await db.getDeliveryWindowById(windowId)
    if (window && !window.locked) {
      // Persist current in-memory wines to DB before locking
      for (const wine of delivery.wines) {
        const existing = await db.queryAll(
          'SELECT * FROM delivery_window_wines WHERE delivery_window_id = ? AND wine_id = ?',
          [windowId, wine.id]
        )
        if (existing.length === 0) {
          await db.addWineToDeliveryWindow(windowId, wine.id, wine.quantity)
        }
      }
      await db.updateDeliveryWindow(windowId, { locked: true })
    }

    return windowId
  }

  const handlePromoteWine = async (wineId: string, quantity: number, wineName: string) => {
    setIsPromoting(true)
    try {
      const firstDelivery = deliverySchedule[0]
      if (!firstDelivery) throw new Error('No delivery scheduled')

      // Check capacity at the delivery date, not today: we assume the user
      // will continue drinking at their configured annual rate between now
      // and the delivery, freeing space for the incoming bottles. Without
      // this projection, long-dated deliveries get rejected even when
      // they'd comfortably fit by the time they actually arrive.
      const config = await db.getCellarConfig()
      const freshWines = await db.getAllWines()
      const currentHome = freshWines.reduce((sum, w) => sum + w.quantity_at_home, 0)
      const firstDeliveryTotal = firstDelivery.wines.reduce((sum, w) => sum + w.quantity, 0)
      const projectedHomeAtDelivery = ScheduleService.projectHomeAtDate(
        currentHome,
        firstDelivery.date,
        config.annual_consumption_target || 30
      )
      const projectedAfterDelivery = projectedHomeAtDelivery + firstDeliveryTotal + quantity
      if (projectedAfterDelivery > config.max_home_capacity) {
        throw new Error(
          `Promoting would exceed home capacity on ${firstDelivery.date}. ` +
          `Projected at delivery: ${projectedHomeAtDelivery}, Delivery: ${firstDeliveryTotal}, Adding: ${quantity}, Max: ${config.max_home_capacity}`
        )
      }

      const windowId = await ensureLockedWindow(firstDelivery)

      // Add promoted wine to the first delivery window
      const existing = await db.queryAll(
        'SELECT * FROM delivery_window_wines WHERE delivery_window_id = ? AND wine_id = ?',
        [windowId, wineId]
      )
      if (existing.length > 0) {
        await db.updateDeliveryWindowWine(windowId, wineId, quantity)
      } else {
        await db.addWineToDeliveryWindow(windowId, wineId, quantity)
      }

      await generateDeliverySchedule()
      setMessage({ type: 'success', text: `${wineName} promoted to next delivery` })
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      setMessage({ type: 'error', text: `Failed to promote: ${(error as Error).message}` })
    } finally {
      setIsPromoting(false)
    }
  }

  const handleDeferWine = async (wineId: string, date: string, wineName: string) => {
    setIsDelaying(true)
    try {
      const delivery = deliverySchedule.find(d => d.date === date)
      if (!delivery) throw new Error('Delivery not found')

      if (delivery.wines.length <= 1) {
        throw new Error('Cannot defer the only wine in this delivery')
      }

      const windowId = await ensureLockedWindow(delivery)

      // Remove the deferred wine from the locked window
      await db.removeWineFromDeliveryWindow(windowId, wineId)

      await generateDeliverySchedule()
      setMessage({ type: 'success', text: `${wineName} deferred to a future delivery` })
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      setMessage({ type: 'error', text: `Failed to defer: ${(error as Error).message}` })
    } finally {
      setIsDelaying(false)
    }
  }

  const handleConfirmDelivery = async (date: string) => {
    try {
      const entry = deliverySchedule.find(d => d.date === date)
      if (!entry) throw new Error('Delivery not found in schedule')

      // Validate the FULL delivery fits in home space before touching anything.
      // Without this, moveToHome would fail mid-loop on the first wine and
      // report its quantity (e.g. "6 bottles") instead of the full delivery
      // size (e.g. "19 bottles"), leaving the cellar in a partial state.
      const totalToDeliver = entry.wines.reduce((sum, w) => sum + w.quantity, 0)
      const config = await db.getCellarConfig()
      const freshWines = await db.getAllWines()
      const currentHome = freshWines.reduce((sum, w) => sum + w.quantity_at_home, 0)
      const availableSpace = config.max_home_capacity - currentHome
      if (totalToDeliver > availableSpace) {
        throw new Error(
          `Delivery of ${totalToDeliver} bottles exceeds home capacity. ` +
          `Current: ${currentHome}, Max: ${config.max_home_capacity}, Available: ${availableSpace}`
        )
      }

      // If no DB record exists yet for this scheduled date, create one now
      let windowId = entry.windowId
      if (!windowId) {
        const newWindow = await db.createDeliveryWindow({
          scheduled_date: date,
          locked: false,
          status: 'planned',
        })
        windowId = newWindow.id
      }

      const window = await db.getDeliveryWindowById(windowId)
      if (!window) throw new Error('Delivery window not found')

      // Move wines from storage to home
      for (const wine of entry.wines) {
        await workflows.moveToHome(wine.id, wine.quantity)
      }

      // Update window status
      await db.updateDeliveryWindow(window.id, { status: 'completed' })

      // Reload wines and regenerate schedule
      await loadWines()
      await generateDeliverySchedule()

      setMessage({
        type: 'success',
        text: `Delivery for ${date} confirmed`,
      })
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Failed to confirm delivery: ${(error as Error).message}`,
      })
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

        {deliverySchedule.length === 0 ? (
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
                        const isFirstDelivery = delivery.date === deliverySchedule[0]?.date
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
