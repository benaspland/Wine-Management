import { useMemo, useState, useEffect } from 'react'
import { useWineStore } from '../store/wineStore'
import type { Tier } from '../types/index'
import { TIER_LABELS } from '../types/index'
import * as db from '../services/database'
import { ScheduleService } from '../services/schedule.service'
import WineInfo from '../components/WineInfo'

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
  const [cellarCapacity, setCellarCapacity] = useState(80)
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set([new Date().getFullYear()]))

  // Load cellar config
  useEffect(() => {
    db.getCellarConfig().then(config => {
      setCellarCapacity(config.max_slots)
    })
  }, [])

  // Calculate current home inventory
  const homeWines = useMemo(() => {
    return wines.filter(w => w.location === 'home')
  }, [wines])

  // Calculate total bottles at home (sum of all quantities)
  const totalBottlesAtHome = useMemo(() => {
    return homeWines.reduce((sum, w) => sum + w.quantity, 0)
  }, [homeWines])

  // Generate delivery schedule using algorithm
  const deliveriesByYear = useMemo(() => {
    // Generate delivery schedule using ScheduleService
    const deliverySchedule = ScheduleService.generateDeliverySchedule(
      wines,
      cellarCapacity,
      totalBottlesAtHome,
      [3, 9] // Fixed delivery months: March and September
    )

    if (deliverySchedule.length === 0) {
      return {}
    }

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

    deliverySchedule.forEach(entry => {
      if (!grouped[entry.scheduled_date]) {
        grouped[entry.scheduled_date] = []
      }

      // Find the wine details
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

    return byYear
  }, [wines, cellarCapacity, homeWines.length])

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

  const availableSlots = cellarCapacity - homeWines.length
  const usedSlots = homeWines.length
  const years = Object.keys(deliveriesByYear)
    .map(Number)
    .sort((a, b) => a - b)

  return (
    <div className="px-6 max-w-5xl mx-auto py-8">
      {/* Header */}
      <header className="mb-12">
        <span className="text-primary-container font-label text-xs tracking-widest uppercase mb-2 block">
          Logistics & Intake
        </span>
        <h2 className="font-headline text-5xl md:text-7xl font-bold text-on-surface leading-tight mb-4">
          Upcoming Arrivals
        </h2>
        <p className="text-outline mt-4 max-w-md font-light">
          Inventory transitioning from professional climate-controlled storage to your private home vault.
        </p>
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
            const totalBottles = deliveries.reduce((sum, d) => sum + d.wines.reduce((s, w) => s + w.quantity, 0), 0)
            const totalWines = new Set(deliveries.flatMap(d => d.wines.map(w => w.id))).size

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
                    {deliveries.map((group, idx) => (
                      <section key={`delivery-${year}-${idx}`}>
                      <div className="mb-6 pb-4 border-b border-outline-variant/10">
                        <h4 className="font-headline text-xl text-on-surface">
                          {new Date(group.date).toLocaleDateString('en-US', {
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </h4>
                      </div>

                      <div className="grid gap-4">
                        {group.wines.map((wine, wineIdx) => (
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

                            <div className="text-right flex items-center">
                              <div className="text-2xl font-headline text-primary-container">{wine.quantity}x</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                    ))}
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
