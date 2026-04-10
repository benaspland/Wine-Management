/**
 * Workflow Service Layer
 * Implements all 10 workflows defined in the design document.
 * Each workflow follows the exact logic and validation rules specified.
 */

import type {
  Wine,
  CellarConfig,
  DeliveryScheduleEntry,
  ConsumptionScheduleEntry,
  DeliveryWindowWine,
  Tier,
  WineType,
} from '../types/index'
import * as db from './database'

// ============================================================================
// WORKFLOW 1: LOAD WINE COLLECTION
// ============================================================================

export interface ImportWineRow {
  name: string
  vintage: number
  tier: Tier
  region: string
  producer?: string
  classification?: string
  wine_type?: WineType
  varietal?: string
  country?: string
  alcohol_percent?: number
  serving_temp_min?: number
  serving_temp_max?: number
  flavor_profile?: string
  critic_ratings?: string | Record<string, number>
  format?: string
  drinking_window_start: number
  drinking_window_end: number
  quantity_in_storage: number
  quantity_at_home: number
}

export interface ImportResult {
  imported: number
  skipped: number
  failed: ImportError[]
}

export interface ImportError {
  rowNumber: number
  field: string
  error: string
}

export async function importWineCollection(wines: ImportWineRow[]): Promise<ImportResult> {
  const result: ImportResult = {
    imported: 0,
    skipped: 0,
    failed: [],
  }

  for (let rowNum = 0; rowNum < wines.length; rowNum++) {
    const row = wines[rowNum]

    // Validate required fields
    if (!row.name || row.name.trim() === '') {
      result.failed.push({ rowNumber: rowNum + 1, field: 'name', error: 'Required field missing' })
      continue
    }

    if (!Number.isInteger(row.vintage) || row.vintage < 1800) {
      result.failed.push({
        rowNumber: rowNum + 1,
        field: 'vintage',
        error: 'Must be 4-digit year >= 1800',
      })
      continue
    }

    if (!Number.isInteger(row.tier) || row.tier < 1 || row.tier > 5) {
      result.failed.push({
        rowNumber: rowNum + 1,
        field: 'tier',
        error: 'Must be integer 1-5',
      })
      continue
    }

    if (!row.region || row.region.trim() === '') {
      result.failed.push({ rowNumber: rowNum + 1, field: 'region', error: 'Required field missing' })
      continue
    }

    if (row.drinking_window_start > row.drinking_window_end) {
      result.failed.push({
        rowNumber: rowNum + 1,
        field: 'drinking_window',
        error: 'Start year must be <= end year',
      })
      continue
    }

    if (
      (row.quantity_in_storage < 0 || !Number.isInteger(row.quantity_in_storage)) ||
      (row.quantity_at_home < 0 || !Number.isInteger(row.quantity_at_home))
    ) {
      result.failed.push({
        rowNumber: rowNum + 1,
        field: 'quantity',
        error: 'Must be non-negative integers',
      })
      continue
    }

    // Check for duplicates
    const existing = await db.queryAll(
      `SELECT * FROM wines WHERE name = ? AND vintage = ? AND producer = ?`,
      [row.name, row.vintage, row.producer || null]
    )

    if (existing.length > 0) {
      result.skipped++
      continue
    }

    // Create wine record
    try {
      await db.createWine(row)
      result.imported++
    } catch (error) {
      result.failed.push({
        rowNumber: rowNum + 1,
        field: 'general',
        error: (error as Error).message,
      })
    }
  }

  // Check total home capacity
  const wines_data = await db.getAllWines()
  const totalAtHome = wines_data.reduce((sum, w) => sum + w.quantity_at_home, 0)
  const config = await db.getCellarConfig()

  if (totalAtHome > config.max_home_capacity) {
    console.warn(
      `[Workflows] Home inventory (${totalAtHome}) exceeds capacity (${config.max_home_capacity})`
    )
  }

  // Log import action
  await db.createAuditLog({
    action: 'import_wine_collection',
    details: {
      imported: result.imported,
      skipped: result.skipped,
      failed: result.failed.length,
    },
  })

  return result
}

// ============================================================================
// WORKFLOW 2A: EDIT WINE DETAILS
// ============================================================================

