import type { Wine } from '../types/index'
import * as db from './database'
import * as workflows from './workflows.service'
import { ScheduleService } from './schedule.service'
import type { DeliveryDisplayEntry } from './schedule.service'
import { DELIVERY_CONFIG } from '../config/deliveryConfig'

/**
 * Delivery planning orchestration.
 *
 * This is the single place that combines the pure scheduling algorithm
 * (ScheduleService) with persisted delivery windows: locked windows are
 * loaded from the database, their committed bottles excluded from the
 * scheduler, and the results reconciled into one display schedule.
 * Pages consume this via the useDeliverySchedule hook.
 */

interface LockedWindowState {
  dbWindows: Awaited<ReturnType<typeof db.getAllDeliveryWindows>>
  lockedWindowWines: Map<string, Array<{ wine_id: string; quantity: number }>>
  completedWindowWines: Map<string, Array<{ wine_id: string; quantity: number }>>
  committedQuantities: Record<string, number>
  lockedDeliveries: Record<string, Array<{ wine_id: string; quantity: number }>>
}

/**
 * Fetch DB windows and their curated wine lists (for locked windows)
 * before generating the schedule so committed quantities can be
 * excluded from the scheduler — it then plans around them naturally.
 *
 * Completed windows are read too, but kept apart: their bottles are
 * already at home, so counting them as committed would reserve the same
 * bottles twice. They are only wanted as a record of what arrived.
 */
async function loadLockedWindowState(): Promise<LockedWindowState> {
  const dbWindows = await db.getAllDeliveryWindows()
  const lockedWindowWines = new Map<string, Array<{ wine_id: string; quantity: number }>>()
  const completedWindowWines = new Map<string, Array<{ wine_id: string; quantity: number }>>()
  const committedQuantities: Record<string, number> = {}
  const lockedDeliveries: Record<string, Array<{ wine_id: string; quantity: number }>> = {}

  for (const w of dbWindows) {
    if (w.status === 'completed') {
      const wws = await db.getDeliveryWindowWines(w.id)
      if (wws.length > 0) {
        completedWindowWines.set(w.id, wws.map(ww => ({ wine_id: ww.wine_id, quantity: ww.quantity })))
      }
    } else if (w.locked) {
      const wws = await db.getDeliveryWindowWines(w.id)
      const wineList = wws.map(ww => ({ wine_id: ww.wine_id, quantity: ww.quantity }))
      lockedWindowWines.set(w.id, wineList)
      lockedDeliveries[w.scheduled_date] = wineList
      for (const ww of wineList) {
        committedQuantities[ww.wine_id] = (committedQuantities[ww.wine_id] || 0) + ww.quantity
      }
    }
  }

  return { dbWindows, lockedWindowWines, completedWindowWines, committedQuantities, lockedDeliveries }
}

/**
 * Raw per-wine delivery entries, with bottles committed to locked
 * windows excluded and locked deliveries simulated for capacity math.
 * Used by the drinking schedule to know when wines become available.
 */
export async function buildDeliveryScheduleEntries(wines: Wine[]) {
  const config = await db.getCellarConfig()
  const totalAtHome = wines.reduce((sum, w) => sum + w.quantity_at_home, 0)
  const { committedQuantities, lockedDeliveries } = await loadLockedWindowState()

  return ScheduleService.generateDeliverySchedule(
    wines,
    config.max_home_capacity,
    totalAtHome,
    DELIVERY_CONFIG.months as [number, number],
    config.annual_consumption_target || 30,
    config.min_delivery_bottles || 24,
    committedQuantities,
    lockedDeliveries
  )
}

