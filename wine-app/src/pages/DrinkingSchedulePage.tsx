import { useState, useEffect } from 'react'
import { useWineStore } from '../store/wineStore'
import { ScheduleService } from '../services/schedule.service'
import * as db from '../services/database'
import WineInfo from '../components/WineInfo'

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
  }>
}

export default function DrinkingSchedulePage() {
  const wines = useWineStore(state => state.wines)
  const loadWines = useWineStore(state => state.loadWines)
  const [isConsuming, setIsConsuming] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([])
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [lastRegenerated, setLastRegenerated] = useState<string>('')

  // Generate schedule on mount
  useEffect(() => {
    generateDrinkingSchedule()
  }, [])

  const handleMarkConsumed = async (wineId: string, producerName: string, wineName: string) => {
    setIsConsuming(true)
    try {
      const wine = wines.find(w => w.id === wineId)
      if (!wine) throw new Error('Wine not found')

      // Consume 1 bottle of the wine
      await db.consumeWine(wineId, 1, `Consumed from drinking schedule`)

      // Reload wines to update quantities
      await loadWines()

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

      drinkingSchedule.forEach(entry => {
        const key = `${entry.suggestedYear}-${entry.suggestedMonth}`
        if (!grouped[key]) {
          grouped[key] = []
        }

        grouped[key].push({
          id: entry.wineId,
          producer: entry.producer,
          name: entry.name,
          vintage: entry.vintage,
          region: entry.region,
          tier: entry.tier,
          status: entry.status,
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div
            className={`bg-surface rounded-lg shadow-lg p-8 max-w-md mx-4 ${
              message.type === 'success'
                ? 'border-l-4 border-l-green-500'
                : 'border-l-4 border-l-red-500'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className={`text-3xl ${message.type === 'success' ? 'text-green-500' : 'text-red-500'}`}>
                {message.type === 'success' ? '✓' : '✕'}
              </div>
              <div className="flex-1">
                <h3 className="font-headline text-lg font-bold text-on-surface mb-2">
                  {message.type === 'success' ? 'Success' : 'Error'}
                </h3>
                <p className="text-on-surface text-sm">{message.text}</p>
              </div>
            </div>
            <button
              onClick={() => setMessage(null)}
              className="mt-6 w-full bg-primary text-on-primary py-2 rounded font-medium hover:bg-primary/90 transition-colors"
            >
              OK
            </button>
          </div>
        </div>
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
                {/* Timeline dot */}
                <div className="flex items-center mb-8">
                  <div
                    className={`w-4 h-4 rounded-full border-4 border-background z-10 mr-6 ${
                      idx === 0 ? 'bg-primary-container' : 'bg-surface-container-highest outline outline-1 outline-outline-variant/30'
                    }`}
                  ></div>
                  <h3 className="font-headline text-2xl text-on-surface">{entry.month} {entry.year}</h3>
                </div>

                {/* Wines in this period */}
                <div className="space-y-10 pl-10">
                  {entry.wines.map((wine, idx) => (
                    <div key={`${entry.year}-${entry.month}-${wine.id}-${idx}`} className="relative group">
                      <div className="flex flex-col bg-surface-container-low p-4 rounded-lg">
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
                          <span className="text-outline text-sm font-light">{wine.vintage} Vintage</span>
                          <span className="h-1 w-1 rounded-full bg-outline-variant"></span>
                          <span className="text-outline text-sm font-light">{wine.region}</span>
                        </div>
                        <button
                          onClick={() => handleMarkConsumed(wine.id, wine.producer, wine.name)}
                          disabled={isConsuming}
                          className="w-full py-2 px-3 bg-primary text-on-primary rounded text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                        >
                          {isConsuming ? 'Marking...' : 'Mark as Consumed'}
                        </button>
                      </div>
                    </div>
                  ))}
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