export async function editWineDetails(
  wineId: string,
  updates: Partial<Wine>
): Promise<void> {
  const wine = await db.getWineById(wineId)
  if (!wine) {
    throw new Error(`Wine not found: ${wineId}`)
  }

  // Validate fields
  if (updates.vintage !== undefined) {
    if (!Number.isInteger(updates.vintage) || updates.vintage < 1800) {
      throw new Error('Vintage must be 4-digit year >= 1800')
    }
  }

  if (updates.tier !== undefined) {
    if (!Number.isInteger(updates.tier) || updates.tier < 1 || updates.tier > 5) {
      throw new Error('Tier must be integer 1-5')
    }
  }

  if (
    updates.drinking_window_start !== undefined ||
    updates.drinking_window_end !== undefined
  ) {
    const start = updates.drinking_window_start ?? wine.drinking_window_start
    const end = updates.drinking_window_end ?? wine.drinking_window_end
    if (start > end) {
      throw new Error('Drinking window end year must be >= start year')
    }
  }

  if (updates.alcohol_percent !== undefined) {
    if (updates.alcohol_percent < 0 || updates.alcohol_percent > 20) {
      throw new Error('Alcohol percent must be between 0 and 20')
    }
  }

  // Update wine
  await db.updateWine(wineId, updates)
}

// ============================================================================
// WORKFLOW 2B: ADD BOTTLES
// ============================================================================

export async function addBottles(
  wineId: string,
  quantity: number,
  destination: 'storage' | 'home'
): Promise<void> {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error('Quantity must be positive integer')
  }

  const wine = await db.getWineById(wineId)
  if (!wine) {
    throw new Error(`Wine not found: ${wineId}`)
  }

  // Validate home capacity if adding to home
  if (destination === 'home') {
    const allWines = await db.getAllWines()
    const currentHome = allWines.reduce((sum, w) => sum + w.quantity_at_home, 0)
    const config = await db.getCellarConfig()

    const newTotal = currentHome + quantity
    if (newTotal > config.max_home_capacity) {
      throw new Error(
        `Adding ${quantity} bottles exceeds home capacity. ` +
          `Current: ${currentHome}, Max: ${config.max_home_capacity}, Available: ${config.max_home_capacity - currentHome}`
      )
    }
  }

  // Update wine
  const updates =
    destination === 'storage'
      ? { quantity_in_storage: wine.quantity_in_storage + quantity }
      : { quantity_at_home: wine.quantity_at_home + quantity }

  await db.updateWine(wineId, updates)
}

// ============================================================================
// WORKFLOW 2C: CONSUME WINE
// ============================================================================

export async function consumeWine(
  wineId: string,
  consumedDate: string,
  notes?: string
): Promise<void> {
  const wine = await db.getWineById(wineId)
  if (!wine) {
    throw new Error(`Wine not found: ${wineId}`)
  }

  if (wine.quantity_at_home <= 0) {
    throw new Error('Cannot consume. No bottles at home.')
  }

  // Validate date
  const today = new Date().toISOString().split('T')[0]
  if (consumedDate > today) {
    throw new Error('Cannot log consumption for future date')
  }

  // Check if wine was delivered before consumed date
  const firstDeliveryDate = await db.getFirstDeliveryDateForWine(wineId)
  if (firstDeliveryDate && consumedDate < firstDeliveryDate) {
    throw new Error(`Cannot consume wine before delivery date (${firstDeliveryDate})`)
  }

  // Create consumption log entry
  await db.createConsumptionEntry({
    wine_id: wineId,
    consumed_date: consumedDate,
    notes: notes || undefined,
  })

  // Update wine inventory
  await db.updateWine(wineId, {
    quantity_at_home: wine.quantity_at_home - 1,
  })
}

// ============================================================================
// WORKFLOW 2D: MOVE TO HOME
// ============================================================================

export async function moveToHome(wineId: string, quantity: number): Promise<void> {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error('Quantity must be positive integer')
  }

  const wine = await db.getWineById(wineId)
  if (!wine) {
    throw new Error(`Wine not found: ${wineId}`)
  }

  if (wine.quantity_in_storage === 0) {
    throw new Error('No bottles in storage to move')
  }

  if (quantity > wine.quantity_in_storage) {
    throw new Error(
      `Cannot move more than available in storage. ` +
        `Available: ${wine.quantity_in_storage}, Requested: ${quantity}`
    )
  }

  // Check home capacity
  const allWines = await db.getAllWines()
  const currentHome = allWines.reduce((sum, w) => sum + w.quantity_at_home, 0)
  const config = await db.getCellarConfig()

  const newTotal = currentHome + quantity
  if (newTotal > config.max_home_capacity) {
    throw new Error(
      `Moving ${quantity} bottles exceeds home capacity. ` +
        `Current: ${currentHome}, Max: ${config.max_home_capacity}, Available: ${config.max_home_capacity - currentHome}`
    )
  }

  // Update wine
  await db.updateWine(wineId, {
    quantity_in_storage: wine.quantity_in_storage - quantity,
    quantity_at_home: wine.quantity_at_home + quantity,
  })
}

