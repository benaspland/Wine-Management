import { useState, useEffect } from 'react'
import { useWineStore } from '../store/wineStore'
import { ScheduleService } from '../services/schedule.service'
import * as db from '../services/database'
import WineInfo from '../components/WineInfo'
import MessageModal from '../components/MessageModal'

interface ScheduleEntry {
  month: string
  year: number
  wines: Array<{
    id: string
    producer: string
    name: string
    vintage: number
    region: string
    tier: number
    status: string
    consumed?: boolean
    consumedDate?: string
  }>
}

const MONTH_TO_NUMBER: Record<string, number> = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12
}

export default function DrinkingSchedulePage() {
  const wines = useWineStore(state => state.wines)
  const loadWines = useWineStore(state => state.loadWines)
  const scheduleUpdateTrigger = useWineStore(state => state.scheduleUpdateTrigger)
  const [isConsuming, setIsConsuming] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([])
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [lastRegenerated, setLastRegenerated] = useState<string>('')

  // Generate schedule on mount and when data changes
  useEffect(() => {
    generateDrinkingSchedule()
  }, [scheduleUpdateTrigger])

  const handleMarkConsumed = async (
    wineId: string,
    producerName: string,
    wineName: string,
    scheduleYear: number,
    scheduleMonth: number
  ) => {
    setIsConsuming(true)
    try {
      const wine = wines.find(w => w.id === wineId)
      if (!wine) throw new Error('Wine not found')

      // Consume 1 bottle of the wine with schedule pinning info
      await db.consumeWine(wineId, 1, `Consumed from drinking schedule`, scheduleYear, scheduleMonth)

      // Reload wines to update quantities
      await loadWines()

      // Regenerate schedule to show updated consumption status
      await generateDrinkingSchedule()

      setMessage({
        type: 'success',
        text: `${producerName} ${wineName} marked as consumed`,
      })
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Failed to mark consumed: ${(error as Error).message}`,
      })
    } finally {
      setIsConsuming(false)
    }
  }

  // Generate drinking schedule
  const generateDrinkingSchedule = async () => {
    setIsRegenerating(true)
    try {
      const config = await db.getCellarConfig()
      const cellarCapacity = config.max_slots
      const totalBottlesAtHome = wines
        .filter(w => w.location === 'home')
        .reduce((sum, w) => sum + w.quantity, 0)
      const deliverySchedule = ScheduleService.generateDeliverySchedule(
        wines,
        cellarCapacity,
        totalBottlesAtHome,
        [3, 9], // Fixed delivery months: March and September
        config.annual_consumption_target || 30
      )

      if (wines.length === 0) {
        setSchedule([])
        setLastRegenerated(new Date().toLocaleTimeString())
        return
      }

      // Generate drinking schedule using ScheduleService with ALL wines
      // Calculate years needed: assume ~30 wines/year consumption, so total wines / 30
      // Add buffer for spacing and tier constraints
      const yearsNeeded = Math.ceil((wines.length / 30) * 1.5) + 5
      const drinkingSchedule = ScheduleService.generateDrinkingSchedule(wines, deliverySchedule, undefined, yearsNeeded)

      if (drinkingSchedule.length === 0) {
        setSchedule([])
        setLastRegenerated(new Date().toLocaleTimeString())
        return
      }

      // Group schedule entries by year/month for timeline display
      const grouped: Record<string, ScheduleEntry['wines']> = {}

      // Batch load consumption status - eliminates N+1 queries
      // Group unique wine IDs and their year/month combos
      const periodMap = new Map<string, { year: number; month: number; wineIds: string[] }>()

      drinkingSchedule.forEach(entry => {
        const periodKey = `${entry.suggestedYear}-${entry.suggestedMonth}`
        if (!periodMap.has(periodKey)) {
          periodMap.set(periodKey, {
            year: entry.suggestedYear,
            month: entry.suggestedMonth,
            wineIds: [],
          })
        }
        const period = periodMap.get(periodKey)!
        if (!period.wineIds.includes(entry.wineId)) {
          period.wineIds.push(entry.wineId)
        }
      })

      // Load consumption status for each period's wines in batch
      const consumptionStatus = new Map<string, { consumed: boolean; consumedDate?: string }>()

      for (const [_, period] of periodMap) {
        const batchStatus = await db.getConsumptionStatusBatch(period.wineIds, period.year, period.month)
        for (const [wineId, status] of batchStatus) {
          const statusKey = `${wineId}-${period.year}-${period.month}`
          consumptionStatus.set(statusKey, status)
        }
      }

      // Build schedule with consumption info
      drinkingSchedule.forEach(entry => {
        const key = `${entry.suggestedYear}-${entry.suggestedMonth}`
        if (!grouped[key]) {
          grouped[key] = []
        }

        const statusKey = `${entry.wineId}-${entry.suggestedYear}-${entry.suggestedMonth}`
        const consumptionInfo = consumptionStatus.get(statusKey) || { consumed: false }

        grouped[key].push({
          id: entry.wineId,
          producer: entry.producer,
          name: entry.name,
          vintage: entry.vintage,
          region: entry.region,
          tier: entry.tier,
          status: entry.status,
          consumed: consumptionInfo.consumed,
          consumedDate: consumptionInfo.consumedDate,
        })
      })

      // Convert to timeline format with month names
      const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
                         'July', 'August', 'September', 'October', 'November', 'December']

      const timeline: ScheduleEntry[] = Object.entries(grouped)
        .map(([key, winesInPeriod]) => {
          const [yearStr, monthStr] = key.split('-')
          const year = parseInt(yearStr)
          const month = parseInt(monthStr)
          return {
            month: monthNames[month] || 'Month',
            year,
            wines: winesInPeriod.sort((a, b) => b.tier - a.tier),
          }
        })
        .sort((a, b) => a.year !== b.year ? a.year - b.year : 0)

      setSchedule(timeline)
      setLastRegenerated(new Date().toLocaleTimeString())
    } finally {
      setIsRegenerating(false)
    }
  }

  const getTierColor = (tier: number): string => {
    if (tier === 5) return 'text-primary-container'
    if (tier === 4) return 'text-primary'
    if (tier === 3) return 'text-secondary'
    return 'text-outline-variant'
  }

  return (
    <div className="px-6 max-w-3xl mx-auto py-8">
      {/* Message Notification */}
      {message && (
        <MessageModal
          type={message.type}
          text={message.text}
          onClose={() => setMessage(null)}
        />
      )}

      {/* Header */}
      <div className="mb-16">
        <div className="flex items-start justify-between gap-6 mb-6">
          <div>
            <span className="text-primary-container font-label text-xs tracking-[0.3em] uppercase mb-2 block">
              Curation Engine
            </span>
            <h2 className="font-headline text-5xl md:text-7xl font-bold text-on-surface leading-tight mb-4">
              Drinking Schedule
            </h2>
            <p className="text-outline mt-4 text-sm max-w-md font-light leading-relaxed">
              Your home cellar's peak maturity timeline, algorithmically ordered for optimal preservation and enjoyment.
            </p>
          </div>
          <button
            onClick={generateDrinkingSchedule}
            disabled={isRegenerating}
            className="btn-primary whitespace-nowrap disabled:opacity-50"
          >
            {isRegenerating ? 'Regenerating...' : 'Regenerate Schedule'}
          </button>
        </div>
        {lastRegenerated && (
          <p className="text-outline-variant text-xs">Last regenerated: {lastRegenerated}</p>
        )}
      </div>

      {/* Timeline */}
      {schedule.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-outline mb-4">No wines available to drink yet</p>
          <p className="text-outline-variant text-sm">Add wines to your collection or schedule deliveries from storage to see drinking schedule</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[7px] top-0 bottom-0 w-[1px] bg-outline-variant/30"></div>
          <div className="absolute left-[7px] top-0 h-32 w-[1px] bg-primary-container shadow-[0_0_15px_rgba(255,191,0,0.4)]"></div>

          {/* Timeline entries */}
          <div className="space-y-16">
            {schedule.map((entry, idx) => (
              <section key={`${entry.year}-${idx}`} className="relative">
                {/* Timeline dot and month header */}
                <div className="flex items-center mb-8">
                  <div
                    className={`w-4 h-4 rounded-full border-4 border-background z-10 mr-6 ${
                      idx === 0 ? 'bg-primary-container' : 'bg-surface-container-highest outline outline-1 outline-outline-variant/30'
                    }`}
                  ></div>
                  <h3 className="font-headline text-2xl text-on-surface">{entry.month}</h3>
                </div>

                {/* Wines in this period */}
                <div className="space-y-10 pl-10">
                  {entry.wines.map((wine, idx) => {
                    const isConsumed = wine.consumed || false
                    const consumedDate = wine.consumedDate ? new Date(wine.consumedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : null
                    const wineData = wines.find(w => w.id === wine.id)
                    const isAtHome = wineData?.location === 'home'

                    return (
                      <div key={`${entry.year}-${entry.month}-${wine.id}-${idx}`} className="relative group">
                        {/* Design system colors: consumed entries use darker neutral background (#0D0D0D) and dimmed text */}
                        <div
                          className={`flex flex-col p-4 rounded-lg transition-all ${
                            isConsumed
                              ? 'bg-[#0D0D0D] opacity-75'
                              : 'bg-surface-container-low'
                          }`}
                        >
                          <span className={`text-xs font-bold tracking-widest uppercase mb-1 ${getTierColor(wine.tier)}`}>
                            {wine.status}
                          </span>
                          <div className="mb-2">
                            <WineInfo
                              wine={wine}
                              producerSize="lg"
                              nameSize="sm"
                              classificationSize="xs"
                              showClassification={true}
                              layout="vertical"
                            />
                          </div>
                          <div className="flex items-center gap-3 mt-1 mb-4">
                            <span className={`text-sm font-light ${isConsumed ? 'text-outline-variant' : 'text-outline'}`}>
                              {wine.vintage} Vintage
                            </span>
                            <span className={`h-1 w-1 rounded-full ${isConsumed ? 'bg-outline-variant/50' : 'bg-outline-variant'}`}></span>
                            <span className={`text-sm font-light ${isConsumed ? 'text-outline-variant' : 'text-outline'}`}>
                              {wine.region}
                            </span>
                          </div>

                          {isConsumed && consumedDate ? (
                            <div className="w-full py-2 px-3 bg-[#1A1A1A] rounded text-sm font-medium text-outline-variant text-center border border-outline-variant/20">
                              ✓ Consumed {consumedDate}
                            </div>
                          ) : !isAtHome ? (
                            <div className="w-full py-2 px-3 bg-surface-container rounded text-sm font-medium text-outline-variant text-center border border-outline-variant/20">
                              📦 In Storage (Pending Delivery)
                            </div>
                          ) : (
                            <button
                              onClick={() => handleMarkConsumed(wine.id, wine.producer, wine.name, entry.year, MONTH_TO_NUMBER[entry.month] || 1)}
                              disabled={isConsuming}
                              className="w-full py-2 px-3 bg-primary text-on-primary rounded text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                            >
                              {isConsuming ? 'Marking...' : 'Mark as Consumed'}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      {/* Info Box */}
      {schedule.length > 0 && (
        <div className="mt-16 p-6 bg-surface-container-low rounded-xl border border-outline-variant/10">
          <h4 className="font-headline text-lg font-bold mb-3">About This Schedule</h4>
          <p className="text-outline text-sm leading-relaxed mb-4">
            This drinking schedule is generated based on your wine's optimal drinking windows. Wines are ordered by tier and approaching peak maturity dates.
          </p>
          <p className="text-outline text-sm leading-relaxed">
            <strong>Phase 7</strong> will apply sophisticated scheduling rules considering consumption targets, tier spacing, and cellar management strategies.
          </p>
        </div>
      )}
    </div>
  )
}
