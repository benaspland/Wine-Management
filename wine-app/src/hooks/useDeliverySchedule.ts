import { useCallback, useEffect, useRef, useState } from 'react'
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

  /**
   * Only the newest rebuild may set the schedule.
   *
   * Confirming a delivery starts two at once: the action's own, and the
   * one the store fires when the wines it reloaded arrive. Whichever
   * finished last used to win, and that was often the one planned from
   * the wine list as it stood before the bottles moved home — so the
   * confirmed delivery sat there still marked Next up, and confirming it
   * again failed because the bottles had already gone.
   */
  const latest = useRef(0)

  const refresh = useCallback(async () => {
    const request = ++latest.current
    try {
      // Read the store now rather than through the closure, which can
      // still hold the wines from before the action that called this.
      const nextSchedule = await planner.buildDeliverySchedule(useWineStore.getState().wines)
      if (request !== latest.current) return
      setSchedule(nextSchedule)
      setError(null)
    } catch (err) {
      if (request !== latest.current) return
      setError((err as Error).message)
    }
    // `wines` is what makes a new rebuild necessary, even though the
    // rebuild itself reads the store directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    async (wineId: string, key: string) => {
      await planner.deferWineFromDelivery(schedule, wineId, key)
      await refresh()
    },
    [schedule, refresh]
  )

  const confirmDelivery = useCallback(
    async (key: string) => {
      await planner.confirmDelivery(schedule, key)
      await loadWines()
      await refresh()
    },
    [schedule, loadWines, refresh]
  )

  return { schedule, error, cellarCapacity, refresh, promoteWine, deferWine, confirmDelivery }
}
