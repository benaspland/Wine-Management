import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWineStore } from '../store/wineStore'
import * as db from '../services/database'
import * as planner from '../services/deliveryPlanning.service'
import {
  CLOSING_SOON_YEARS,
  computeDashboardStats,
  nextDelivery,
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

interface StatTileProps {
  label: string
  value: string
  sub?: string
  to: string
  /** Applies the tap-through's filter before the route changes. */
  onClick?: () => void
  /** A date is not a quantity: it gets prose sizing, not the number ramp. */
  variant?: 'number' | 'text'
  /** Amber sub-line, for a warning that only exists sometimes. */
  subUrgent?: boolean
}

function StatTile({ label, value, sub, to, onClick, variant = 'number', subUrgent }: StatTileProps) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex flex-col bg-surface-container-low rounded-2xl p-4 hover:bg-surface-container transition-colors"
    >
      <p className="text-xs text-outline uppercase tracking-wider mb-1">{label}</p>
      <p
        className={`font-sans font-semibold text-on-surface ${
          variant === 'number' ? 'text-2xl' : 'text-lg leading-snug'
        }`}
      >
        {value}
      </p>
      {sub && (
        <p className={`text-xs mt-0.5 ${subUrgent ? 'text-[#c98500]' : 'text-outline'}`}>{sub}</p>
      )}
    </Link>
  )
}

