import type {
  Wine,
  CellarConfig,
  ConsumptionLogEntry,
  DeliveryWindow,
  DeliveryWindowWine,
  DeliveryCompletionLog,
  AuditLogEntry,
} from '../types/index'
import { v4 as uuidv4 } from 'uuid'
import {
  createStorageAdapter,
  readLegacyLocalStorageSnapshot,
  type DbSnapshot,
  type StorageAdapter,
} from './storage/adapter'

/**
 * Typed repository over a document store.
 *
 * All tables are held in memory (the collection is small) and the whole
 * snapshot is persisted through a StorageAdapter after every mutation —
 * IndexedDB where available, localStorage otherwise. Data previously
 * saved by the legacy localStorage layer is migrated automatically.
 */

interface TableRowMap {
  wines: Wine
  cellar_config: CellarConfig
  consumption_log: ConsumptionLogEntry
  delivery_window: DeliveryWindow
  delivery_window_wines: DeliveryWindowWine
  delivery_completion_log: DeliveryCompletionLog
  audit_log: AuditLogEntry
}

type TableName = keyof TableRowMap

const TABLE_NAMES: TableName[] = [
  'wines',
  'cellar_config',
  'consumption_log',
  'delivery_window',
  'delivery_window_wines',
  'delivery_completion_log',
  'audit_log',
]

let tables: Map<TableName, unknown[]> = new Map()
let adapter: StorageAdapter | null = null

const DEFAULT_CONFIG: CellarConfig = {
  id: 1,
  max_home_capacity: 80,
  annual_consumption_target: 30,
  min_delivery_bottles: 24,
  created_at: undefined,
  updated_at: undefined,
}

// ============================================================================
// BACKUP & RESTORE
// The database lives only on the user's device, so a full-snapshot
// backup (every table, not just wines) is the safety net for upgrades
// and device loss. CSV export/import covers wines only.
// ============================================================================

export interface DatabaseBackup {
  format: 'wine-app-backup'
  version: 1
  exported_at: string
  tables: DbSnapshot
}

export async function exportDatabase(): Promise<DatabaseBackup> {
  const snapshot: DbSnapshot = {}
  for (const name of TABLE_NAMES) {
    // Deep copy: the backup must be a frozen point-in-time snapshot,
    // not live references that later mutations would leak into
    snapshot[name] = structuredClone(tables.get(name) ?? [])
  }
  return {
    format: 'wine-app-backup',
    version: 1,
    exported_at: new Date().toISOString(),
    tables: snapshot,
  }
}

/**
 * Replace the entire database with the contents of a backup file.
 * Destructive — callers must confirm with the user first. The snapshot
 * is written to storage and the database re-initialized so all the
 * usual normalization (config seeding, boolean coercion) applies.
 */
export async function restoreDatabase(backup: unknown): Promise<void> {
  if (typeof backup !== 'object' || backup === null) {
    throw new Error('Invalid backup file: not a JSON object')
  }
  const candidate = backup as Partial<DatabaseBackup>
  if (candidate.format !== 'wine-app-backup') {
    throw new Error('Invalid backup file: missing wine-app-backup marker')
  }
  if (typeof candidate.tables !== 'object' || candidate.tables === null) {
    throw new Error('Invalid backup file: missing tables')
  }
  for (const name of TABLE_NAMES) {
    const rows = candidate.tables[name]
    if (rows !== undefined && !Array.isArray(rows)) {
      throw new Error(`Invalid backup file: table "${name}" is not an array`)
    }
  }
  if (!Array.isArray(candidate.tables.wines)) {
    throw new Error('Invalid backup file: missing wines table')
  }

  if (!adapter) {
    adapter = createStorageAdapter()
  }
  const snapshot: DbSnapshot = {}
  for (const name of TABLE_NAMES) {
    snapshot[name] = candidate.tables[name] ?? []
  }
  await adapter.save(snapshot)
  await initializeDatabase()
}

/**
 * Wipe all collection data — wines, delivery windows, consumption and
 * delivery history, audit log — and start fresh. Cellar configuration
 * (capacity, targets) is deliberately preserved: resetting is for
 * re-importing a collection, not for re-doing setup. Destructive;
 * callers must confirm with the user first.
 */