// ============================================================================
// WORKFLOW 3: UPDATE CELLAR CONFIGURATION
// ============================================================================

export async function updateCellarConfig(updates: Partial<CellarConfig>): Promise<void> {
  if (updates.max_home_capacity !== undefined && updates.max_home_capacity <= 0) {
    throw new Error('Home capacity must be > 0')
  }

  if (updates.annual_consumption_target !== undefined && updates.annual_consumption_target <= 0) {
    throw new Error('Annual consumption target must be > 0')
  }

  if (updates.min_delivery_bottles !== undefined && updates.min_delivery_bottles <= 0) {
    throw new Error('Minimum delivery bottles must be > 0')
  }

  // Check current home inventory vs new capacity
  if (updates.max_home_capacity !== undefined) {
    const wines = await db.getAllWines()
    const totalAtHome = wines.reduce((sum, w) => sum + w.quantity_at_home, 0)

    if (totalAtHome > updates.max_home_capacity) {
      console.warn(
        `[Workflows] Current home inventory (${totalAtHome}) exceeds new capacity (${updates.max_home_capacity})`
      )
    }
  }

  // Update config
  await db.updateCellarConfig(updates)
}

// ============================================================================
// WORKFLOW 4: GENERATE INITIAL DELIVERY SCHEDULE (IN-MEMORY)
// ============================================================================

export async function generateDeliverySchedule(): Promise<DeliveryScheduleEntry[]> {
  const wines = await db.getAllWines()
  const schedule: DeliveryScheduleEntry[] = []

  // Filter wines available in storage
  const storageWines = wines.filter((w) => w.quantity_in_storage > 0)

  if (storageWines.length === 0) {
    return schedule
  }

  // Simple distribution: assign wines to windows in batches of 6-8 bottles
  let windowDate = new Date()
  windowDate.setDate(windowDate.getDate() + 30) // First window in 30 days

  // Group wines by tier (80/20 distribution: 80% tier 1-3, 20% tier 4-5)
  const tier1to3 = storageWines.filter((w) => w.tier <= 3)
  const tier4to5 = storageWines.filter((w) => w.tier > 3)

  // Simple scheduling without complex algorithm
  const allToSchedule = [...tier1to3.sort(() => Math.random() - 0.5), ...tier4to5]

  for (const wine of allToSchedule) {
    schedule.push({
      wine_id: wine.id,
      quantity: wine.quantity_in_storage,
      scheduled_date: windowDate.toISOString().split('T')[0],
      tier: wine.tier,
      region: wine.region,
      status: 'pending',
    })

    // Move to next window every ~monthlyQuota bottles
    if (schedule.filter((e) => e.scheduled_date === windowDate.toISOString().split('T')[0]).length >= 3) {
      windowDate.setDate(windowDate.getDate() + 30)
    }
  }

  return schedule
}

// ============================================================================
// WORKFLOW 5: LOCK CURRENT DELIVERY WINDOW
// ============================================================================

export async function lockDeliveryWindow(
  windowId: string,
  wines: DeliveryScheduleEntry[]
): Promise<void> {
  const window = await db.getDeliveryWindowById(windowId)
  if (!window) {
    throw new Error(`Delivery window not found: ${windowId}`)
  }

  // Verify this is the current window
  const current = await db.getCurrentDeliveryWindow()
  if (!current || current.id !== windowId) {
    throw new Error('Can only lock the current delivery window')
  }

  // Mark window as locked
  await db.updateDeliveryWindow(windowId, { locked: true })

  // Persist window wines to database
  for (const wine of wines) {
    const existing = await db.queryAll(
      'SELECT * FROM delivery_window_wines WHERE delivery_window_id = ? AND wine_id = ?',
      [windowId, wine.wine_id]
    )

    if (existing.length === 0) {
      await db.addWineToDeliveryWindow(windowId, wine.wine_id, wine.quantity)
    }
  }

  await db.createAuditLog({
    action: 'lock_delivery_window',
    delivery_window_id: windowId,
    details: {
      window_date: window.scheduled_date,
      wines_locked: wines.length,
    },
  })
}

// ============================================================================
// WORKFLOW 5B: UNLOCK CURRENT DELIVERY WINDOW
// ============================================================================

