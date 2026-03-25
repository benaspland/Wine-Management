import { useMemo } from 'react'
import { useWineStore } from '../store/wineStore'
import { WineService } from '../services/wine.service'

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

  // Group wines by drinking window months
  const schedule = useMemo(() => {
    const homeWines = wines.filter(w => w.location === 'home')

    if (homeWines.length === 0) {
      return []
    }

    // For now, group by drinking window start year/month
    // Phase 7 will apply the scheduling algorithm
    const grouped: Record<string, ScheduleEntry['wines']> = {}

    homeWines.forEach(wine => {
      // Create key from drinking window start
      const key = `${wine.drinking_window_start}`
      if (!grouped[key]) {
        grouped[key] = []
      }

      grouped[key].push({
        id: wine.id,
        producer: wine.producer,
        name: wine.name,
        vintage: wine.vintage,
        region: wine.region,
        tier: wine.tier,
        status: WineService.getDrinkingWindowLabel(wine),
      })
    })

    // Convert to timeline format
    const timeline: ScheduleEntry[] = Object.entries(grouped)
      .map(([yearStr, wines]) => {
        const year = parseInt(yearStr)
        return {
          month: 'Optimal Window',
          year,
          wines: wines.sort((a, b) => b.tier - a.tier),
        }
      })
      .sort((a, b) => a.year - b.year)

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
          <p className="text-outline mb-4">No wines in home cellar yet</p>
          <p className="text-outline-variant text-sm">Move wines from storage to home to see drinking schedule</p>
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
                  {entry.wines.map(wine => (
                    <div key={wine.id} className="relative group cursor-pointer hover:opacity-80 transition-opacity">
                      <div className="flex flex-col">
                        <span className={`text-xs font-bold tracking-widest uppercase mb-1 ${getTierColor(wine.tier)}`}>
                          {wine.status}
                        </span>
                        <h4 className="text-lg font-medium text-on-surface leading-snug">
                          {wine.producer}
                        </h4>
                        <p className="text-on-surface text-sm opacity-80">{wine.name}</p>
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
