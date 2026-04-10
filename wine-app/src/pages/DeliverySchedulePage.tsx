import { useState, useEffect } from 'react'
import { useWineStore } from '../store/wineStore'
import * as db from '../services/database'
import * as workflows from '../services/workflows.service'
import { ScheduleService } from '../services/schedule.service'
import MessageModal from '../components/MessageModal'
import { DELIVERY_CONFIG } from '../config/deliveryConfig'

interface DeliveryDisplayEntry {
  date: string
  windowId: string
  status: string
  locked: boolean
  wines: Array<{
    id: string
    name: string
    producer?: string
    vintage: number
    region?: string
    tier: number
    quantity: number
    format?: string
  }>
}

export default function DeliverySchedulePage() {
  const wines = useWineStore(state => state.wines)
  const scheduleUpdateTrigger = useWineStore(state => state.scheduleUpdateTrigger)
  const loadWines = useWineStore(state => state.loadWines)
  const [deliverySchedule, setDeliverySchedule] = useState<DeliveryDisplayEntry[]>([])
  const [cellarCapacity, setCellarCapacity] = useState(80)
  const [currentWinesAtHome, setCurrentWinesAtHome] = useState(0)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

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

      // Generate delivery schedule for storage wines
      const deliveries = ScheduleService.generateDeliverySchedule(
        wines,
        config.max_home_capacity,
        totalAtHome,
        DELIVERY_CONFIG.months as [number, number],
        config.annual_consumption_target || 30,
        config.min_delivery_bottles || 24
      )

      // Get all delivery windows from database
      const windows = await db.getAllDeliveryWindows()
      const windowMap = new Map(windows.map(w => [w.scheduled_date, w]))

      // Build display entries from generated schedule
      const displayEntries: DeliveryDisplayEntry[] = deliveries.map(delivery => {
        const wine = wines.find(w => w.id === delivery.wine_id)
        const window = windowMap.get(delivery.scheduled_date)

        return {
          date: delivery.scheduled_date,
          windowId: window?.id || '',
          status: delivery.status,
          locked: window?.locked || false,
          wines: wine ? [{
            id: wine.id,
            name: wine.name,
            producer: wine.producer,
            vintage: wine.vintage,
            region: wine.region,
            tier: wine.tier,
            quantity: delivery.quantity,
            format: wine.format,
          }] : [],
        }
      })

      // Group by date
      const grouped = new Map<string, DeliveryDisplayEntry>()
      for (const entry of displayEntries) {
        const existing = grouped.get(entry.date)
        if (existing) {
          existing.wines.push(...entry.wines)
        } else {
          grouped.set(entry.date, entry)
        }
      }

      setDeliverySchedule(Array.from(grouped.values()).sort((a, b) => a.date.localeCompare(b.date)))
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Failed to generate delivery schedule: ${(error as Error).message}`,
      })
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
          deliverySchedule.map(delivery => (
            <div key={delivery.date} className="bg-surface-container p-4 rounded-lg border border-outline-variant">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-on-surface">
                  {new Date(delivery.date).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </h3>
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
                      🔒 Locked
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                {delivery.wines.map(wine => (
                  <div key={wine.id} className="bg-surface p-3 rounded border border-outline-variant text-sm">
                    <p className="font-semibold text-on-surface">
                      {wine.producer} {wine.name}
                    </p>
                    <p className="text-outline text-xs">
                      {wine.vintage} • Qty: {wine.quantity} {wine.format || '750ml'}
                    </p>
                  </div>
                ))}
              </div>

              {delivery.status !== 'completed' && !delivery.locked && (
                <button
                  onClick={() => handleConfirmDelivery(delivery.date)}
                  className="w-full px-4 py-2 bg-primary text-on-primary rounded font-medium hover:opacity-90"
                >
                  Confirm Delivery
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {message && <MessageModal type={message.type} text={message.text} onClose={() => setMessage(null)} />}
    </div>
  )
}
