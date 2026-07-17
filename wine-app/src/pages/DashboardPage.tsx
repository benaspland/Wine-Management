import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWineStore } from '../store/wineStore'
import * as db from '../services/database'
import * as planner from '../services/deliveryPlanning.service'
import {
  computeDashboardStats,
  computeDrinkingPace,
  nextDelivery,
  type DrinkingPace,
} from '../services/dashboard.service'
import { wineDisplayName } from '../services/wine.service'
import DonutChart from '../components/dashboard/DonutChart'
import BarList from '../components/dashboard/BarList'
import Meter from '../components/dashboard/Meter'
import { Wine as WineIcon, Truck, CalendarDays, TriangleAlert } from 'lucide-react'

/**
 * CVD-validated dark-mode categorical palette (5 slots, fixed order).
 * Types are assigned slots in canonical order so each type keeps its
 * color regardless of which types the collection contains.
 */
const TYPE_COLORS: Record<string, string> = {
  Red: '#3987e5',
  White: '#008300',
  'Rosé': '#d55181',
  Sparkling: '#c98500',
  Fortified: '#199e70',
}

interface NextDeliveryInfo {
  date: string
  bottles: number
  wines: number
}

function formatDeliveryDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function StatTile({ label, value, sub, to }: { label: string; value: string; sub?: string; to: string }) {
  return (
    <Link
      to={to}
      className="block bg-surface-container-low rounded-2xl p-4 hover:bg-surface-container transition-colors"
    >
      <p className="text-xs text-outline uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-sans font-semibold text-on-surface">{value}</p>
      {sub && <p className="text-xs text-outline mt-0.5">{sub}</p>}
    </Link>
  )
}