export async function resetDatabase(): Promise<void> {
  const config = getTable('cellar_config').map((row) => ({ ...row }))

  if (!adapter) {
    adapter = createStorageAdapter()
  }
  const snapshot: DbSnapshot = {}
  for (const name of TABLE_NAMES) {
    snapshot[name] = []
  }
  snapshot.cellar_config = config
  await adapter.save(snapshot)
  await initializeDatabase()
}

export async function initializeDatabase(): Promise<void> {
  adapter = createStorageAdapter()

  let snapshot = await adapter.load()

  // One-time migration: pick up data written by the old localStorage layer
  if (!snapshot && adapter.name === 'indexeddb') {
    const legacy = readLegacyLocalStorageSnapshot()
    if (legacy) {
      console.log('[Database] Migrating legacy localStorage data to IndexedDB')
      snapshot = legacy
    }
  }

  tables = new Map()
  for (const name of TABLE_NAMES) {
    tables.set(name, snapshot?.[name] ?? [])
  }

  // Ensure the singleton config row exists and carries all fields
  const configs = getTable('cellar_config')
  if (configs.length === 0) {
    const now = new Date().toISOString()
    configs.push({ ...DEFAULT_CONFIG, created_at: now, updated_at: now })
  } else if (configs[0].min_delivery_bottles == null) {
    configs[0].min_delivery_bottles = DEFAULT_CONFIG.min_delivery_bottles
  }

  // Normalize booleans persisted as 0/1 by the legacy SQL-string layer
  for (const window of getTable('delivery_window')) {
    window.locked = Boolean(window.locked)
  }

  await persist()
}

function getTable<T extends TableName>(name: T): TableRowMap[T][] {
  const rows = tables.get(name)
  if (!rows) {
    throw new Error(`Database not initialized (missing table: ${name})`)
  }
  return rows as TableRowMap[T][]
}

async function persist(): Promise<void> {
  if (!adapter) return
  const snapshot: DbSnapshot = {}
  for (const name of TABLE_NAMES) {
    snapshot[name] = tables.get(name) ?? []
  }
  try {
    await adapter.save(snapshot)
  } catch (error) {
    console.warn('[Database] Failed to persist snapshot:', error)
  }
}

// ============================================================================
// WINES
// ============================================================================

export async function createWine(
  wine: Omit<Wine, 'id' | 'created_at' | 'updated_at'>
): Promise<Wine> {
  const now = new Date().toISOString()
  const record: Wine = {
    ...wine,
    id: uuidv4(),
    created_at: now,
    updated_at: now,
  }
  getTable('wines').push(record)
  await persist()
  return record
}

export async function getWineById(id: string): Promise<Wine | null> {
  return getTable('wines').find((w) => w.id === id) ?? null
}

export async function getAllWines(): Promise<Wine[]> {
  return [...getTable('wines')].sort((a, b) => a.name.localeCompare(b.name))
}

export async function findWineByNameVintageProducer(
  name: string,
  vintage: number,
  producer?: string
): Promise<Wine | null> {
  return (
    getTable('wines').find(
      (w) =>
        w.name === name &&
        w.vintage === vintage &&
        (w.producer ?? null) === (producer ?? null)
    ) ?? null
  )
}

export async function updateWine(id: string, updates: Partial<Wine>): Promise<void> {
  const wines = getTable('wines')
  const index = wines.findIndex((w) => w.id === id)
  if (index === -1) {
    throw new Error(`Wine not found: ${id}`)
  }

  const before = wines[index]
  const safeUpdates = { ...updates }
  delete safeUpdates.id
  delete safeUpdates.created_at
  wines[index] = { ...before, ...safeUpdates, updated_at: new Date().toISOString() }

  await createAuditLog({
    action: 'edit_wine_details',
    wine_id: id,
    details: {
      fields_changed: Object.keys(safeUpdates),
      old_values: before,
      new_values: safeUpdates,
    },
  })
}

export async function deleteWine(id: string): Promise<void> {
  const wines = getTable('wines')
  const index = wines.findIndex((w) => w.id === id)
  if (index !== -1) {
    wines.splice(index, 1)
  }
  await createAuditLog({
    action: 'delete_wine',
    wine_id: id,
    details: { wine_id: id },
  })
}

// ============================================================================
// CELLAR CONFIG
// ============================================================================

export async function getCellarConfig(): Promise<CellarConfig> {
  const config = getTable('cellar_config')[0]
  if (!config) {
    throw new Error('Cellar config not found')
  }
  if (config.min_delivery_bottles == null) {
    config.min_delivery_bottles = DEFAULT_CONFIG.min_delivery_bottles
  }
  return config as CellarConfig
}