export async function buildDeliverySchedule(wines: Wine[]): Promise<DeliveryDisplayEntry[]> {
  const config = await db.getCellarConfig()
  const totalAtHome = wines.reduce((sum, w) => sum + w.quantity_at_home, 0)
  const { dbWindows, lockedWindowWines, completedWindowWines, committedQuantities, lockedDeliveries } =
    await loadLockedWindowState()

  // Generate the in-memory delivery schedule for storage wines, excluding
  // bottles already committed to locked windows and simulating locked
  // deliveries arriving so capacity calculations stay accurate.
  const deliveries = ScheduleService.generateDeliverySchedule(
    wines,
    config.max_home_capacity,
    totalAtHome,
    DELIVERY_CONFIG.months as [number, number],
    config.annual_consumption_target || 30,
    config.min_delivery_bottles || 24,
    committedQuantities,
    lockedDeliveries
  )

  // Reconcile the in-memory schedule with DB-backed locked windows.
  // Displaced wines (deferred out of a locked window) are relocated to
  // the next unlocked delivery so they don't vanish from the schedule.
  return ScheduleService.buildDisplaySchedule(
    deliveries,
    wines,
    dbWindows,
    lockedWindowWines,
    DELIVERY_CONFIG.months as [number, number],
    completedWindowWines
  )
}

/**
 * The next delivery date for a single wine: a DB-backed (locked or
 * completed-pending) window if one exists, otherwise the date the
 * in-memory schedule plans to deliver it.
 */
export async function getScheduledDeliveryDateForWine(
  wines: Wine[],
  wineId: string
): Promise<string | undefined> {
  const dbDate = await db.getNextScheduledDeliveryDateForWine(wineId)
  if (dbDate) return dbDate

  const wine = wines.find(w => w.id === wineId)
  if (!wine || wine.quantity_in_storage === 0) return undefined

  try {
    const schedule = await buildDeliverySchedule(wines)
    const entry = schedule.find(
      d => d.status !== 'completed' && d.wines.some(w => w.id === wineId)
    )
    return entry?.date
  } catch {
    // Delivery date is informational — never block the caller on it
    return undefined
  }
}

/**
 * Ensure the given display entry has a locked DB window backing it,
 * creating the window and persisting its current wine list if needed.
 * Returns the window id.
 */
async function ensureLockedWindow(delivery: DeliveryDisplayEntry): Promise<string> {
  let windowId = delivery.windowId
  if (!windowId) {
    const newWindow = await db.createDeliveryWindow({
      scheduled_date: delivery.date,
      locked: false,
      status: 'planned',
    })
    windowId = newWindow.id
  }

  const window = await db.getDeliveryWindowById(windowId)
  if (window && !window.locked) {
    // Persist current in-memory wines to DB before locking
    for (const wine of delivery.wines) {
      const existing = await db.getDeliveryWindowWine(windowId, wine.id)
      if (!existing) {
        await db.addWineToDeliveryWindow(windowId, wine.id, wine.quantity)
      }
    }
    await db.updateDeliveryWindow(windowId, { locked: true })
  }

  return windowId
}

/** Promote a wine into the first upcoming delivery. */
export async function promoteWineToNextDelivery(
  schedule: DeliveryDisplayEntry[],
  wineId: string,
  quantity: number
): Promise<void> {
  const firstDelivery = schedule.find(d => d.status !== 'completed')
  if (!firstDelivery) throw new Error('No upcoming delivery scheduled')

  // Check capacity at the delivery date, not today: we assume the user
  // will continue drinking at their configured annual rate between now
  // and the delivery, freeing space for the incoming bottles. Without
  // this projection, long-dated deliveries get rejected even when
  // they'd comfortably fit by the time they actually arrive.
  const config = await db.getCellarConfig()
  const freshWines = await db.getAllWines()
  const currentHome = freshWines.reduce((sum, w) => sum + w.quantity_at_home, 0)
  const firstDeliveryTotal = firstDelivery.wines.reduce((sum, w) => sum + w.quantity, 0)
  const projectedHomeAtDelivery = ScheduleService.projectHomeAtDate(
    currentHome,
    firstDelivery.date,
    config.annual_consumption_target || 30
  )
  const projectedAfterDelivery = projectedHomeAtDelivery + firstDeliveryTotal + quantity
  if (projectedAfterDelivery > config.max_home_capacity) {
    throw new Error(
      `Promoting would exceed home capacity on ${firstDelivery.date}. ` +
      `Projected at delivery: ${projectedHomeAtDelivery}, Delivery: ${firstDeliveryTotal}, Adding: ${quantity}, Max: ${config.max_home_capacity}`
    )
  }

  const windowId = await ensureLockedWindow(firstDelivery)

  // Add to what is already booked, don't replace it.
  //
  // A wine can legitimately sit in two windows at once — six magnums
  // travel as two cases of three, so the scheduler splits them — and
  // the quantity passed here is the bottles being brought forward, not
  // the new total. Overwriting meant promoting the second three set the
  // window back to the three already in it: nothing moved, no error was
  // raised, and the toast said it had worked.
  const existing = await db.getDeliveryWindowWine(windowId, wineId)
  if (existing) {
    await db.updateDeliveryWindowWine(windowId, wineId, existing.quantity + quantity)
  } else {
    await db.addWineToDeliveryWindow(windowId, wineId, quantity)
  }
}

