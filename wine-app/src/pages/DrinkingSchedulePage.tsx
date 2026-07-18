import { useState, useEffect, useRef } from 'react'
import { useWineStore } from '../store/wineStore'
import { ScheduleService } from '../services/schedule.service'
import { buildDeliveryScheduleEntries } from '../services/deliveryPlanning.service'
import * as db from '../services/database'
import * as workflows from '../services/workflows.service'
import WineInfo from '../components/WineInfo'
import MessageModal from '../components/MessageModal'
import { useToastStore } from '../store/toastStore'
import { wineDisplayName } from '../services/wine.service'
import { DELIVERY_CONFIG } from '../config/deliveryConfig'
import { CircleCheck, Package, Wine as WineIcon, RefreshCw } from 'lucide-react'

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
  const showToast = useToastStore(state => state.show)
  const [isConsuming, setIsConsuming] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([])
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [activeYear, setActiveYear] = useState<number | null>(null)
  const yearRefs = useRef(new Map<number, HTMLElement>())

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

      const consumeDate = new Date().toISOString().split('T')[0]
      await workflows.consumeWine(wineId, consumeDate, `Scheduled for ${scheduleMonth}/${scheduleYear}`)
      await loadWines()
      await generateDrinkingSchedule()

      showToast(`${wineDisplayName(producerName, wineName)} marked as consumed`)
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
      // Shared planner: same locked-window handling as the delivery page,
      // so wine availability here matches the delivery schedule exactly.
      const deliverySchedule = await buildDeliveryScheduleEntries(wines)

      if (wines.length === 0) {
        setSchedule([])
        return
      }

      // Generate drinking schedule using ScheduleService with ALL wines
      const yearsNeeded = Math.ceil((wines.length / 30) * 1.5) + 5
      const drinkingSchedule = ScheduleService.generateDrinkingSchedule(wines, deliverySchedule, undefined, yearsNeeded, config.annual_consumption_target || DELIVERY_CONFIG.annualTarget)

      if (drinkingSchedule.length === 0) {
        setSchedule([])
        return
      }

      // Group schedule entries by year/month for timeline display
      const grouped: Record<string, ScheduleEntry['wines']> = {}

      // Batch load consumption logs across all scheduled years, queued per
      // wine in date order so each log marks exactly one scheduled entry —
      // a wine scheduled twice needs two drinks for two ticks. Queues are
      // keyed by wine alone (not wine-year) so drinking a bottle early
      // still ticks off a slot the engine had planned for a later year.
      const scheduledYears = [...new Set(drinkingSchedule.map(e => e.suggestedYear))].sort()
      const logQueues = new Map<string, string[]>() // wineId -> consumed dates asc
      for (const year of scheduledYears) {
        const logs = await db.getConsumptionLogByYear(year)
        logs.sort((a, b) => a.consumed_date.localeCompare(b.consumed_date))
        for (const log of logs) {
          if (!logQueues.has(log.wine_id)) logQueues.set(log.wine_id, [])
          logQueues.get(log.wine_id)!.push(log.consumed_date)
        }
      }

      // Entries arrive sorted by year/month, so earlier scheduled slots
      // claim earlier consumption logs.
      drinkingSchedule.forEach(entry => {
        const queue = logQueues.get(entry.wineId)
        const consumedDate = queue && queue.length > 0 ? queue.shift() : undefined

        // Consumed wines file under the month they were actually drunk;
        // everything else stays in its scheduled slot.
        let key = `${entry.suggestedYear}-${entry.suggestedMonth}`
        if (consumedDate) {
          const actual = new Date(consumedDate)
          if (!Number.isNaN(actual.getTime())) {
            key = `${actual.getFullYear()}-${actual.getMonth() + 1}`
          }
        }

        if (!grouped[key]) {
          grouped[key] = []
        }

        grouped[key].push({
          id: entry.wineId,
          producer: entry.producer ?? '',
          name: entry.name,
          vintage: entry.vintage,
          region: entry.region ?? '',
          tier: entry.tier,
          status: entry.status,
          consumed: !!consumedDate,
          consumedDate,
        })
      })

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
        .sort((a, b) => a.year !== b.year ? a.year - b.year : (MONTH_TO_NUMBER[a.month] || 0) - (MONTH_TO_NUMBER[b.month] || 0))

      setSchedule(timeline)
    } finally {
      setIsRegenerating(false)
    }
  }

  // Generate schedule on mount and when data changes
  useEffect(() => {
    generateDrinkingSchedule()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleUpdateTrigger])

  const years = [...new Set(schedule.map(entry => entry.year))]

  // Highlight the year currently in view as the user scrolls
  useEffect(() => {
    if (years.length === 0) return
    const observer = new IntersectionObserver(
      observed => {
        const visible = observed.filter(o => o.isIntersecting)
        if (visible.length > 0) {
          const year = Number(visible[0].target.getAttribute('data-year'))
          if (!Number.isNaN(year)) setActiveYear(year)
        }
      },
      { rootMargin: '-20% 0px -60% 0px' }
    )
    for (const el of yearRefs.current.values()) observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule])

  const jumpToYear = (year: number) => {
    yearRefs.current.get(year)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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

      {/* Year jump rail: tap a year to scroll straight to it */}
      {years.length > 1 && (
        <nav
          aria-label="Jump to year"
          className="fixed left-1 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-1 bg-[#131313]/70 backdrop-blur-xl rounded-full px-1 py-2 border border-outline-variant/15"
        >
          {years.map(year => (
            <button
              key={year}
              onClick={() => jumpToYear(year)}
              className={`text-[10px] font-bold tracking-wide px-1.5 py-1 rounded-full transition-colors ${
                activeYear === year
                  ? 'bg-primary-container text-on-primary'
                  : 'text-outline hover:text-on-surface'
              }`}
            >
              &rsquo;{String(year).slice(-2)}
            </button>
          ))}
        </nav>
      )}

      {/* Header: single line, matching the delivery page */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="font-headline text-3xl md:text-4xl font-bold text-on-surface whitespace-nowrap">
          Drinking Schedule
        </h1>
        <button
          onClick={generateDrinkingSchedule}
          disabled={isRegenerating}
          title="Regenerate schedule"
          aria-label="Regenerate schedule"
          className="btn-primary shrink-0 !px-4 disabled:opacity-50 flex items-center gap-2"
        >
          <RefreshCw size={16} className={isRegenerating ? 'animate-spin' : ''} aria-hidden="true" />
          <span className="hidden sm:inline">{isRegenerating ? 'Working...' : 'Regenerate'}</span>
        </button>
      </div>

      {/* Timeline */}
      {schedule.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-outline mb-4">No wines available to drink yet</p>
          <p className="text-outline-variant text-sm">Add wines to your collection or schedule deliveries from storage to see drinking schedule</p>
        </div>
      ) : (
        // Extra left padding clears the fixed year rail on narrow screens
        <div className={`space-y-8 ${years.length > 1 ? 'pl-7 md:pl-0' : ''}`}>
          {schedule.map((entry, idx) => {
            const prevEntry = idx > 0 ? schedule[idx - 1] : null
            const showYearSeparator = !prevEntry || prevEntry.year !== entry.year

            return (
              <section key={`${entry.year}-${idx}`} className="relative">
                {/* Year separator (anchor for the jump rail) */}
                {showYearSeparator && (
                  <div
                    ref={el => {
                      if (el) yearRefs.current.set(entry.year, el)
                    }}
                    data-year={entry.year}
                    className="flex items-center mb-6 scroll-mt-20"
                  >
                    <div className="h-[1px] flex-1 bg-outline-variant/30"></div>
                    <span className="px-4 font-headline text-lg tracking-widest text-primary-container font-bold">
                      {entry.year}
                    </span>
                    <div className="h-[1px] flex-1 bg-outline-variant/30"></div>
                  </div>
                )}

                <h3 className="font-headline text-xl text-on-surface mb-4">{entry.month}</h3>

                {/* Wines in this period: compact rows, status/action on the right */}
                <div className="space-y-2.5">
                  {entry.wines.map((wine, idx) => {
                    const isConsumed = wine.consumed || false
                    const consumedDate = wine.consumedDate ? new Date(wine.consumedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null
                    const wineData = wines.find(w => w.id === wine.id)
                    const isAtHome = (wineData?.quantity_at_home || 0) > 0

                    return (
                      <div
                        key={`${entry.year}-${entry.month}-${wine.id}-${idx}`}
                        className={`flex items-center gap-3 p-4 rounded-2xl transition-all ${
                          isConsumed ? 'bg-[#0D0D0D] opacity-75' : 'bg-surface-container-low'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <span className={`text-[10px] font-bold tracking-widest uppercase ${getTierColor(wine.tier)}`}>
                            {wine.status}
                          </span>
                          <WineInfo
                            wine={wine}
                            producerSize="base"
                            nameSize="sm"
                            classificationSize="xs"
                            showClassification={true}
                            layout="vertical"
                          />
                          <p className={`text-xs font-light mt-0.5 ${isConsumed ? 'text-outline-variant' : 'text-outline'}`}>
                            {wine.vintage} · {wine.region}
                          </p>
                        </div>

                        {/* Status / action, right-aligned to keep rows short */}
                        {isConsumed ? (
                          <div
                            className="shrink-0 flex flex-col items-center gap-0.5 text-success"
                            title={`Consumed ${consumedDate ?? ''}`}
                          >
                            <CircleCheck size={16} aria-hidden="true" />
                            <span className="text-[9px] text-outline-variant">{consumedDate}</span>
                          </div>
                        ) : !isAtHome ? (
                          <div
                            className="shrink-0 flex flex-col items-center gap-0.5 text-outline-variant"
                            title="In storage — pending delivery"
                          >
                            <Package size={16} aria-hidden="true" />
                            <span className="text-[9px]">storage</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleMarkConsumed(wine.id, wine.producer, wine.name, entry.year, MONTH_TO_NUMBER[entry.month] || 1)}
                            disabled={isConsuming}
                            title="Mark as consumed"
                            aria-label={`Mark ${wineDisplayName(wine.producer, wine.name)} as consumed`}
                            className="shrink-0 h-10 w-10 flex items-center justify-center rounded-full bg-primary-container text-on-primary hover:bg-primary disabled:opacity-50 transition-colors"
                          >
                            <WineIcon size={16} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