export async function updateCellarConfig(updates: Partial<CellarConfig>): Promise<void> {
  const configs = getTable('cellar_config')
  const before = configs[0]
  if (!before) {
    throw new Error('Cellar config not found')
  }

  const safeUpdates = { ...updates }
  delete safeUpdates.id
  delete safeUpdates.created_at
  configs[0] = { ...before, ...safeUpdates, updated_at: new Date().toISOString() }

  await createAuditLog({
    action: 'update_cellar_config',
    details: {
      old_values: before,
      new_values: safeUpdates,
    },
  })
}

// ============================================================================
// CONSUMPTION LOG
// ============================================================================

export async function createConsumptionEntry(
  entry: Omit<ConsumptionLogEntry, 'id' | 'created_at'>
): Promise<ConsumptionLogEntry> {
  const record: ConsumptionLogEntry = {
    ...entry,
    id: uuidv4(),
    created_at: new Date().toISOString(),
  }
  getTable('consumption_log').push(record)
  await persist()
  return record
}

export async function getConsumptionEntryById(id: string): Promise<ConsumptionLogEntry | null> {
  return getTable('consumption_log').find((log) => log.id === id) ?? null
}

export async function deleteConsumptionEntry(id: string): Promise<void> {
  const logs = getTable('consumption_log')
  const index = logs.findIndex((log) => log.id === id)
  if (index === -1) {
    throw new Error(`Consumption entry not found: ${id}`)
  }
  logs.splice(index, 1)
  await persist()
}

export async function getConsumptionLogByWineId(
  wineId: string
): Promise<ConsumptionLogEntry[]> {
  return getTable('consumption_log')
    .filter((log) => log.wine_id === wineId)
    .sort((a, b) => b.consumed_date.localeCompare(a.consumed_date))
}

export async function getConsumptionLogByYear(year: number): Promise<ConsumptionLogEntry[]> {
  return getTable('consumption_log')
    .filter((log) => new Date(log.consumed_date).getFullYear() === year)
    .sort((a, b) => b.consumed_date.localeCompare(a.consumed_date))
}

// ============================================================================
// DELIVERY WINDOWS
// ============================================================================

export async function createDeliveryWindow(
  data: Omit<DeliveryWindow, 'id' | 'created_at' | 'updated_at'>
): Promise<DeliveryWindow> {
  const now = new Date().toISOString()
  const record: DeliveryWindow = {
    ...data,
    locked: Boolean(data.locked),
    id: uuidv4(),
    created_at: now,
    updated_at: now,
  }
  getTable('delivery_window').push(record)
  await persist()
  return record
}

export async function getDeliveryWindowById(id: string): Promise<DeliveryWindow | null> {
  return getTable('delivery_window').find((w) => w.id === id) ?? null
}

export async function getCurrentDeliveryWindow(): Promise<DeliveryWindow | null> {
  const open = getTable('delivery_window')
    .filter((w) => w.status !== 'completed')
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
  return open[0] ?? null
}

export async function getAllDeliveryWindows(): Promise<DeliveryWindow[]> {
  return [...getTable('delivery_window')].sort((a, b) =>
    a.scheduled_date.localeCompare(b.scheduled_date)
  )
}

export async function updateDeliveryWindow(
  id: string,
  updates: Partial<DeliveryWindow>
): Promise<void> {
  const windows = getTable('delivery_window')
  const index = windows.findIndex((w) => w.id === id)
  if (index === -1) {
    throw new Error(`Delivery window not found: ${id}`)
  }
  const safeUpdates = { ...updates }
  delete safeUpdates.id
  delete safeUpdates.created_at
  if (safeUpdates.locked !== undefined) {
    safeUpdates.locked = Boolean(safeUpdates.locked)
  }
  windows[index] = {
    ...windows[index],
    ...safeUpdates,
    updated_at: new Date().toISOString(),
  }
  await persist()
}

// ============================================================================
// DELIVERY WINDOW WINES
// ============================================================================

export async function addWineToDeliveryWindow(
  windowId: string,
  wineId: string,
  quantity: number
): Promise<DeliveryWindowWine> {
  const now = new Date().toISOString()
  const record: DeliveryWindowWine = {
    id: uuidv4(),
    delivery_window_id: windowId,
    wine_id: wineId,
    quantity,
    status: 'pending',
    created_at: now,
    updated_at: now,
  }
  getTable('delivery_window_wines').push(record)
  await persist()
  return record
}