export default function DashboardPage() {
  const wines = useWineStore(state => state.wines)
  const scheduleUpdateTrigger = useWineStore(state => state.scheduleUpdateTrigger)
  const setWindowFilter = useWineStore(state => state.setWindowFilter)
  const setSortBy = useWineStore(state => state.setSortBy)

  /** Jump to the cellar pre-filtered to at-risk wines, most urgent first. */
  const presetDrinkSoon = () => {
    setWindowFilter('closing')
    setSortBy('window')
  }
  const presetReady = () => {
    setWindowFilter('ready')
    setSortBy('window')
  }

  const [pace, setPace] = useState<DrinkingPace | null>(null)
  const [capacity, setCapacity] = useState(80)
  const [delivery, setDelivery] = useState<NextDeliveryInfo | null>(null)

  const stats = computeDashboardStats(wines)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const [config, log] = await Promise.all([
        db.getCellarConfig(),
        db.getConsumptionLogByYear(new Date().getFullYear()),
      ])
      if (cancelled) return
      setCapacity(config.max_home_capacity)
      setPace(computeDrinkingPace(log, config.annual_consumption_target || 30))

      try {
        const schedule = await planner.buildDeliverySchedule(wines)
        if (!cancelled) setDelivery(nextDelivery(schedule))
      } catch {
        // The delivery tile is informational; never block the dashboard on it
        if (!cancelled) setDelivery(null)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [wines, scheduleUpdateTrigger])

  const donutSegments = stats.byType.map(slice => ({
    label: slice.label,
    value: slice.bottles,
    color: TYPE_COLORS[slice.label] ?? '#9c8f78',
  }))

  const paceCaption = pace
    ? pace.delta === 0
      ? 'On pace for the year'
      : pace.delta > 0
        ? `${pace.delta} ${pace.delta === 1 ? 'bottle' : 'bottles'} ahead of pace`
        : `${-pace.delta} ${pace.delta === -1 ? 'bottle' : 'bottles'} behind pace`
    : undefined

  // Fresh install: point at the two ways in instead of empty charts
  if (stats.totalWines === 0) {
    return (
      <div className="px-6 max-w-5xl mx-auto py-8">
        <h2 className="font-headline text-4xl md:text-7xl mb-8 text-on-surface">Cellar Overview</h2>
        <div className="bg-surface-container-low rounded-2xl p-8 text-center">
          <WineIcon size={40} className="text-outline mx-auto mb-4" aria-hidden="true" />
          <p className="text-on-surface mb-2 font-medium">Your cellar is empty</p>
          <p className="text-outline text-sm mb-6">
            Add wines one at a time, or import your whole collection from a CSV file.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/cellar" className="btn-primary">Go to Cellar</Link>
            <Link
              to="/settings"
              className="border border-outline-variant/30 text-outline-variant hover:text-outline px-6 py-3 text-xs tracking-widest uppercase font-bold rounded-full transition-colors"
            >
              Import CSV
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-6 max-w-5xl mx-auto py-8">
      <h2 className="font-headline text-4xl md:text-7xl mb-8 text-on-surface">Cellar Overview</h2>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatTile
          label="Total bottles"
          value={String(stats.totalBottles)}
          sub={
            stats.totalValue > 0
              ? `${stats.totalWines} wines · £${Math.round(stats.totalValue).toLocaleString()}`
              : `${stats.totalWines} wines`
          }
          to="/cellar"
        />
        <StatTile
          label="Ready to drink"
          value={String(stats.readyToDrinkWines)}
          sub="wines in window"
          to="/cellar"
        />
        <StatTile
          label="Consumed this year"
          value={pace ? String(pace.consumedThisYear) : '—'}
          sub={pace ? `target ${pace.target}` : undefined}
          to="/schedule"
        />
        <StatTile
          label="Next delivery"
          value={delivery ? formatDeliveryDate(delivery.date) : 'None'}
          sub={delivery ? `${delivery.bottles} bottles · ${delivery.wines} wines` : 'nothing scheduled'}
          to="/deliveries"
        />
      </div>

      {/* Meters */}
      <div className="bg-surface-container-low rounded-2xl p-5 mb-6 space-y-5">
        <Meter
          label="Home cellar"
          value={stats.bottlesAtHome}
          max={capacity}
          unit="bottles"
          caption={`${stats.bottlesInStorage} bottles in professional storage`}
        />
        {pace && (
          <Meter
            label="Drinking pace"
            value={pace.consumedThisYear}
            max={pace.target}
            unit="bottles"
            tickFraction={pace.target > 0 ? pace.expectedByNow / pace.target : undefined}
            tickLabel={`Expected by now: ${pace.expectedByNow}`}
            caption={paceCaption}
          />
        )}
      </div>

      {/* Composition */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="bg-surface-container-low rounded-2xl p-5">
          <h3 className="font-headline text-xl font-bold mb-4 text-on-surface">By type</h3>
          <DonutChart
            segments={donutSegments}
            centerValue={String(stats.totalBottles)}
            centerLabel="bottles"
          />
        </div>

        <div className="bg-surface-container-low rounded-2xl p-5">
          <h3 className="font-headline text-xl font-bold mb-4 text-on-surface">Top regions</h3>
          <BarList rows={stats.topRegions.map(r => ({ label: r.label, value: r.bottles }))} />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="bg-surface-container-low rounded-2xl p-5">
          <h3 className="font-headline text-xl font-bold mb-4 text-on-surface">By tier</h3>
          <BarList rows={stats.byTier.map(t => ({ label: t.label, value: t.wines }))} />
          <p className="text-xs text-outline mt-3">wines per tier</p>
        </div>

        {/* Window watch */}
        <div className="bg-surface-container-low rounded-2xl p-5">
          <h3 className="font-headline text-xl font-bold mb-4 text-on-surface">Drinking windows</h3>
          <div className="flex gap-6 mb-4 text-sm">
            <Link to="/cellar" onClick={presetReady} className="hover:opacity-80">
              <p className="text-2xl font-sans font-semibold text-on-surface">{stats.windowWatch.readyWines}</p>
              <p className="text-xs text-outline">ready now</p>
            </Link>
            <div>
              <p className="text-2xl font-sans font-semibold text-on-surface">{stats.windowWatch.waitingWines}</p>
              <p className="text-xs text-outline">still waiting</p>
            </div>
            <Link to="/cellar" onClick={presetDrinkSoon} className="hover:opacity-80">
              <p className={`text-2xl font-sans font-semibold ${stats.windowWatch.closingSoonWines > 0 ? 'text-[#c98500]' : 'text-on-surface'}`}>
                {stats.windowWatch.closingSoonWines}
              </p>
              <p className="text-xs text-outline">closing soon</p>
            </Link>
          </div>

          {stats.windowWatch.closingSoonest.length > 0 && (
            <ul className="space-y-2 border-t border-outline-variant/10 pt-3">
              {stats.windowWatch.closingSoonest.map(w => (
                <li key={w.id} className="flex items-center gap-2 text-sm">
                  <TriangleAlert size={14} className="text-[#c98500] shrink-0" aria-hidden="true" />
                  <span className="text-on-surface-variant truncate">
                    {wineDisplayName(w.producer, w.name)} {w.vintage}
                  </span>
                  <span className="text-outline ml-auto whitespace-nowrap">until {w.windowEnd}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-3">
        <Link
          to="/deliveries"
          className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface bg-surface-container-low rounded-full px-4 py-2.5 transition-colors"
        >
          <Truck size={16} aria-hidden="true" /> Manage deliveries
        </Link>
        <Link
          to="/schedule"
          className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface bg-surface-container-low rounded-full px-4 py-2.5 transition-colors"
        >
          <CalendarDays size={16} aria-hidden="true" /> Drinking schedule
        </Link>
      </div>
    </div>
  )
}