/** Defer a wine out of the delivery on the given date. */
export async function deferWineFromDelivery(
  schedule: DeliveryDisplayEntry[],
  wineId: string,
  date: string
): Promise<void> {
  const delivery = schedule.find(d => d.date === date)
  if (!delivery) throw new Error('Delivery not found')

  if (delivery.wines.length <= 1) {
    throw new Error('Cannot defer the only wine in this delivery')
  }

  const windowId = await ensureLockedWindow(delivery)
  await db.removeWineFromDeliveryWindow(windowId, wineId)
}

/** Confirm a delivery: move its wines home and complete the window. */
export async function confirmDelivery(
  schedule: DeliveryDisplayEntry[],
  date: string
): Promise<void> {
  const entry = schedule.find(d => d.date === date)
  if (!entry) throw new Error('Delivery not found in schedule')

  // Validate the FULL delivery fits in home space before touching anything.
  // Without this, moveToHome would fail mid-loop on the first wine and
  // report its quantity (e.g. "6 bottles") instead of the full delivery
  // size (e.g. "19 bottles"), leaving the cellar in a partial state.
  const totalToDeliver = entry.wines.reduce((sum, w) => sum + w.quantity, 0)
  const config = await db.getCellarConfig()
  const freshWines = await db.getAllWines()
  const currentHome = freshWines.reduce((sum, w) => sum + w.quantity_at_home, 0)
  const availableSpace = config.max_home_capacity - currentHome
  if (totalToDeliver > availableSpace) {
    throw new Error(
      `Delivery of ${totalToDeliver} bottles exceeds home capacity. ` +
      `Current: ${currentHome}, Max: ${config.max_home_capacity}, Available: ${availableSpace}`
    )
  }

  // If no DB record exists yet for this scheduled date, create one now
  let windowId = entry.windowId
  if (!windowId) {
    const newWindow = await db.createDeliveryWindow({
      scheduled_date: date,
      locked: false,
      status: 'planned',
    })
    windowId = newWindow.id
  }

  const window = await db.getDeliveryWindowById(windowId)
  if (!window) throw new Error('Delivery window not found')

  // Move wines from storage to home
  for (const wine of entry.wines) {
    await workflows.moveToHome(wine.id, wine.quantity)
  }

  // Write down what actually arrived, if nothing has yet.
  //
  // A curated window already has its wine rows; one the scheduler
  // produced has none, and the moment its bottles move home the
  // scheduler stops planning them — so without this the record of what
  // was in the delivery is gone the second it is confirmed, and the
  // completed window is an empty date.
  const existingRows = await db.getDeliveryWindowWines(window.id)
  if (existingRows.length === 0) {
    for (const wine of entry.wines) {
      await db.addWineToDeliveryWindow(window.id, wine.id, wine.quantity)
    }
  }

  // Update window status and record actual delivery date
  const today = new Date()
  const actualDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  await db.updateDeliveryWindow(window.id, {
    status: 'completed',
    scheduled_date: actualDate,
  })
}