export async function getDeliveryWindowWines(windowId: string): Promise<DeliveryWindowWine[]> {
  return getTable('delivery_window_wines').filter(
    (w) => w.delivery_window_id === windowId
  )
}

export async function getDeliveryWindowWine(
  windowId: string,
  wineId: string
): Promise<DeliveryWindowWine | null> {
  return (
    getTable('delivery_window_wines').find(
      (w) => w.delivery_window_id === windowId && w.wine_id === wineId
    ) ?? null
  )
}

export async function updateDeliveryWindowWine(
  windowId: string,
  wineId: string,
  quantity: number
): Promise<void> {
  const rows = getTable('delivery_window_wines')
  const index = rows.findIndex(
    (w) => w.delivery_window_id === windowId && w.wine_id === wineId
  )
  if (index !== -1) {
    rows[index] = { ...rows[index], quantity, updated_at: new Date().toISOString() }
    await persist()
  }
}

export async function removeWineFromDeliveryWindow(
  windowId: string,
  wineId: string
): Promise<void> {
  const rows = getTable('delivery_window_wines')
  const filtered = rows.filter(
    (w) => !(w.delivery_window_id === windowId && w.wine_id === wineId)
  )
  tables.set('delivery_window_wines', filtered)
  await persist()
}

export async function deleteDeliveryWindowWinesByWindow(windowId: string): Promise<void> {
  const rows = getTable('delivery_window_wines')
  tables.set(
    'delivery_window_wines',
    rows.filter((w) => w.delivery_window_id !== windowId)
  )
  await persist()
}

// ============================================================================
// DELIVERY COMPLETION LOG
// ============================================================================

export async function createDeliveryCompletion(
  data: Omit<DeliveryCompletionLog, 'id' | 'created_at'>
): Promise<DeliveryCompletionLog> {
  const record: DeliveryCompletionLog = {
    ...data,
    id: uuidv4(),
    created_at: new Date().toISOString(),
  }
  getTable('delivery_completion_log').push(record)
  await persist()
  return record
}

export async function getDeliveryCompletionByWineId(
  wineId: string
): Promise<DeliveryCompletionLog[]> {
  return getTable('delivery_completion_log')
    .filter((log) => log.wine_id === wineId)
    .sort((a, b) => b.delivered_date.localeCompare(a.delivered_date))
}

/**
 * First date the wine was (or will be) delivered. Actual completed
 * deliveries take precedence; otherwise the earliest non-completed
 * scheduled window containing the wine.
 */
export async function getFirstDeliveryDateForWine(wineId: string): Promise<string | null> {
  const completed = getTable('delivery_completion_log')
    .filter((log) => log.wine_id === wineId)
    .sort((a, b) => a.delivered_date.localeCompare(b.delivered_date))
  if (completed.length > 0) return completed[0].delivered_date

  return getNextScheduledDeliveryDateForWine(wineId)
}

/** Next non-completed delivery window date containing this wine. */
export async function getNextScheduledDeliveryDateForWine(
  wineId: string
): Promise<string | null> {
  const windowsById = new Map(
    getTable('delivery_window').map((w) => [w.id, w])
  )
  const dates = getTable('delivery_window_wines')
    .filter((ww) => ww.wine_id === wineId)
    .map((ww) => windowsById.get(ww.delivery_window_id))
    .filter((w) => w && w.status !== 'completed')
    .map((w) => w!.scheduled_date)
    .sort((a, b) => a.localeCompare(b))
  return dates[0] ?? null
}

// ============================================================================
// AUDIT LOG
// ============================================================================

export async function createAuditLog(
  data: Omit<AuditLogEntry, 'id' | 'created_at'>
): Promise<AuditLogEntry> {
  const record: AuditLogEntry = {
    ...data,
    id: uuidv4(),
    created_at: new Date().toISOString(),
  }
  getTable('audit_log').push(record)
  await persist()
  return record
}

export async function getAuditLog(limit: number = 100): Promise<AuditLogEntry[]> {
  return [...getTable('audit_log')]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit)
    .map((log) => ({
      ...log,
      // Legacy rows stored details as a JSON string
      details: typeof log.details === 'string' ? JSON.parse(log.details) : log.details,
    }))
}
