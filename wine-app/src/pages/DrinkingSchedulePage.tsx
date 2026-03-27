import { useMemo } from 'react'
import { useWineStore } from '../store/wineStore'
import { ScheduleService } from '../services/schedule.service'
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

  // Generate drinking schedule using algorithm
  const schedule = useMemo(() => {
    // For now, generate delivery schedule inline
    // In the future, this could be cached or passed from DeliverySchedulePage
    const cellarCapacity = 80 // Default; should come from settings
    const homeWineCount = wines.filter(w => w.location === 'home').length
    const deliverySchedule = ScheduleService.generateDeliverySchedule(wines, cellarCapacity, homeWineCount)

    if (wines.length === 0) {
      return []
    }

    // Generate drinking schedule using ScheduleService with ALL wines
    // Calculate years needed: assume ~30 wines/year consumption, so total wines / 30
    // Add buffer for spacing and tier constraints
    const yearsNeeded = Math.ceil((wines.length / 30) * 1.5) + 5
    const drinkingSchedule = ScheduleService.generateDrinkingSchedule(wines, deliverySchedule, undefined, yearsNeeded)

    if (drinkingSchedule.length === 0) {
      return []
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

    return timeline
  }, [wines])

  const getTierColor = (tier: number): string => {
    if (tier === 5) return 'text-primary-container'
    if (tier === 4) return 'text-primary'
    if (tier === 3) return 'text-secondary'
    return 'text-outline-variant'
  }

  return (
    <div className="px-6 max-w-3xl mx-auto py-8">
      {/* Header */}
      <div className="mb-16">
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
                    <div key={`${entry.year}-${entry.month}-${wine.id}-${idx}`} className="relative group cursor-pointer hover:opacity-80 transition-opacity">
                      <div className="flex flex-col">
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
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-outline text-sm font-light">{wine.vintage} Vintage</span>
                          <span className="h-1 w-1 rounded-full bg-outline-variant"></span>
                          <span className="text-outline text-sm font-light">{wine.region}</span>
                        </div>
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
