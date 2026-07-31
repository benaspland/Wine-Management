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
import PageHeading from '../components/PageHeading'
import BarList from '../components/dashboard/BarList'
import StackedBar from '../components/dashboard/StackedBar'
import { Wine as WineIcon, Truck, CalendarDays, TriangleAlert } from 'lucide-react'

/**
 * Wine-type colours, from the skin tokens shared with every other
 * surface that colours a wine by type.
 *
 * The previous set was a generic categorical palette that painted Red
 * blue and White green — legible as categories, nonsense as wine. These
 * read as what they are, so the legend needs no decoding.
 */
const TYPE_COLORS: Record<string, string> = {
  Red: 'rgb(var(--wine-red))',
  White: 'rgb(var(--wine-white))',
  'Rosé': 'rgb(var(--wine-rose))',
  Sparkling: 'rgb(var(--wine-sparkling))',
  Fortified: 'rgb(var(--wine-fortified))',
}

const UNKNOWN_TYPE_COLOR = 'rgb(var(--text-tertiary))'

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
  /** Draws the number in the readiness colour — one tile, not four. */
  highlight?: boolean
}

function StatTile({ label, value, sub, to, onClick, variant = 'number', subUrgent, highlight }: StatTileProps) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="panel flex flex-col p-4 hover:bg-surface-container transition-colors"
    >
      <p className="text-xs text-outline uppercase tracking-wider mb-1">{label}</p>
      <p
        className={`font-sans font-semibold ${highlight ? 'text-highlight' : 'text-on-surface'} ${
          variant === 'number' ? 'text-2xl' : 'text-lg leading-snug'
        }`}
      >
        {value}
      </p>
      {sub && (
        <p className={`text-xs mt-0.5 ${subUrgent ? 'text-warn' : 'text-outline'}`}>{sub}</p>
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
  const setLocationFilter = useWineStore(state => state.setLocationFilter)
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
  const presetAtHome = () => {
    clearFilters()
    setLocationFilter('home')
  }
  const presetInStorage = () => {
    clearFilters()
    setLocationFilter('storage')
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

  const typeSegments = stats.byType.map(slice => ({
    label: slice.label,
    value: slice.bottles,
    color: TYPE_COLORS[slice.label] ?? UNKNOWN_TYPE_COLOR,
    to: '/cellar',
    onClick: () => presetType(slice.label),
  }))

  // Where the bottles are. A plain division of a whole, so it is drawn
  // as one — not as a fraction of the home capacity, which turned a
  // fact into a score against a configured ceiling.
  const locationSegments = [
    {
      label: 'At home',
      value: stats.bottlesAtHome,
      color: 'rgb(var(--highlight))',
      to: '/cellar',
      onClick: presetAtHome,
    },
    {
      label: 'Professional storage',
      value: stats.bottlesInStorage,
      color: 'rgb(var(--text-tertiary))',
      to: '/cellar',
      onClick: presetInStorage,
    },
  ]

  const closing = stats.windowWatch
  const closingHorizon = new Date().getFullYear() + CLOSING_SOON_YEARS
  const urgentShown = closing.drinkFirst.filter(w => w.urgent).length

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
        <PageHeading title="Cellar Overview" />
        <div className="panel p-[18px] text-center">
          <WineIcon size={40} className="text-outline mx-auto mb-4" aria-hidden="true" />
          <p className="text-on-surface mb-2 font-medium">Your cellar is empty</p>
          <p className="text-outline text-sm mb-6">
            Add wines one at a time, or import your whole collection from a CSV file.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/cellar" className="btn-primary">Go to Cellar</Link>
            <Link
              to="/settings"
              className="border border-outline-variant text-outline-variant hover:text-outline px-6 py-3 text-xs tracking-widest uppercase font-bold rounded-full transition-colors"
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
      <PageHeading title="Cellar Overview" />

      {/* Two rows, two questions. The first pairs the size of the cellar
          with what is about to join it; the second splits that cellar
          into what can be opened now and what is still laying down. Each
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
        <StatTile
          label="Next delivery"
          value={delivery ? formatDeliveryDate(delivery.date) : 'None'}
          sub={delivery ? `${delivery.bottles} bottles · ${delivery.wines} wines` : 'nothing scheduled'}
          to="/deliveries"
          variant="text"
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
          highlight
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
      </div>

      {/* Where the bottles are. This was a meter filling towards the
          configured home capacity, which read as a score out of a
          ceiling; home and storage are simply two parts of one total,
          so they are drawn that way. */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="panel p-[18px] min-w-0">
          <h3 className="font-headline text-xl font-bold mb-4 text-on-surface">Where it lives</h3>
          <StackedBar
            segments={locationSegments}
            unit="bottles"
            ariaLabel={`${stats.bottlesAtHome} bottles at home, ${stats.bottlesInStorage} in professional storage`}
          />
          {stats.bottlesAtHome > capacity && (
            <p className="mt-3 text-xs text-warn">
              {stats.bottlesAtHome - capacity} over the {capacity}-bottle home capacity
            </p>
          )}
        </div>

        {/* A donut cost a third of the card's width to say this, clipped
            its own labels, and — with a generic categorical palette —
            painted Red blue and White green. */}
        <div className="panel p-[18px] min-w-0">
          <h3 className="font-headline text-xl font-bold mb-4 text-on-surface">By type</h3>
          <StackedBar
            segments={typeSegments}
            unit="bottles"
            ariaLabel={`${stats.totalBottles} bottles by wine type`}
          />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="panel p-[18px] min-w-0">
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

        <div className="panel p-[18px] min-w-0">
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

      {/* The counts this card used to lead with — ready, waiting,
          closing — are the KPI row's job now, so all this card does is
          name wines: the ones nearest the end of their window, which
          is the question a cellar owner actually asks. Only those
          inside the two-year horizon carry the amber flag, so the
          flag means something when it appears. */}
      <div className="mb-6">
        <div className="panel p-[18px] min-w-0">
          <h3 className="font-headline text-xl font-bold mb-4 text-on-surface">Drink first</h3>

          {closing.drinkFirst.length > 0 ? (
            <>
              <ul className="space-y-3">
                {closing.drinkFirst.map(w => (
                  <li key={w.id} className="flex items-start gap-2.5 text-sm">
                    {/* A dot in the wine's own colour, so the list and
                        the by-type bar above are visibly the same data */}
                    <span
                      aria-hidden="true"
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: TYPE_COLORS[w.wineType] ?? UNKNOWN_TYPE_COLOR }}
                    />
                    {/* Wraps rather than truncates: a name cut off
                        mid-word is not a name. min-w-0 keeps a long one
                        from widening the page instead. */}
                    <span className="text-on-surface-variant min-w-0 line-clamp-2">
                      {wineDisplayName(w.producer, w.name)} {w.vintage}
                    </span>
                    <span
                      className={`ml-auto shrink-0 whitespace-nowrap ${w.urgent ? 'text-warn' : 'text-outline'}`}
                    >
                      {w.urgent && (
                        <TriangleAlert
                          size={12}
                          className="inline mr-1 -mt-0.5"
                          aria-label="closing soon"
                        />
                      )}
                      ready until {w.windowEnd}
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
                  className="block mt-4 pt-3 border-t border-outline-variant/60 text-xs text-outline hover:text-on-surface transition-colors"
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

      {/* The two places to go next, ranked: deliveries is the one with
          a date attached, so it takes the filled button. */}
      <div className="flex flex-col gap-3">
        <Link
          to="/deliveries"
          className="flex items-center justify-center gap-2 h-12 rounded-xl bg-highlight text-on-highlight text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          <Truck size={16} aria-hidden="true" /> Manage deliveries
        </Link>
        <Link
          to="/schedule"
          className="flex items-center justify-center gap-2 h-12 rounded-xl border border-highlight/50 text-highlight text-sm font-semibold hover:bg-highlight/10 transition-colors"
        >
          <CalendarDays size={16} aria-hidden="true" /> Drinking schedule
        </Link>
      </div>
    </div>
  )
}