export default function DashboardPage() {
  const wines = useWineStore(state => state.wines)
  const scheduleUpdateTrigger = useWineStore(state => state.scheduleUpdateTrigger)
  const setWindowFilter = useWineStore(state => state.setWindowFilter)
  const setSortBy = useWineStore(state => state.setSortBy)
  const setRegionFilter = useWineStore(state => state.setRegionFilter)
  const setTierFilter = useWineStore(state => state.setTierFilter)
  const setWineTypeFilter = useWineStore(state => state.setWineTypeFilter)
  const clearFilters = useWineStore(state => state.clearFilters)

  // Every dashboard tap-through starts from a clean slate so the cellar
  // shows exactly the tapped breakdown, not it intersected with whatever
  // filters were left over from the last visit.

  /** Jump to the cellar pre-filtered to at-risk wines, most urgent first. */
  const presetDrinkSoon = () => {
    clearFilters()
    setWindowFilter('closing')
    setSortBy('window')
  }
  const presetReady = () => {
    clearFilters()
    setWindowFilter('ready')
    setSortBy('window')
  }
  const presetMaturing = () => {
    clearFilters()
    setWindowFilter('waiting')
    setSortBy('window')
  }
  const presetRegion = (region: string) => {
    clearFilters()
    setRegionFilter(region)
  }
  const presetTier = (tier: number) => {
    clearFilters()
    setTierFilter(tier)
  }
  const presetType = (type: string) => {
    clearFilters()
    setWineTypeFilter(type)
  }

  const [capacity, setCapacity] = useState(80)
  const [delivery, setDelivery] = useState<NextDeliveryInfo | null>(null)

  const stats = computeDashboardStats(wines)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const config = await db.getCellarConfig()
      if (cancelled) return
      setCapacity(config.max_home_capacity)

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
    to: '/cellar',
    onClick: () => presetType(slice.label),
  }))

  const closing = stats.windowWatch
  const closingHorizon = new Date().getFullYear() + CLOSING_SOON_YEARS
  const urgentShown = closing.drinkFirst.filter(w => w.urgent).length
  const anyUrgent = urgentShown > 0

  // Prefer the at-risk cut when the list could not fit them all, and
  // fall back to the whole ready set. Null when the list already shows
  // everything there is.
  const moreToSee =
    closing.closingSoonWines > urgentShown
      ? { label: `All ${closing.closingSoonWines} closing by ${closingHorizon}`, onClick: presetDrinkSoon }
      : closing.readyWines > closing.drinkFirst.length
        ? { label: `All ${closing.readyWines} ready, soonest first`, onClick: presetReady }
        : null

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

      {/* What I have, what's ready, what's at risk, what's coming. Each
          tile applies its own filter on the way through, the same
          promise the charts below make. */}
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
          onClick={clearFilters}
        />
        {/* The at-risk count rides in the sub-line rather than taking a
            tile of its own: for a young cellar it is zero for years on
            end, and a permanently blank quarter of the top row buys
            nothing. It surfaces, in amber, on the day it matters. */}
        <StatTile
          label="Ready to drink"
          value={String(stats.readyToDrinkWines)}
          sub={
            closing.closingSoonWines > 0
              ? `${closing.closingSoonWines} closing by ${closingHorizon}`
              : `of ${stats.totalWines} wines`
          }
          subUrgent={closing.closingSoonWines > 0}
          to="/cellar"
          onClick={presetReady}
        />
        <StatTile
          label="Maturing"
          value={String(closing.waitingWines)}
          sub="not ready yet"
          to="/cellar"
          onClick={presetMaturing}
        />
        <StatTile
          label="Next delivery"
          value={delivery ? formatDeliveryDate(delivery.date) : 'None'}
          sub={delivery ? `${delivery.bottles} bottles · ${delivery.wines} wines` : 'nothing scheduled'}
          to="/deliveries"
          variant="text"
        />
      </div>

      {/* The one genuine ceiling in the app: rack space at home. The
          annual target sat here too, as bottles drunk out of a goal —
          but that figure is an input to the delivery planner, not a
          score, and a meter made a planning assumption look like a
          grade you could fail. */}
      <div className="bg-surface-container-low rounded-2xl p-5 mb-6">
        <Meter
          label="Home cellar"
          value={stats.bottlesAtHome}
          max={capacity}
          unit="bottles"
          caption={`${stats.bottlesInStorage} bottles in professional storage`}
        />
      </div>

      {/* Composition */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="bg-surface-container-low rounded-2xl p-5 min-w-0">
          <h3 className="font-headline text-xl font-bold mb-4 text-on-surface">By type</h3>
          <DonutChart
            segments={donutSegments}
            centerValue={String(stats.totalBottles)}
            centerLabel="bottles"
          />
        </div>

        <div className="bg-surface-container-low rounded-2xl p-5 min-w-0">
          <h3 className="font-headline text-xl font-bold mb-4 text-on-surface">Top regions</h3>
          <BarList
            rows={stats.topRegions.map(r =>
              // "Other" is an aggregate and "Unknown" wines have no region
              // value to filter on — those rows stay static.
              r.label === 'Other' || r.label === 'Unknown'
                ? { label: r.label, value: r.bottles }
                : {
                    label: r.label,
                    value: r.bottles,
                    to: '/cellar',
                    onClick: () => presetRegion(r.label),
                  }
            )}
          />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="bg-surface-container-low rounded-2xl p-5 min-w-0">
          <h3 className="font-headline text-xl font-bold mb-4 text-on-surface">By tier</h3>
          <BarList
            rows={stats.byTier.map(t => ({
              label: t.label,
              value: t.wines,
              to: '/cellar',
              onClick: () => presetTier(t.tier),
            }))}
          />
          <p className="text-xs text-outline mt-3">wines per tier</p>
        </div>

        {/* The counts this card used to lead with — ready, waiting,
            closing — are the KPI row's job now, so all this card does is
            name wines: the ones nearest the end of their window, which
            is the question a cellar owner actually asks. Only those
            inside the two-year horizon carry the amber flag, so the
            flag means something when it appears. */}
        <div className="bg-surface-container-low rounded-2xl p-5 min-w-0">
          <h3 className="font-headline text-xl font-bold mb-4 text-on-surface">Drink first</h3>

          {closing.drinkFirst.length > 0 ? (
            <>
              <ul className="space-y-2.5">
                {closing.drinkFirst.map(w => (
                  <li key={w.id} className="flex items-center gap-2 text-sm">
                    {/* The gutter is only reserved when some row in the
                        list fills it; otherwise every name sits indented
                        against a column that never appears. */}
                    {anyUrgent &&
                      (w.urgent ? (
                        <TriangleAlert size={14} className="text-[#c98500] shrink-0" aria-hidden="true" />
                      ) : (
                        <span className="w-[14px] shrink-0" aria-hidden="true" />
                      ))}
                    {/* min-w-0: a flex child will not shrink below its
                        content width without it, so truncate alone lets a
                        long name widen the whole page */}
                    <span className="text-on-surface-variant truncate min-w-0">
                      {wineDisplayName(w.producer, w.name)} {w.vintage}
                    </span>
                    <span
                      className={`ml-auto whitespace-nowrap ${w.urgent ? 'text-[#c98500]' : 'text-outline'}`}
                    >
                      until {w.windowEnd}
                    </span>
                  </li>
                ))}
              </ul>
              {/* Only offer a way through when there is something the
                  list has not already shown — "All 1 closing by 2028"
                  under a row naming that very wine is a dead link. */}
              {moreToSee && (
                <Link
                  to="/cellar"
                  onClick={moreToSee.onClick}
                  className="block mt-4 pt-3 border-t border-outline-variant/10 text-xs text-outline hover:text-on-surface transition-colors"
                >
                  {moreToSee.label} →
                </Link>
              )}
            </>
          ) : (
            <p className="text-sm text-outline">
              Nothing is in its drinking window yet — the whole cellar is still maturing.
            </p>
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
