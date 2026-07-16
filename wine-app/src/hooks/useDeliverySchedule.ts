import { useCallback, useEffect, useState } from 'react'
import { useWineStore } from '../store/wineStore'
import type { DeliveryDisplayEntry } from '../services/schedule.service'
import * as planner from '../services/deliveryPlanning.service'
import * as db from '../services/database'

/**
 * Owns the delivery schedule for a page: regenerates it whenever wine
 * data changes and exposes the promote/defer/confirm actions. All
 * orchestration lives in deliveryPlanning.service — this hook only
 * binds it to React state and the wine store.
 */
export function useDeliverySchedule() {
  const wines = useWineStore(state => state.wines)
  const scheduleUpdateTrigger = useWineStore(state => state.scheduleUpdateTrigger)
  const loadWines = useWineStore(state => state.loadWines)

  const [schedule, setSchedule] = useState<DeliveryDisplayEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cellarCapacity, setCellarCapacity] = useState(80)

  useEffect(() => {
    db.getCellarConfig().then(config => setCellarCapacity(config.max_home_capacity))
  }, [])

  const refresh = useCallback(async () => {
    try {
      const nextSchedule = await planner.buildDeliverySchedule(wines)
      setSchedule(nextSchedule)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [wines])

  useEffect(() => {
    // Data fetch on change; state is only set after the async pipeline resolves.
    // scheduleUpdateTrigger bumps whenever inventory changes elsewhere.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh, scheduleUpdateTrigger])

  const promoteWine = useCallback(
    async (wineId: string, quantity: number) => {
      await planner.promoteWineToNextDelivery(schedule, wineId, quantity)
      await refresh()
    },
    [schedule, refresh]
  )

  const deferWine = useCallback(
    async (wineId: string, date: string) => {
      await planner.deferWineFromDelivery(schedule, wineId, date)
      await refresh()
    },
    [schedule, refresh]
  )

  const confirmDelivery = useCallback(
    async (date: string) => {
      await planner.confirmDelivery(schedule, date)
      await loadWines()
      await refresh()
    },
    [schedule, loadWines, refresh]
  )

  return { schedule, error, cellarCapacity, refresh, promoteWine, deferWine, confirmDelivery }
}
