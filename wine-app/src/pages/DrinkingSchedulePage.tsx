import { useState, useEffect, useRef } from 'react'
import { useWineStore } from '../store/wineStore'
import { ScheduleService } from '../services/schedule.service'
import { buildDeliveryScheduleEntries } from '../services/deliveryPlanning.service'
import * as db from '../services/database'
import * as workflows from '../services/workflows.service'
import WineInfo from '../components/WineInfo'
import LocationBadge from '../components/LocationBadge'
import MessageModal from '../components/MessageModal'
import { useToastStore } from '../store/toastStore'
import { wineDisplayName, drinkingWindowSummary, drinkingWindowYears } from '../services/wine.service'
import { DELIVERY_CONFIG } from '../config/deliveryConfig'
import { CircleCheck, Package, Wine as WineIcon, RefreshCw } from 'lucide-react'
import ConsumptionSheet from '../components/ConsumptionSheet'
import HoldButton from '../components/HoldButton'
import type { ConsumptionLogEntry } from '../types/index'
import PageHeading from '../components/PageHeading'

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
  /** Which tile is showing its "logged" tick, briefly, after a tap. */
  const [flashId, setFlashId] = useState<string | null>(null)
  const yearRefs = useRef(new Map<number, HTMLElement>())
  // Hold-to-log: a bottle being logged with a chosen date and note
  const [logging, setLogging] = useState<{ wineId: string; label: string } | null>(null)
  // An already-logged bottle being annotated from the toast
  const [amending, setAmending] = useState<{ entry: ConsumptionLogEntry; label: string } | null>(null)

  /** Log a bottle, then offer to annotate or undo it from the toast. */
  const logConsumption = async (
    wineId: string,
    label: string,
    consumedDate: string,
    notes?: string
  ) => {
    const entry = await workflows.consumeWine(wineId, consumedDate, notes)
    await loadWines()
    await generateDrinkingSchedule()

    showToast(`${label} marked as consumed`, {
      action: {
        label: notes ? 'Edit note' : 'Add note',
        run: () => setAmending({ entry, label }),
      },
      onUndo: async () => {
        try {
          await workflows.undoConsumeWine(entry.id)
          await loadWines()
          await generateDrinkingSchedule()
        } catch (error) {
          showToast(`Undo failed: ${(error as Error).message}`, { type: 'error' })
        }
      },
    })
  }

  /** Short tap: log it now, with today's date. */
  const handleMarkConsumed = async (wineId: string, producerName: string, wineName: string) => {
    setIsConsuming(true)
    // Acknowledge the tap immediately: the schedule takes a moment to
    // regenerate, and an icon with no label that does nothing visible
    // reads as a tap that missed.
    setFlashId(wineId)
    setTimeout(() => setFlashId(current => (current === wineId ? null : current)), 1200)
    try {
      const today = new Date().toISOString().split('T')[0]
      await logConsumption(wineId, wineDisplayName(producerName, wineName), today)
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Failed to mark consumed: ${(error as Error).message}`,
      })
    } finally {
      setIsConsuming(false)
    }
  }

  /** Hold: pick the date it was actually drunk, and note it. */
  const handleLogWithDetail = (wineId: string, producerName: string, wineName: string) => {
    setLogging({ wineId, label: wineDisplayName(producerName, wineName) })
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

      // The whole log, before the schedule exists. The planner needs to
      // know what has been drunk in order to plan what is left, so it
      // cannot be fetched year by year off the back of a schedule that
      // has not been built yet.
      const allLogs = await db.getAllConsumptionLog()
      const consumedCounts: Record<string, number> = {}
      for (const log of allLogs) {
        consumedCounts[log.wine_id] = (consumedCounts[log.wine_id] ?? 0) + 1
      }

      // Generate drinking schedule using ScheduleService with ALL wines
      const yearsNeeded = Math.ceil((wines.length / 30) * 1.5) + 5
      const drinkingSchedule = ScheduleService.generateDrinkingSchedule(wines, deliverySchedule, undefined, yearsNeeded, config.annual_consumption_target || DELIVERY_CONFIG.annualTarget, consumedCounts)

      if (drinkingSchedule.length === 0) {
        setSchedule([])
        return
      }

      // Group schedule entries by year/month for timeline display
      const grouped: Record<string, ScheduleEntry['wines']> = {}

      // Queue the same logs per wine in date order, so each marks exactly
      // one scheduled entry — a wine scheduled twice needs two drinks for
      // two ticks. Queues are keyed by wine alone (not wine-year) so
      // drinking a bottle early still ticks off a slot the engine had
      // planned for a later year. Previously these were re-fetched year by
      // year from the finished schedule, which silently dropped any drink
      // in a year the schedule no longer covered.
      const logQueues = new Map<string, string[]>() // wineId -> consumed dates asc
      for (const log of [...allLogs].sort((a, b) => a.consumed_date.localeCompare(b.consumed_date))) {
        if (!logQueues.has(log.wine_id)) logQueues.set(log.wine_id, [])
        logQueues.get(log.wine_id)!.push(log.consumed_date)
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
  const thisYear = new Date().getFullYear()

  /**
   * Which year the rail marks, before anything has been scrolled.
   *
   * The observer below only fires for a separator inside a band 20-40%
   * down the viewport, and on load the first one sits above that band —
   * so nothing fired and no year was ever marked until you scrolled
   * past the second. Derived rather than seeded through an effect:
   * there is nothing to synchronise, only a default to fall back on
   * until the observer has something to say.
   */
  const markedYear =
    activeYear !== null && years.includes(activeYear)
      ? activeYear
      : years.includes(thisYear)
        ? thisYear
        : years[0]

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

  return (
    <div className="px-6 max-w-3xl mx-auto py-8">
      {/* Hold-to-log: choose the date actually drunk, plus a note */}
      {logging && (
        <ConsumptionSheet
          isOpen
          onClose={() => setLogging(null)}
          wineLabel={logging.label}
          initialDate={new Date().toISOString().split('T')[0]}
          onSubmit={async ({ consumedDate, notes }) => {
            await logConsumption(logging.wineId, logging.label, consumedDate, notes || undefined)
          }}
        />
      )}

      {/* Annotating a bottle already logged */}
      {amending && (
        <ConsumptionSheet
          isOpen
          isAmendment
          onClose={() => setAmending(null)}
          wineLabel={amending.label}
          initialDate={amending.entry.consumed_date}
          initialNotes={amending.entry.notes}
          onSubmit={async ({ consumedDate, notes }) => {
            await workflows.amendConsumption(amending.entry.id, { consumedDate, notes })
            await loadWines()
            await generateDrinkingSchedule()
            showToast('Tasting note saved')
          }}
        />
      )}

      {/* Message Notification */}
      {message && (
        <MessageModal
          type={message.type}
          text={message.text}
          onClose={() => setMessage(null)}
        />
      )}

      {/* The whole drinking period on one screen.

          The rail is fixed and spans the viewport, and the years are
          spaced evenly down it — so the entire span of the collection,
          '26 to '37, is always in front of you and only the marker for
          where you are moves. A pill of stacked labels said the same
          thing in twice the width and scrolled its own jump targets out
          of reach.

          Labels sit *on* the line in the page's own colour, cutting it
          rather than standing beside it, which keeps the rail to 24px
          and off the cards. */}
      {years.length > 1 && (
        <nav
          aria-label="Jump to year"
          className="fixed left-1 top-24 bottom-24 z-40 w-6 flex flex-col items-center justify-between"
        >
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-1/2 -translate-x-[1px] w-[2px] bg-outline-variant"
          />
          {years.map(year => {
            const active = markedYear === year
            return (
              <button
                key={year}
                onClick={() => jumpToYear(year)}
                aria-current={active ? 'true' : undefined}
                className="relative bg-background px-1 py-0.5 leading-none transition-colors"
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 -m-1 rounded-full bg-primary-container/30 blur-[5px]"
                  />
                )}
                <span
                  className={`relative ${
                    active
                      ? 'text-[11px] font-bold text-primary-container'
                      : 'text-[9px] font-medium text-outline'
                  }`}
                >
                  &rsquo;{String(year).slice(-2)}
                </span>
              </button>
            )
          })}
        </nav>
      )}

      {/* Header: single line, matching the delivery page */}
      <PageHeading
        title="Drinking Schedule"
        action={
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
        }
      />

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
                        /* Three states, not two. A wine already drunk and
                           a wine still in storage were both simply dimmed,
                           so "done" and "not yet" looked alike; only the
                           icon told them apart. Storage now dims the whole
                           row, consumed keeps its check, and a wine you
                           can actually open tonight is the only one at
                           full strength. */
                        className={`flex items-center gap-3 p-4 rounded-[14px] transition-all ${
                          isConsumed
                            ? 'panel opacity-60'
                            : isAtHome
                              ? 'panel'
                              : 'panel bg-surface-container-lowest opacity-[0.55]'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          {/* No classification: dropped from the cellar
                              cards as clutter, and it is no less clutter
                              here. */}
                          <WineInfo
                            wine={wine}
                            producerSize="base"
                            nameSize="sm"
                            showClassification={false}
                            layout="vertical"
                          />
                          <p className={`text-xs font-light mt-0.5 ${isConsumed ? 'text-outline-variant' : 'text-outline'}`}>
                            {wine.vintage} · {wine.region}
                          </p>
                          {/* The window, spelled out. This is the screen
                              where you decide whether to open something,
                              and the month heading only says when the
                              planner put it here — not how long you have.
                              The verb comes from the same state machine as
                              the cellar's chip, so the two screens cannot
                              drift apart. */}
                          {wineData && !isConsumed && (
                            <div className="mt-0.5 flex items-center gap-3">
                              <p
                                className={`text-xs ${
                                  isAtHome ? 'text-primary-container' : 'text-outline'
                                }`}
                              >
                                {isAtHome
                                  ? drinkingWindowSummary(wineData)
                                  : `In storage \u00b7 ${drinkingWindowYears(wineData)}`}
                              </p>
                              {/* How many are left, where the schedule
                                  proposes opening one: whether to follow
                                  the suggestion depends on whether it is
                                  the last bottle. Counts only — drinking
                                  is the tile on the right. */}
                              <LocationBadge wine={wineData} />
                            </div>
                          )}
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
                          /* Muted tile, no action: this bottle is not
                              here yet. Tapping through to reschedule its
                              delivery is worth doing and is parked. */
                          <div
                            className="shrink-0 h-10 w-10 rounded-[10px] bg-surface-container-high flex items-center justify-center text-outline"
                            title="In storage — pending delivery"
                          >
                            <Package size={16} aria-hidden="true" />
                          </div>
                        ) : (
                          <HoldButton
                            onTap={() => handleMarkConsumed(wine.id, wine.producer, wine.name)}
                            onHold={() => handleLogWithDetail(wine.id, wine.producer, wine.name)}
                            disabled={isConsuming}
                            title="Tap to mark consumed, hold to set the date and add a note"
                            aria-label={`Mark ${wineDisplayName(wine.producer, wine.name)} as consumed`}
                            className="shrink-0 h-10 w-10 rounded-[10px] bg-primary-container text-on-primary hover:bg-primary disabled:opacity-50 transition-colors"
                          >
                            {/* A tap on an icon with no label leaves you
                                wondering whether it registered; the tile
                                answers for a moment before the row
                                becomes a consumed one. */}
                            {flashId === wine.id ? (
                              <CircleCheck size={18} aria-hidden="true" />
                            ) : (
                              <WineIcon size={16} aria-hidden="true" />
                            )}
                          </HoldButton>
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