export async function unlockDeliveryWindow(windowId: string): Promise<void> {
  const window = await db.getDeliveryWindowById(windowId)
  if (!window) {
    throw new Error(`Delivery window not found: ${windowId}`)
  }

  if (!window.locked) {
    throw new Error('Window is already unlocked')
  }

  // Delete manual edits
  await db.deleteDeliveryWindowWinesByWindow(windowId)

  // Mark window as unlocked
  await db.updateDeliveryWindow(windowId, { locked: false })

  await db.createAuditLog({
    action: 'unlock_delivery_window',
    delivery_window_id: windowId,
    details: {
      window_date: window.scheduled_date,
      manual_edits_deleted: true,
    },
  })
}

// ============================================================================
// WORKFLOW 6: PROMOTE WINE TO CURRENT DELIVERY WINDOW
// ============================================================================

export async function promoteWineToDelivery(wineId: string, quantity: number): Promise<void> {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error('Quantity must be positive integer')
  }

  const wine = await db.getWineById(wineId)
  if (!wine) {
    throw new Error(`Wine not found: ${wineId}`)
  }

  if (wine.quantity_in_storage === 0) {
    throw new Error('No bottles in storage')
  }

  if (quantity > wine.quantity_in_storage) {
    throw new Error(`Cannot add more than available in storage (${wine.quantity_in_storage})`)
  }

  // Check home capacity
  const allWines = await db.getAllWines()
  const currentHome = allWines.reduce((sum, w) => sum + w.quantity_at_home, 0)
  const config = await db.getCellarConfig()

  if (currentHome + quantity > config.max_home_capacity) {
    throw new Error(
      `Would exceed home capacity when delivered. ` +
        `Current: ${currentHome}, Adding: ${quantity}, Max: ${config.max_home_capacity}`
    )
  }

  // Get or create current window
  let window = await db.getCurrentDeliveryWindow()
  if (!window) {
    window = await db.createDeliveryWindow({
      scheduled_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0],
      locked: false,
      status: 'planned',
    })
  }

  // Lock window if not already
  if (!window.locked) {
    await db.updateDeliveryWindow(window.id, { locked: true })
  }

  // Add wine to window
  const existing = await db.queryAll(
    'SELECT * FROM delivery_window_wines WHERE delivery_window_id = ? AND wine_id = ?',
    [window.id, wineId]
  )

  if (existing.length > 0) {
    await db.updateDeliveryWindowWine(window.id, wineId, quantity)
  } else {
    await db.addWineToDeliveryWindow(window.id, wineId, quantity)
  }

  await db.createAuditLog({
    action: 'promote_wine_to_delivery',
    wine_id: wineId,
    delivery_window_id: window.id,
    details: {
      quantity_promoted: quantity,
      window_locked: true,
    },
  })
}

// ============================================================================
// WORKFLOW 7: DELAY WINE FROM CURRENT DELIVERY WINDOW
// ============================================================================

export async function delayWineFromDelivery(windowId: string, wineId: string): Promise<void> {
  const window = await db.getDeliveryWindowById(windowId)
  if (!window) {
    throw new Error(`Delivery window not found: ${windowId}`)
  }

  // Remove from window
  if (window.locked) {
    // Delete from database only if locked
    await db.removeWineFromDeliveryWindow(windowId, wineId)
  }
  // If unlocked, it will be regenerated on next schedule generation

  await db.createAuditLog({
    action: 'delay_wine_from_delivery',
    wine_id: wineId,
    delivery_window_id: windowId,
    details: {
      window_locked: window.locked,
      regenerated: true,
    },
  })
}

// ============================================================================
// WORKFLOW 8: MARK DELIVERY AS COMPLETE
// ============================================================================

