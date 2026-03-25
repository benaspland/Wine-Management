import { useMemo, useState, useEffect } from 'react'
import { useWineStore } from '../store/wineStore'
import type { Tier } from '../types/index'
import { TIER_LABELS } from '../types/index'
import * as db from '../services/database'
import { ScheduleService } from '../services/schedule.service'

export default function DeliverySchedulePage() {
  const wines = useWineStore(state => state.wines)
  const [cellarCapacity, setCellarCapacity] = useState(80)

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

  // Generate delivery schedule using algorithm
  const schedule = useMemo(() => {
    // Generate delivery schedule using ScheduleService
    const deliverySchedule = ScheduleService.generateDeliverySchedule(
      wines,
      cellarCapacity,
      homeWines.length,
      [3, 9] // Fixed delivery months: March and September
    )

    if (deliverySchedule.length === 0) {
      return []
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
    return Object.entries(grouped)
      .map(([date, winesInDelivery]) => ({
        date,
        wines: winesInDelivery,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [wines, cellarCapacity, homeWines.length])

  const getTierColor = (tier: number): string => {
    if (tier === 5) return 'bg-primary text-on-primary-fixed-variant'
    if (tier === 4) return 'bg-on-surface text-surface'
    if (tier === 3) return 'border border-primary/40 text-primary'
    return 'bg-surface-container-high text-on-surface-variant'
  }

  const availableSlots = cellarCapacity - homeWines.length
  const usedSlots = homeWines.length

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
      {schedule.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-outline mb-4">No wines in storage to deliver</p>
          <p className="text-outline-variant text-sm">
            When you add wines to storage, delivery schedule will be generated here
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {schedule.map((group, idx) => (
            <section key={`delivery-${idx}`}>
              <div className="flex items-baseline gap-4 mb-6 border-b border-outline-variant/10 pb-4">
                <h3 className="font-headline text-2xl text-on-surface">
                  Arriving {new Date(group.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                </h3>
              </div>

              <div className="grid gap-4">
                {group.wines.map(wine => (
                  <div
                    key={wine.id}
                    className="bg-surface-container-low group hover:bg-surface-container transition-colors duration-300 flex items-center justify-between p-5 rounded-lg"
                  >
                    <div className="flex items-center gap-6">
                      <div className="w-16 h-24 bg-surface-container-highest rounded flex items-center justify-center overflow-hidden shrink-0">
                        <span className="material-symbols-outlined text-3xl text-outline opacity-50">
                          wine_bar
                        </span>
                      </div>

                      <div>
                        <h4 className="font-headline text-lg text-on-surface group-hover:text-primary transition-colors">
                          {wine.producer}
                        </h4>
                        <p className="text-outline text-sm font-light uppercase tracking-wider mb-2">
                          {wine.region} · {wine.vintage}
                        </p>
                        <div className="flex gap-2 flex-wrap">
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

      {/* Info Box */}
      <div className="mt-16 p-6 bg-surface-container-low rounded-xl border border-outline-variant/10">
        <h4 className="font-headline text-lg font-bold mb-3">About Delivery Scheduling</h4>
        <p className="text-outline text-sm leading-relaxed mb-4">
          Deliveries are currently shown as suggestions based on drinking windows. In Phase 7, the scheduling algorithm will apply your specific delivery rules:
        </p>
        <ul className="text-outline text-sm leading-relaxed space-y-2 ml-4">
          <li>• Maximum 2 deliveries per calendar year in fixed months</li>
          <li>• Tier 4-5 wines never before 2029</li>
          <li>• Minimum delivery thresholds (6/3/12 bottles by tier)</li>
          <li>• Diverse region/producer selection</li>
          <li>• Respect cellar capacity constraints</li>
        </ul>
      </div>
    </div>
  )
}
