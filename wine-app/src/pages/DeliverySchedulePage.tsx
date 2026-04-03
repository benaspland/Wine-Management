import { useState, useEffect } from 'react'
import { useWineStore } from '../store/wineStore'
import type { Tier } from '../types/index'
import { TIER_LABELS } from '../types/index'
import * as db from '../services/database'
import { ScheduleService } from '../services/schedule.service'
import WineInfo from '../components/WineInfo'
import MessageModal from '../components/MessageModal'
import { getNextDeliveryDate, formatDeliveryDate, DELIVERY_CONFIG } from '../config/deliveryConfig'

interface DeliveryDate {
  date: string
  wines: Array<{
    id: string
    producer: string
    name: string
    vintage: number
    region: string
    tier: number
    quantity: number
    format: string
  }>
}

export default function DeliverySchedulePage() {
  const wines = useWineStore(state => state.wines)
  const scheduleUpdateTrigger = useWineStore(state => state.scheduleUpdateTrigger)
  const moveWineToHome = useWineStore(state => state.moveWineToHome)
  const delayWineFromDelivery = useWineStore(state => state.delayWineFromDelivery)
  const promoteWineToCurrentDelivery = useWineStore(state => state.promoteWineToCurrentDelivery)
  const [cellarCapacity, setCellarCapacity] = useState(80)
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set([new Date().getFullYear()]))
  const [deliveriesByYear, setDeliveriesByYear] = useState<Record<number, DeliveryDate[]>>({})
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [lastRegenerated, setLastRegenerated] = useState<string>('')
  const [isMoving, setIsMoving] = useState(false)
  const [isDelaying, setIsDelaying] = useState(false)
  const [isPromoting, setIsPromoting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [delayedWines, setDelayedWines] = useState<string[]>([])
  const [promotionDialog, setPromotionDialog] = useState<{ show: boolean; wine?: any; error?: string; projectedTotal?: number }>({ show: false })
  const [currentDeliveryLocked, setCurrentDeliveryLocked] = useState(false)
  const [isTogglingLock, setIsTogglingLock] = useState(false)

  // Load cellar config and generate initial schedule
  useEffect(() => {
    db.getCellarConfig().then(config => {
      setCellarCapacity(config.max_slots)
    })
  }, [])

  // Generate schedule on mount and when data changes
  useEffect(() => {
    generateDeliverySchedule()
  }, [scheduleUpdateTrigger])

  // Generate delivery schedule
  const generateDeliverySchedule = async () => {
    setIsRegenerating(true)
    try {
      const config = await db.getCellarConfig()
      const totalBottlesAtHome = wines
        .filter(w => w.location === 'home')
        .reduce((sum, w) => sum + w.quantity, 0)

      // Get the next delivery date to determine which wines are pinned
      const nextDeliveryInfo = getNextDeliveryDate()
      const nextDeliveryDate = formatDeliveryDate(nextDeliveryInfo.year, nextDeliveryInfo.month)

      // Load pinned wines for current delivery upfront
      const pinnedWineIds = await db.getPinnedWines(nextDeliveryDate)
      const pinnedWineIdSet = new Set(pinnedWineIds)

      // Pass ALL wines to algorithm - it will handle both pinned and future deliveries
      const deliverySchedule = ScheduleService.generateDeliverySchedule(
        wines,
        config.max_slots,
        totalBottlesAtHome,
        DELIVERY_CONFIG.months as [number, number],
        config.annual_consumption_target || DELIVERY_CONFIG.annualTarget
      )

      // Save the generated schedule to the database so it persists
      await db.saveDeliverySchedule(deliverySchedule)

      // Group schedule entries by date
      const grouped: Record<string, Array<{
        id: string
        producer: string
        name: string
        vintage: number
        region: string
        tier: number
        quantity: number
        format: string
      }>> = {}

      // Load delayed wines (still used to exclude from specific deliveries)
      const nextDelayedWines = await db.getDelayedWines(nextDeliveryDate)

      deliverySchedule.forEach(entry => {
        const isCurrentDelivery = entry.scheduled_date === nextDeliveryDate
        const isDelayed = nextDelayedWines.includes(entry.wine_id)
        const isPinned = pinnedWineIdSet.has(entry.wine_id)

        // Skip pinned wines in non-current deliveries (they belong to current delivery only)
        if (!isCurrentDelivery && isPinned) {
          return
        }

        // Skip delayed wines in the current (next) delivery, but include them in future deliveries
        if (isCurrentDelivery && isDelayed) {
          return // Skip this wine in current delivery
        }

        if (!grouped[entry.scheduled_date]) {
          grouped[entry.scheduled_date] = []
        }

        const wine = wines.find(w => w.id === entry.wine_id)
        if (wine) {
          grouped[entry.scheduled_date].push({
            id: wine.id,
            producer: wine.producer,
            name: wine.name,
            vintage: wine.vintage,
            region: wine.region,
            tier: wine.tier,
            quantity: entry.quantity,
            format: wine.format,
          })
        }
      })

      // Add pinned wines to current delivery
      if (pinnedWineIds.length > 0) {
        if (!grouped[nextDeliveryDate]) {
          grouped[nextDeliveryDate] = []
        }

        const currentDeliveryWineIds = new Set(grouped[nextDeliveryDate].map(w => w.id))

        for (const pinnedWineId of pinnedWineIds) {
          if (!currentDeliveryWineIds.has(pinnedWineId)) {
            const wine = wines.find(w => w.id === pinnedWineId)
            if (wine) {
              // Use wine's full quantity for pinned wines
              grouped[nextDeliveryDate].push({
                id: wine.id,
                producer: wine.producer,
                name: wine.name,
                vintage: wine.vintage,
                region: wine.region,
                tier: wine.tier,
                quantity: wine.quantity,
                format: wine.format,
              })
            }
          }
        }
      }

      if (Object.keys(grouped).length === 0) {
        setDeliveriesByYear({})
        setLastRegenerated(new Date().toLocaleTimeString())
        return
      }

      // Convert to array format, sorted by date
      const datesSorted = Object.entries(grouped)
        .map(([date, winesInDelivery]) => ({
          date,
          wines: winesInDelivery,
        }))
        .sort((a, b) => a.date.localeCompare(b.date))

      // Group by year
      const byYear: Record<number, DeliveryDate[]> = {}
      datesSorted.forEach(delivery => {
        const year = parseInt(delivery.date.split('-')[0])
        if (!byYear[year]) {
          byYear[year] = []
        }
        byYear[year].push(delivery)
      })

      setDeliveriesByYear(byYear)
      setLastRegenerated(new Date().toLocaleTimeString())

      // Load lock status for current delivery (using nextDeliveryDate from above)
      console.log('[DeliverySchedulePage] Checking lock status for nextDeliveryDate:', nextDeliveryDate)
      const isLocked = await db.isDeliveryLocked(nextDeliveryDate)
      console.log('[DeliverySchedulePage] Lock status loaded:', { nextDeliveryDate, isLocked })
      setCurrentDeliveryLocked(isLocked)
    } finally {
      setIsRegenerating(false)
    }
  }

  // Toggle lock on current delivery
  const handleToggleLock = async () => {
    setIsTogglingLock(true)
    try {
      const nextDeliveryInfo = getNextDeliveryDate()
      const nextDeliveryDate = formatDeliveryDate(nextDeliveryInfo.year, nextDeliveryInfo.month)

      if (currentDeliveryLocked) {
        await db.unlockDelivery(nextDeliveryDate)
        setCurrentDeliveryLocked(false)
        setMessage({ type: 'success', text: 'Current delivery unlocked' })
      } else {
        await db.lockDelivery(nextDeliveryDate)
        setCurrentDeliveryLocked(true)
        setMessage({ type: 'success', text: 'Current delivery locked for manual curation' })
      }
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      setMessage({ type: 'error', text: `Error: ${(error as Error).message}` })
    } finally {
      setIsTogglingLock(false)
    }
  }

  // Calculate current home inventory (in bottles, not wine count)
  const homeWines = wines.filter(w => w.location === 'home')
  const totalBottlesAtHome = homeWines.reduce((sum, w) => sum + w.quantity, 0)

  const toggleYear = (year: number) => {
    const newExpanded = new Set(expandedYears)
    if (newExpanded.has(year)) {
      newExpanded.delete(year)
    } else {
      newExpanded.add(year)
    }
    setExpandedYears(newExpanded)
  }

  const getTierColor = (tier: number): string => {
    if (tier === 5) return 'bg-primary text-on-primary-fixed-variant'
    if (tier === 4) return 'bg-on-surface text-surface'
    if (tier === 3) return 'border border-primary/40 text-primary'
    return 'bg-surface-container-high text-on-surface-variant'
  }

  const handleMarkGroupDeliveryComplete = async (deliveryGroup: DeliveryDate) => {
    setIsMoving(true)
    try {
      const bottleCount = deliveryGroup.wines.reduce((sum, w) => sum + w.quantity, 0)

      // Check if delivery would exceed home capacity
      if (totalBottlesAtHome + bottleCount > cellarCapacity) {
        setMessage({
          type: 'error',
          text: `Cannot complete delivery: would exceed home capacity. Current home: ${totalBottlesAtHome} + Delivery: ${bottleCount} = ${totalBottlesAtHome + bottleCount} (max: ${cellarCapacity})`,
        })
        return
      }

      // Move all wines in this delivery group from storage to home
      for (const wine of deliveryGroup.wines) {
        await moveWineToHome(wine.id)
      }

      // Clear delay marks for this delivery
      await db.clearDelayMarks(deliveryGroup.date)

      // Clear lock if this was the current locked delivery
      if (currentDeliveryLocked) {
        await db.unlockDelivery(deliveryGroup.date)
        setCurrentDeliveryLocked(false)
      }

      setMessage({
        type: 'success',
        text: `Delivery of ${bottleCount} bottles (${deliveryGroup.wines.length} wines) completed`,
      })
      setTimeout(() => setMessage(null), 3000)

      // Regenerate schedule to show next delivery with correct lock status
      await generateDeliverySchedule()
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Failed to complete delivery: ${(error as Error).message}`,
      })
    } finally {
      setIsMoving(false)
    }
  }

  const handleDelayWine = async (wineId: string, wineName: string, deliveryDate: string) => {
    setIsDelaying(true)
    try {
      await delayWineFromDelivery(wineId, deliveryDate)

      // Load delayed wines for this delivery
      const delayed = await db.getDelayedWines(deliveryDate)
      setDelayedWines(delayed)

      // Auto-lock current delivery when first wine is delayed (manual curation)
      console.log('[DeliverySchedulePage] Wine delayed:', { wineId, deliveryDate, currentDeliveryLocked })
      if (!currentDeliveryLocked) {
        console.log('[DeliverySchedulePage] Locking delivery:', deliveryDate)
        await db.lockDelivery(deliveryDate)
        setCurrentDeliveryLocked(true)
        setMessage({
          type: 'success',
          text: `${wineName} delayed - current delivery locked to prevent automatic rescheduling`,
        })
      } else {
        setMessage({
          type: 'success',
          text: `${wineName} delayed - will be rescheduled to future delivery`,
        })
      }
      setTimeout(() => setMessage(null), 3000)

      // Regenerate schedule to show updated delayed wine in future deliveries
      console.log('[DeliverySchedulePage] Regenerating schedule after delay')
      await generateDeliverySchedule()
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Failed to delay wine: ${(error as Error).message}`,
      })
    } finally {
      setIsDelaying(false)
    }
  }

  const handlePromoteWineClick = async (wine: any, currentDeliveryBottles: number) => {
    try {
      // Check capacity before promotion
      const capacityCheck = await db.checkDeliveryCapacity(
        wine.quantity,
        totalBottlesAtHome,
        currentDeliveryBottles,
        cellarCapacity
      )

      if (!capacityCheck.canPromote) {
        setPromotionDialog({
          show: true,
          wine,
          error: capacityCheck.message,
          projectedTotal: capacityCheck.projectedTotal,
        })
      } else {
        // Capacity OK - promote the wine
        setPromotionDialog({
          show: true,
          wine,
          projectedTotal: capacityCheck.projectedTotal,
        })
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Failed to check capacity: ${(error as Error).message}`,
      })
    }
  }

  const confirmPromotion = async () => {
    if (!promotionDialog.wine || promotionDialog.error) {
      setPromotionDialog({ show: false })
      return
    }

    setIsPromoting(true)
    try {
      // Get current delivery date (first upcoming delivery)
      const allDeliveries = Object.values(deliveriesByYear)
        .flat()
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      const currentDelivery = allDeliveries[0]
      const currentDeliveryDate = currentDelivery?.date

      if (currentDeliveryDate) {
        await promoteWineToCurrentDelivery(
          promotionDialog.wine.id,
          currentDeliveryDate
        )

        // Auto-lock current delivery when wine is promoted (manual curation)
        if (!currentDeliveryLocked) {
          await db.lockDelivery(currentDeliveryDate)
          setCurrentDeliveryLocked(true)
          setMessage({
            type: 'success',
            text: `${promotionDialog.wine.name} promoted - current delivery locked to prevent automatic rescheduling`,
          })
        } else {
          setMessage({
            type: 'success',
            text: `${promotionDialog.wine.name} promoted to current delivery`,
          })
        }
        setTimeout(() => setMessage(null), 3000)

        // Regenerate schedule to show updated delivery composition
        await generateDeliverySchedule()
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Failed to promote wine: ${(error as Error).message}`,
      })
    } finally {
      setIsPromoting(false)
      setPromotionDialog({ show: false })
    }
  }

  // Load delayed wines when next delivery changes
  useEffect(() => {
    const loadDelayedWines = async () => {
      const allDeliveries = Object.values(deliveriesByYear).flat().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      const nextDelivery = allDeliveries.find(d => {
        const wine = wines.find(w => w.id === d.wines[0].id)
        return wine?.location === 'storage'
      })
      if (nextDelivery) {
        const delayed = await db.getDelayedWines(nextDelivery.date)
        setDelayedWines(delayed)
      }
    }
    loadDelayedWines()
  }, [deliveriesByYear])

  const availableSlots = cellarCapacity - totalBottlesAtHome
  const usedSlots = totalBottlesAtHome
  const years = Object.keys(deliveriesByYear)
    .map(Number)
    .sort((a, b) => a - b)

  return (
    <div className="px-6 max-w-5xl mx-auto py-8">
      {/* Message Notification */}
      {message && (
        <MessageModal
          type={message.type}
          text={message.text}
          onClose={() => setMessage(null)}
        />
      )}

      {/* Promotion Confirmation Dialog */}
      {promotionDialog?.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className={`bg-surface rounded-lg shadow-lg p-8 max-w-md mx-4 ${
            promotionDialog.error ? 'border-l-4 border-l-[#FF6B6B]' : 'border-l-4 border-l-[#00DCFF]'
          }`}>
            <div className="flex items-start gap-4 mb-4">
              <div className={`text-3xl ${promotionDialog.error ? 'text-[#FF6B6B]' : 'text-[#00DCFF]'}`}>
                {promotionDialog.error ? '⚠' : '↑'}
              </div>
              <div className="flex-1">
                <h3 className="font-headline text-lg font-bold text-on-surface mb-2">
                  {promotionDialog.error ? 'Cannot Promote' : 'Confirm Promotion'}
                </h3>
                {promotionDialog.wine && (
                  <p className="text-on-surface text-sm mb-3">
                    {promotionDialog.wine.name} ({promotionDialog.wine.quantity} bottles)
                  </p>
                )}
                {promotionDialog.error ? (
                  <p className="text-on-surface text-sm">{promotionDialog.error}</p>
                ) : (
                  <p className="text-on-surface text-sm">
                    Projected total: {promotionDialog.projectedTotal} bottles (capacity: {cellarCapacity})
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setPromotionDialog({ show: false })}
                className="flex-1 px-4 py-2 bg-surface-container-low text-on-surface rounded font-medium hover:bg-surface-container transition-colors"
              >
                {promotionDialog.error ? 'OK' : 'Cancel'}
              </button>
              {!promotionDialog.error && (
                <button
                  onClick={confirmPromotion}
                  disabled={isPromoting}
                  className="flex-1 px-4 py-2 bg-primary text-on-primary rounded font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {isPromoting ? 'Promoting...' : 'Confirm'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="mb-12">
        <div className="flex items-start justify-between gap-6 mb-6">
          <div>
            <span className="text-primary-container font-label text-xs tracking-widest uppercase mb-2 block">
              Logistics & Intake
            </span>
            <h2 className="font-headline text-5xl md:text-7xl font-bold text-on-surface leading-tight mb-4">
              Upcoming Arrivals
            </h2>
            <p className="text-outline mt-4 max-w-md font-light">
              Inventory transitioning from professional climate-controlled storage to your private home vault.
            </p>
          </div>
          <button
            onClick={generateDeliverySchedule}
            disabled={isRegenerating}
            className="btn-primary whitespace-nowrap disabled:opacity-50"
          >
            {isRegenerating ? 'Regenerating...' : 'Regenerate Schedule'}
          </button>
        </div>
        {lastRegenerated && (
          <p className="text-outline-variant text-xs">Last regenerated: {lastRegenerated}</p>
        )}
      </header>

      {/* Capacity Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="bg-surface-container-low p-6 rounded-xl">
          <p className="text-outline text-xs uppercase tracking-wider mb-2">Home Cellar</p>
          <p className="font-headline text-4xl font-bold text-primary">{homeWines.length}</p>
          <p className="text-outline text-sm mt-1">wines stored</p>
        </div>
        <div className="bg-surface-container-low p-6 rounded-xl">
          <p className="text-outline text-xs uppercase tracking-wider mb-2">Capacity Used</p>
          <div className="flex items-baseline gap-2">
            <p className="font-headline text-4xl font-bold text-primary">{usedSlots}</p>
            <p className="text-outline">/</p>
            <p className="text-outline text-xl">{cellarCapacity}</p>
          </div>
          <p className="text-outline text-sm mt-1">{availableSlots} slots available</p>
        </div>
        <div className="bg-surface-container-low p-6 rounded-xl">
          <p className="text-outline text-xs uppercase tracking-wider mb-2">In Storage</p>
          <p className="font-headline text-4xl font-bold text-primary">
            {wines.filter(w => w.location === 'storage').length}
          </p>
          <p className="text-outline text-sm mt-1">wines available</p>
        </div>
      </div>

      {/* Deliveries */}
      {years.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-outline mb-4">No wines in storage to deliver</p>
          <p className="text-outline-variant text-sm">
            When you add wines to storage, delivery schedule will be generated here
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {years.map(year => {
            const deliveries = deliveriesByYear[year] || []

            // Get current (next) delivery to identify which one to exclude delayed wines from
            const allDeliveries = Object.values(deliveriesByYear).flat().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            const nextDelivery = allDeliveries.find(d => {
              const wine = wines.find(w => w.id === d.wines[0].id)
              return wine?.location === 'storage'
            })

            // Calculate totals, excluding delayed wines from current delivery only
            const totalBottles = deliveries.reduce((sum, d) => {
              const isCurrentDelivery = nextDelivery?.date === d.date
              const displayWines = isCurrentDelivery
                ? d.wines.filter(w => !delayedWines.includes(w.id))
                : d.wines
              return sum + displayWines.reduce((s, w) => s + w.quantity, 0)
            }, 0)

            const totalWines = new Set(deliveries.flatMap(d => {
              const isCurrentDelivery = nextDelivery?.date === d.date
              const displayWines = isCurrentDelivery
                ? d.wines.filter(w => !delayedWines.includes(w.id))
                : d.wines
              return displayWines.map(w => w.id)
            })).size

            return (
              <div key={year} className="border border-outline-variant/20 rounded-lg overflow-hidden">
                {/* Year Header - Collapsible with summary stats */}
                <button
                  onClick={() => toggleYear(year)}
                  className="w-full bg-surface-container-low hover:bg-surface-container transition-colors p-6 flex items-center justify-between"
                >
                  <div className="flex items-center gap-6">
                    <div>
                      <h3 className="font-headline text-3xl text-on-surface">{year}</h3>
                      <p className="text-outline-variant text-sm mt-1">
                        {deliveries.length} {deliveries.length === 1 ? 'delivery' : 'deliveries'} • {totalBottles} bottles • {totalWines} wines
                      </p>
                    </div>
                  </div>
                  <span
                    className={`material-symbols-outlined text-2xl text-outline transition-transform ${
                      expandedYears.has(year) ? 'rotate-180' : ''
                    }`}
                  >
                    expand_more
                  </span>
                </button>

                {/* Deliveries for this year - Collapsible */}
                {expandedYears.has(year) && (
                  <div className="border-t border-outline-variant/10 p-6 space-y-8">
                    {deliveries.map((group, idx) => {
                      // Find next upcoming delivery (earliest by date)
                      const allDeliveries = Object.values(deliveriesByYear).flat().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                      const nextDelivery = allDeliveries.find(d => {
                        const wine = wines.find(w => w.id === d.wines[0].id)
                        return wine?.location === 'storage' // Only consider undelivered wines
                      })
                      const isNextDelivery = nextDelivery?.date === group.date

                      // For current delivery, exclude delayed wines from counts
                      const displayWines = isNextDelivery
                        ? group.wines.filter(w => !delayedWines.includes(w.id))
                        : group.wines
                      const groupBottles = displayWines.reduce((sum, w) => sum + w.quantity, 0)
                      const currentDeliveryBottles = nextDelivery ? nextDelivery.wines.reduce((sum, w) => sum + w.quantity, 0) : 0

                      return (
                      <section key={`delivery-${year}-${idx}`}>
                      <div className="mb-6 pb-4 border-b border-outline-variant/10 flex items-start justify-between gap-4">
                        <div>
                          <h4 className="font-headline text-xl text-on-surface">
                            {new Date(group.date).toLocaleDateString('en-US', {
                              month: 'long',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </h4>
                          <p className="text-outline-variant text-sm mt-2">{groupBottles} bottles • {displayWines.length} wines</p>
                        </div>
                        {isNextDelivery && (
                          <div className="flex gap-2">
                            <button
                              onClick={handleToggleLock}
                              disabled={isTogglingLock}
                              className={`px-4 py-2 rounded font-medium transition-colors flex items-center gap-2 ${
                                currentDeliveryLocked
                                  ? 'bg-amber-500/20 text-amber-700 hover:bg-amber-500/30'
                                  : 'bg-surface-container-low text-on-surface hover:bg-surface-container'
                              } disabled:opacity-50`}
                              title={currentDeliveryLocked ? 'Unlock for automatic regeneration' : 'Lock for manual curation'}
                            >
                              <span className="material-symbols-outlined text-lg">
                                {currentDeliveryLocked ? 'lock' : 'lock_open'}
                              </span>
                              <span className="hidden sm:inline text-sm">
                                {currentDeliveryLocked ? 'Locked' : 'Lock'}
                              </span>
                            </button>
                            <button
                              onClick={() => handleMarkGroupDeliveryComplete(group)}
                            disabled={isMoving}
                            className="px-4 py-2 bg-primary text-on-primary rounded text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors whitespace-nowrap flex-shrink-0"
                            title="Mark this entire delivery as received"
                          >
                            {isMoving ? 'Moving...' : 'Mark Delivered'}
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="grid gap-4">
                        {group.wines.filter(wine => !(isNextDelivery && delayedWines.includes(wine.id))).map((wine, wineIdx) => (
                          <div
                            key={`${group.date}-${wine.id}-${wineIdx}`}
                            className="bg-surface-container-low group hover:bg-surface-container transition-colors duration-300 flex items-center justify-between p-5 rounded-lg"
                          >
                            <div className="flex items-center gap-6">
                              <div className="w-16 h-24 bg-surface-container-highest rounded flex items-center justify-center overflow-hidden shrink-0">
                                <span className="material-symbols-outlined text-3xl text-outline opacity-50">
                                  wine_bar
                                </span>
                              </div>

                              <div className="flex-1">
                                <WineInfo
                                  wine={wine}
                                  producerSize="lg"
                                  nameSize="sm"
                                  classificationSize="xs"
                                  showClassification={true}
                                  layout="vertical"
                                />
                                <p className="text-outline text-xs font-light uppercase tracking-wider mb-2 mt-1">
                                  {wine.region} · {wine.vintage}
                                </p>
                                <div className="flex gap-2 flex-wrap mt-2">
                                  <span
                                    className={`${getTierColor(wine.tier)} px-2 py-0.5 text-[10px] uppercase tracking-wider rounded-sm shrink-0`}
                                  >
                                    {TIER_LABELS[wine.tier as Tier]}
                                  </span>
                                  <span className="bg-surface-container-high px-2 py-0.5 text-[10px] text-on-surface-variant rounded-sm shrink-0">
                                    {wine.format}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-col items-end gap-2 ml-4">
                              <div className="text-2xl font-headline text-primary-container">{wine.quantity}x</div>
                              {isNextDelivery && !delayedWines.includes(wine.id) && (
                                <button
                                  onClick={() => handleDelayWine(wine.id, wine.name, group.date)}
                                  disabled={isDelaying}
                                  className="px-2 py-1 bg-surface-container-high text-on-surface-variant rounded text-xs font-medium hover:bg-surface-container transition-colors disabled:opacity-50 whitespace-nowrap"
                                  title="Delay this wine - will be rescheduled to a future delivery"
                                >
                                  {isDelaying ? 'Delaying...' : 'Delay'}
                                </button>
                              )}
                              {!isNextDelivery && (
                                <button
                                  onClick={() => handlePromoteWineClick(wine, currentDeliveryBottles)}
                                  disabled={isPromoting}
                                  className="px-2 py-1 bg-primary text-on-primary rounded text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 whitespace-nowrap"
                                  title="Promote to current delivery"
                                >
                                  {isPromoting ? 'Promoting...' : 'Promote'}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                    )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Info Box */}
      <div className="mt-16 p-6 bg-surface-container-low rounded-xl border border-outline-variant/10">
        <h4 className="font-headline text-lg font-bold mb-3">About Delivery Scheduling</h4>
        <p className="text-outline text-sm leading-relaxed mb-4">
          Deliveries are currently shown as suggestions based on drinking windows and format-based minimum thresholds.
        </p>
        <ul className="text-outline text-sm leading-relaxed space-y-2 ml-4">
          <li>• Maximum 2 deliveries per calendar year in fixed months (March, September)</li>
          <li>• Tier 4-5 wines never before 2029</li>
          <li>• Delivery thresholds by format: 750ml (6), Magnum (3), Half bottles (12)</li>
          <li>• Below-threshold quantities delivered in single shipment</li>
          <li>• Diverse region/producer selection</li>
          <li>• Respect cellar capacity constraints</li>
        </ul>
      </div>
    </div>
  )
}