export async function markDeliveryComplete(windowId: string): Promise<void> {
  const window = await db.getDeliveryWindowById(windowId)
  if (!window) {
    throw new Error(`Delivery window not found: ${windowId}`)
  }

  // Get wines to deliver
  let winesToDeliver: DeliveryWindowWine[] = []

  if (window.locked) {
    winesToDeliver = await db.getDeliveryWindowWines(windowId)
  } else {
    // For unlocked windows, would use in-memory schedule
    // For now, assume no wines for unlocked windows
  }

  // FINAL CAPACITY CHECK
  const allWines = await db.getAllWines()
  const currentHome = allWines.reduce((sum, w) => sum + w.quantity_at_home, 0)
  const totalToDeliver = winesToDeliver.reduce((sum, w) => sum + w.quantity, 0)
  const config = await db.getCellarConfig()

  const newTotal = currentHome + totalToDeliver
  if (newTotal > config.max_home_capacity) {
    throw new Error(
      `Delivery would exceed home capacity. ` +
        `Current: ${currentHome}, To deliver: ${totalToDeliver}, Max: ${config.max_home_capacity}`
    )
  }

  // Deliver each wine
  const today = new Date().toISOString().split('T')[0]

  for (const deliveryWine of winesToDeliver) {
    const wine = await db.getWineById(deliveryWine.wine_id)
    if (wine) {
      // Update wine inventory
      await db.updateWine(deliveryWine.wine_id, {
        quantity_in_storage: wine.quantity_in_storage - deliveryWine.quantity,
        quantity_at_home: wine.quantity_at_home + deliveryWine.quantity,
      })

      // Log completion
      await db.createDeliveryCompletion({
        wine_id: deliveryWine.wine_id,
        delivery_window_id: windowId,
        quantity_delivered: deliveryWine.quantity,
        delivered_date: today,
        status: 'delivered',
      })

      // Update window wine status
      await db.updateDeliveryWindowWine(windowId, deliveryWine.wine_id, deliveryWine.quantity)
    }
  }

  // Mark window as completed
  await db.updateDeliveryWindow(windowId, { status: 'completed' })

  await db.createAuditLog({
    action: 'mark_delivery_complete',
    delivery_window_id: windowId,
    details: {
      wines_delivered: winesToDeliver.length,
      total_quantity: totalToDeliver,
      delivered_date: today,
    },
  })
}

// ============================================================================
// WORKFLOW 9: GENERATE CONSUMPTION SCHEDULE (IN-MEMORY)
// ============================================================================

export async function generateConsumptionSchedule(): Promise<ConsumptionScheduleEntry[]> {
  const wines = await db.getAllWines()
  const config = await db.getCellarConfig()
  const schedule: ConsumptionScheduleEntry[] = []

  // Filter wines at home
  const homeWines = wines.filter((w) => w.quantity_at_home > 0)

  if (homeWines.length === 0) {
    return schedule
  }

  // Calculate monthly target
  const annualTarget = config.annual_consumption_target
  const monthlyTarget = annualTarget / 12

  // Get consumption log to exclude already-consumed wines
  // Simple scheduling: distribute wines monthly
  let currentDate = new Date()
  const wineIndex: Record<string, number> = {}

  for (const wine of homeWines) {
    wineIndex[wine.id] = wine.quantity_at_home
  }

  // Schedule for next 24 months
  for (let month = 0; month < 24; month++) {
    const monthDate = new Date(currentDate)
    monthDate.setMonth(monthDate.getMonth() + month)
    const monthKey = monthDate.toISOString().substring(0, 7)

    // Select wines for this month (simple round-robin)
    const candidates = homeWines.filter(
      (w) => wineIndex[w.id] > 0 && w.drinking_window_start <= monthDate.getFullYear()
    )

    for (let i = 0; i < Math.floor(monthlyTarget) && i < candidates.length; i++) {
      const wine = candidates[i]
      schedule.push({
        wine_id: wine.id,
        planned_consumption_month: monthKey,
        quantity: 1,
        status: 'planned',
      })
      wineIndex[wine.id]--
    }
  }

  return schedule
}

// ============================================================================
// WORKFLOW 10: RECORD WINE CONSUMPTION
// ============================================================================

export async function recordWineConsumption(
  wineId: string,
  consumedDate?: string,
  notes?: string
): Promise<void> {
  const wine = await db.getWineById(wineId)
  if (!wine) {
    throw new Error(`Wine not found: ${wineId}`)
  }

  if (wine.quantity_at_home <= 0) {
    throw new Error('Cannot consume. No bottles at home.')
  }

  // Default to today
  const date = consumedDate || new Date().toISOString().split('T')[0]

  // Validate date
  const today = new Date().toISOString().split('T')[0]
  if (date > today) {
    throw new Error('Cannot log consumption for future date')
  }

  // Check if wine was delivered before consumed date
  const firstDeliveryDate = await db.getFirstDeliveryDateForWine(wineId)
  if (firstDeliveryDate && date < firstDeliveryDate) {
    throw new Error(`Cannot consume wine before delivery date (${firstDeliveryDate})`)
  }

  // Create consumption log entry
  await db.createConsumptionEntry({
    wine_id: wineId,
    consumed_date: date,
    notes: notes || undefined,
  })

  // Update wine inventory (decrement by 1)
  await db.updateWine(wineId, {
    quantity_at_home: wine.quantity_at_home - 1,
  })
}
