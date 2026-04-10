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

// Database abstraction layer - supports Electron and in-memory (dev) modes
let db: any = null
let dbType: 'electron' | 'memory' = 'memory'
let memoryStorage: Map<string, any[]> = new Map()

export function getDbType() {
  return dbType
}

export async function initializeDatabase() {
  const isElectron = (window as any).electronAPI !== undefined

  console.log('[Database] Initializing database...')
  console.log('[Database] window.electronAPI exists:', isElectron)

  if (isElectron) {
    dbType = 'electron'
    db = (window as any).electronAPI
    console.log('[Database] Using Electron SQLite database')
    if (!db) {
      console.warn('[Database] Electron API not found, falling back to memory storage')
      dbType = 'memory'
      await initMemoryDatabase()
    }
  } else {
    dbType = 'memory'
    await initMemoryDatabase()
  }

  console.log('[Database] Database type:', dbType)
  await createSchema()
}

async function initMemoryDatabase() {
  // Load from localStorage if available
  const stored = localStorage.getItem('wine-app-db')
  console.log('[Database] initMemoryDatabase: localStorage data exists =', !!stored)

  if (stored) {
    try {
      const data = JSON.parse(stored)
      memoryStorage = new Map(Object.entries(data))
      console.log('[Database] Loaded database from localStorage, wines count =', memoryStorage.get('wines')?.length)
      return
    } catch (error) {
      console.warn('[Database] Failed to load from localStorage, starting fresh:', error)
    }
  }

  // Initialize with empty tables
  console.log('[Database] Initializing fresh memory storage')
  memoryStorage = new Map()
  memoryStorage.set('wines', [])
  memoryStorage.set('cellar_config', [
    {
      id: 1,
      max_home_capacity: 80,
      annual_consumption_target: 30,
      min_delivery_bottles: 24,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ])
  memoryStorage.set('consumption_log', [])
  memoryStorage.set('delivery_window', [])
  memoryStorage.set('delivery_window_wines', [])
  memoryStorage.set('delivery_completion_log', [])
  memoryStorage.set('audit_log', [])
}

function persistMemoryDatabase() {
  try {
    const data = Object.fromEntries(memoryStorage)
    localStorage.setItem('wine-app-db', JSON.stringify(data))
  } catch (error) {
    console.warn('[Database] Failed to persist to localStorage:', error)
  }
}

async function createSchema() {
  if (dbType === 'memory') {
    return
  }

  const schema = `
    CREATE TABLE IF NOT EXISTS wines (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      vintage INTEGER NOT NULL,
      tier INTEGER NOT NULL CHECK(tier >= 1 AND tier <= 5),
      region TEXT NOT NULL,
      producer TEXT,
      classification TEXT,
      wine_type TEXT,
      varietal TEXT,
      country TEXT,
      alcohol_percent REAL CHECK(alcohol_percent >= 0 AND alcohol_percent <= 20),
      serving_temp_min INTEGER,
      serving_temp_max INTEGER,
      flavor_profile TEXT,
      critic_ratings TEXT,
      drinking_window_start INTEGER NOT NULL,
      drinking_window_end INTEGER NOT NULL,
      image_url TEXT,
      format TEXT,
      quantity_in_storage INTEGER NOT NULL DEFAULT 0 CHECK(quantity_in_storage >= 0),
      quantity_at_home INTEGER NOT NULL DEFAULT 0 CHECK(quantity_at_home >= 0),
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cellar_config (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      max_home_capacity INTEGER NOT NULL CHECK(max_home_capacity > 0),
      annual_consumption_target INTEGER NOT NULL CHECK(annual_consumption_target > 0),
      min_delivery_bottles INTEGER NOT NULL DEFAULT 24 CHECK(min_delivery_bottles > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS consumption_log (
      id TEXT PRIMARY KEY,
      wine_id TEXT NOT NULL,
      consumed_date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (wine_id) REFERENCES wines(id)
    );

    CREATE TABLE IF NOT EXISTS delivery_window (
      id TEXT PRIMARY KEY,
      scheduled_date TEXT NOT NULL,
      locked INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned', 'in_transit', 'completed')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS delivery_window_wines (
      id TEXT PRIMARY KEY,
      delivery_window_id TEXT NOT NULL,
      wine_id TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'delivered', 'failed')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (delivery_window_id) REFERENCES delivery_window(id),
      FOREIGN KEY (wine_id) REFERENCES wines(id),
      UNIQUE(delivery_window_id, wine_id)
    );

    CREATE TABLE IF NOT EXISTS delivery_completion_log (
      id TEXT PRIMARY KEY,
      wine_id TEXT NOT NULL,
      delivery_window_id TEXT NOT NULL,
      quantity_delivered INTEGER NOT NULL CHECK(quantity_delivered > 0),
      delivered_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'delivered' CHECK(status IN ('pending', 'delivered', 'failed')),
      created_at TEXT NOT NULL,
      FOREIGN KEY (wine_id) REFERENCES wines(id),
      FOREIGN KEY (delivery_window_id) REFERENCES delivery_window(id)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      wine_id TEXT,
      delivery_window_id TEXT,
      details TEXT NOT NULL,
      user_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (wine_id) REFERENCES wines(id),
      FOREIGN KEY (delivery_window_id) REFERENCES delivery_window(id)
    );

    CREATE INDEX IF NOT EXISTS idx_wines_tier ON wines(tier);
    CREATE INDEX IF NOT EXISTS idx_wines_region ON wines(region);
    CREATE INDEX IF NOT EXISTS idx_wines_vintage ON wines(vintage);
    CREATE INDEX IF NOT EXISTS idx_consumption_wine_id ON consumption_log(wine_id);
    CREATE INDEX IF NOT EXISTS idx_consumption_date ON consumption_log(consumed_date);
    CREATE INDEX IF NOT EXISTS idx_delivery_window_date ON delivery_window(scheduled_date);
    CREATE INDEX IF NOT EXISTS idx_delivery_window_wines_window ON delivery_window_wines(delivery_window_id);
    CREATE INDEX IF NOT EXISTS idx_delivery_completion_wine ON delivery_completion_log(wine_id);
    CREATE INDEX IF NOT EXISTS idx_delivery_completion_window ON delivery_completion_log(delivery_window_id);
  `

  const statements = schema.split(';').filter((s) => s.trim())

  for (const statement of statements) {
    if (statement.trim()) {
      await executeQuery(statement)
    }
  }

  // Migration: add min_delivery_bottles column to pre-existing databases.
  // SQLite doesn't support IF NOT EXISTS on ADD COLUMN, so try/catch the
  // "duplicate column" error and ignore it.
  try {
    await executeQuery(
      `ALTER TABLE cellar_config ADD COLUMN min_delivery_bottles INTEGER NOT NULL DEFAULT 24`
    )
  } catch (err) {
    const msg = (err as Error)?.message || ''
    if (!msg.toLowerCase().includes('duplicate column')) {
      // Re-throw unexpected errors; ignore "already exists" errors
      console.debug('[Database] min_delivery_bottles migration skipped:', msg)
    }
  }

  // Initialize default cellar_config if not exists
  const config = await queryOne(
    'SELECT COUNT(*) as count FROM cellar_config WHERE id = 1'
  )
  if (!config || config.count === 0) {
    await executeQuery(
      `INSERT INTO cellar_config (id, max_home_capacity, annual_consumption_target, min_delivery_bottles, created_at, updated_at)
       VALUES (1, 80, 30, 24, ?, ?)`,
      [new Date().toISOString(), new Date().toISOString()]
    )
  }
}

async function executeQuery(sql: string, params: any[] = []): Promise<any> {
  if (dbType === 'memory') {
    const result = handleMemoryQuery(sql, params)
    const upperSql = sql.trim().toUpperCase()
    if (
      upperSql.startsWith('INSERT') ||
      upperSql.startsWith('UPDATE') ||
      upperSql.startsWith('DELETE')
    ) {
      persistMemoryDatabase()
    }
    return result
  } else if (dbType === 'electron') {
    const api = (window as any).electronAPI
    const upperSql = sql.trim().toUpperCase()

    if (upperSql.startsWith('SELECT')) {
      const result = await api.db.query(sql, params)
      return { values: result }
    } else {
      const result = await api.db.run(sql, params)
      return result
    }
  }
}

export async function queryOne(sql: string, params: any[] = []): Promise<any> {
  const result = await executeQuery(sql, params)
  return result?.values?.[0] || null
}

export async function queryAll(sql: string, params: any[] = []): Promise<any[]> {
  const result = await executeQuery(sql, params)
  return result?.values || []
}

function handleMemoryQuery(sql: string, params: any[] = []): any {
  const upperSql = sql.toUpperCase().trim()

  if (upperSql.startsWith('SELECT')) {
    const table = extractTableName(sql)
    let rows = [...(memoryStorage.get(table) || [])]

    // Apply WHERE clause if present
    if (sql.includes('WHERE')) {
      rows = rows.filter((r) => evaluateWhere(r, sql, params))
    }

    // Apply ORDER BY
    if (sql.includes('ORDER BY')) {
      rows = applyOrderBy(rows, sql)
    }

    // Apply LIMIT
    if (sql.includes('LIMIT')) {
      const match = sql.match(/LIMIT\s+(\d+)/i)
      if (match) {
        const limit = parseInt(match[1])
        rows = rows.slice(0, limit)
      }
    }

    return { values: rows }
  } else if (upperSql.startsWith('INSERT')) {
    const table = extractTableName(sql)
    const data = parseInsertValues(sql, params)
    let rows = memoryStorage.get(table) || []

    console.log(`[DB] INSERT into ${table}: data =`, Object.keys(data).slice(0, 5))

    rows.push(data)
    memoryStorage.set(table, rows)

    console.log(`[DB] ${table} now has ${rows.length} rows`)

    return { changes: 1 }
  } else if (upperSql.startsWith('UPDATE')) {
    const table = extractTableName(sql)
    console.log(`[DB] UPDATE: memoryStorage keys =`, Array.from(memoryStorage.keys()))
    console.log(`[DB] UPDATE: memoryStorage.get('${table}') =`, memoryStorage.get(table))
    const rows = memoryStorage.get(table) || []
    let updated = 0

    // Count SET fields to split params correctly
    const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/i)
    const setClause = setMatch ? setMatch[1] : ''
    const numSetFields = setClause.split('=').length - 1

    const setParams = params.slice(0, numSetFields)
    const whereParams = params.slice(numSetFields)
    const updates = parseUpdateValues(sql, setParams)

    const whereIndex = findWhereIndex(sql)
    const whereClause = sql.substring(whereIndex)

    console.log(`[DB] UPDATE ${table}: numSetFields=${numSetFields}, setParams=${JSON.stringify(setParams)}, whereParams=${JSON.stringify(whereParams)}`)
    console.log(`[DB] Updates to apply:`, updates)
    console.log(`[DB] Looking for rows where:`, whereClause)
    console.log(`[DB] Total rows in table: ${rows.length}`)

    for (let i = 0; i < rows.length; i++) {
      const matches = evaluateWhere(rows[i], whereClause, whereParams)
      console.log(`[DB] Row ${i}: matches=${matches}, row.id=${rows[i].id}`)
      if (matches) {
        console.log(`[DB] Updating row ${i} from:`, rows[i])
        rows[i] = { ...rows[i], ...updates }
        console.log(`[DB] Updated row ${i} to:`, rows[i])
        updated++
      }
    }

    if (updated > 0) {
      memoryStorage.set(table, rows)
    }
    console.log(`[DB] Total updated: ${updated}`)
    return { changes: updated }
  } else if (upperSql.startsWith('DELETE')) {
    const table = extractTableName(sql)
    const rows = memoryStorage.get(table) || []
    const initialLength = rows.length

    const whereIndex = findWhereIndex(sql)
    const whereClause = sql.substring(whereIndex)
    const filtered = rows.filter((r) => !evaluateWhere(r, whereClause, params))

    memoryStorage.set(table, filtered)
    return { changes: initialLength - filtered.length }
  }

  return { values: [] }
}

function extractTableName(sql: string): string {
  // Handle UPDATE table_name SET ...
  let match = sql.match(/UPDATE\s+(\w+)/i)
  if (match) return match[1]

  // Handle DELETE FROM table_name
  match = sql.match(/DELETE\s+FROM\s+(\w+)/i)
  if (match) return match[1]

  // Handle INSERT INTO table_name
  match = sql.match(/INSERT\s+INTO\s+(\w+)/i)
  if (match) return match[1]

  // Handle SELECT FROM table_name
  match = sql.match(/FROM\s+(\w+)/i)
  if (match) return match[1]

  return ''
}

function evaluateWhere(row: any, sql: string, params: any[]): boolean {
  // Simple WHERE clause evaluation
  const whereMatch = sql.match(/WHERE\s+(.+?)(?:ORDER|LIMIT|$)/i)
  if (!whereMatch) return true

  const whereClause = whereMatch[1].trim()

  // Handle multiple conditions with AND
  const conditions = whereClause.split(/\s+AND\s+/i)
  let paramIndex = 0

  for (const condition of conditions) {
    // Handle simple equality: "id = ?" or "id = 1"
    if (condition.includes('=') && !condition.includes('<>') && !condition.includes('!=')) {
      const parts = condition.split('=')
      const field = parts[0].trim().split(' ').pop()
      if (!field) continue

      // Check if the right side is a placeholder (?)
      if (parts[1].trim() === '?') {
        const value = params[paramIndex++]
        if (row[field] !== value) return false
      } else {
        // Handle literal values like "id = 1"
        const literalValue = parts[1].trim()
        // Try to parse as number
        const numValue = parseInt(literalValue)
        if (!isNaN(numValue)) {
          if (row[field] !== numValue) return false
        } else {
          if (row[field] !== literalValue) return false
        }
      }
    } else if (condition.includes('IN')) {
      const match = condition.match(/(\w+)\s+IN\s+\(([^)]+)\)/i)
      if (match) {
        const field = match[1].trim()
        const values = match[2].split(',').map((v) => v.trim().replace(/'/g, ''))
        if (!values.includes(String(row[field]))) return false
      }
    } else if (condition.includes('<>') || condition.includes('!=')) {
      const match = condition.match(/(\w+)\s*(<>|!=)\s*(.+)/i)
      if (match) {
        const field = match[1].trim()
        const rightSide = match[3].trim()

        // Check if it's a placeholder or literal value
        let value
        if (rightSide === '?') {
          value = params[paramIndex++]
        } else {
          // Remove quotes from string literals
          value = rightSide.replace(/^['"]|['"]$/g, '')
        }

        if (row[field] === value) return false
      }
    }
  }

  return true
}

function findWhereIndex(sql: string): number {
  return sql.toUpperCase().indexOf('WHERE')
}

function applyOrderBy(rows: any[], sql: string): any[] {
  const match = sql.match(/ORDER BY\s+(\w+)(?:\s+(ASC|DESC))?/i)
  if (!match) return rows

  const field = match[1]
  const direction = match[2]?.toUpperCase() === 'DESC' ? -1 : 1

  return rows.sort((a, b) => {
    const aVal = a[field]
    const bVal = b[field]
    if (aVal < bVal) return -direction
    if (aVal > bVal) return direction
    return 0
  })
}

function parseInsertValues(sql: string, params: any[]): Record<string, any> {
  const match = sql.match(/\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i)
  if (!match) return {}

  const fields = match[1].split(',').map((f) => f.trim())
  const data: Record<string, any> = {}

  fields.forEach((field, i) => {
    data[field] = params[i]
  })

  return data
}

function parseUpdateValues(sql: string, params: any[]): Record<string, any> {
  const match = sql.match(/SET\s+(.+?)\s+WHERE/i)
  if (!match) return {}

  const setParts = match[1].split(',').map((p) => p.trim())
  const data: Record<string, any> = {}
  let paramIndex = 0

  setParts.forEach((part) => {
    const [field] = part.split('=').map((p) => p.trim())
    data[field] = params[paramIndex++]
  })

  return data
}

// ============================================================================
// PUBLIC SERVICE METHODS (Aligned with Workflows)
// ============================================================================

// WINES TABLE OPERATIONS
export async function createWine(wine: Omit<Wine, 'id' | 'created_at' | 'updated_at'>): Promise<Wine> {
  const now = new Date().toISOString()
  const id = uuidv4()

  const wineData: Wine = {
    ...wine,
    id,
    created_at: now,
    updated_at: now,
  }

  await executeQuery(
    `INSERT INTO wines (
      id, name, vintage, tier, region, producer, classification, wine_type, varietal,
      country, alcohol_percent, serving_temp_min, serving_temp_max, flavor_profile,
      critic_ratings, drinking_window_start, drinking_window_end, image_url, format,
      quantity_in_storage, quantity_at_home, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      wine.name,
      wine.vintage,
      wine.tier,
      wine.region,
      wine.producer || null,
      wine.classification || null,
      wine.wine_type || null,
      wine.varietal || null,
      wine.country || null,
      wine.alcohol_percent || null,
      wine.serving_temp_min || null,
      wine.serving_temp_max || null,
      wine.flavor_profile || null,
      wine.critic_ratings || null,
      wine.drinking_window_start,
      wine.drinking_window_end,
      wine.image_url || null,
      wine.format || null,
      wine.quantity_in_storage,
      wine.quantity_at_home,
      wine.notes || null,
      now,
      now,
    ]
  )

  return wineData
}

export async function getWineById(id: string): Promise<Wine | null> {
  return queryOne('SELECT * FROM wines WHERE id = ?', [id])
}

export async function getAllWines(): Promise<Wine[]> {
  return queryAll('SELECT * FROM wines ORDER BY name ASC')
}

export async function updateWine(id: string, updates: Partial<Wine>): Promise<void> {
  const now = new Date().toISOString()
  const wine = await getWineById(id)

  if (!wine) {
    throw new Error(`Wine not found: ${id}`)
  }

  const fields: string[] = []
  const values: any[] = []

  Object.entries(updates).forEach(([key, value]) => {
    if (key !== 'id' && key !== 'created_at') {
      fields.push(`${key} = ?`)
      values.push(value)
    }
  })

  fields.push('updated_at = ?')
  values.push(now)
  values.push(id)

  await executeQuery(`UPDATE wines SET ${fields.join(', ')} WHERE id = ?`, values)

  // Log audit
  await createAuditLog({
    action: 'edit_wine_details',
    wine_id: id,
    details: {
      fields_changed: Object.keys(updates),
      old_values: wine,
      new_values: updates,
    },
  })
}

export async function deleteWine(id: string): Promise<void> {
  await executeQuery('DELETE FROM wines WHERE id = ?', [id])
  await createAuditLog({
    action: 'delete_wine',
    wine_id: id,
    details: { wine_id: id },
  })
}

// CELLAR CONFIG OPERATIONS
export async function getCellarConfig(): Promise<CellarConfig> {
  const config = await queryOne('SELECT * FROM cellar_config WHERE id = 1')
  if (!config) {
    throw new Error('Cellar config not found')
  }
  // Default min_delivery_bottles to 24 for any legacy record missing the field
  if (config.min_delivery_bottles == null) {
    config.min_delivery_bottles = 24
  }
  return config as CellarConfig
}

export async function updateCellarConfig(updates: Partial<CellarConfig>): Promise<void> {
  const now = new Date().toISOString()
  const config = await getCellarConfig()

  const fields: string[] = []
  const values: any[] = []

  Object.entries(updates).forEach(([key, value]) => {
    if (key !== 'id' && key !== 'created_at') {
      fields.push(`${key} = ?`)
      values.push(value)
    }
  })

  fields.push('updated_at = ?')
  values.push(now)
  values.push(1) // id = 1

  await executeQuery(`UPDATE cellar_config SET ${fields.join(', ')} WHERE id = ?`, values)

  await createAuditLog({
    action: 'update_cellar_config',
    details: {
      old_values: config,
      new_values: updates,
    },
  })
}

// CONSUMPTION LOG OPERATIONS
export async function createConsumptionEntry(entry: Omit<ConsumptionLogEntry, 'id' | 'created_at'>): Promise<ConsumptionLogEntry> {
  const now = new Date().toISOString()
  const id = uuidv4()

  const logEntry: ConsumptionLogEntry = {
    ...entry,
    id,
    created_at: now,
  }

  await executeQuery(
    'INSERT INTO consumption_log (id, wine_id, consumed_date, notes, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, entry.wine_id, entry.consumed_date, entry.notes || null, now]
  )

  return logEntry
}

export async function getConsumptionLogByWineId(wineId: string): Promise<ConsumptionLogEntry[]> {
  return queryAll('SELECT * FROM consumption_log WHERE wine_id = ? ORDER BY consumed_date DESC', [wineId])
}

export async function getConsumptionLogByYear(year: number): Promise<ConsumptionLogEntry[]> {
  // Get all consumption logs and filter by year in memory
  const allLogs = await queryAll('SELECT * FROM consumption_log ORDER BY consumed_date DESC')
  return allLogs.filter(log => {
    const logYear = new Date(log.consumed_date).getFullYear()
    return logYear === year
  })
}

// DELIVERY WINDOW OPERATIONS
export async function createDeliveryWindow(data: Omit<DeliveryWindow, 'id' | 'created_at' | 'updated_at'>): Promise<DeliveryWindow> {
  const now = new Date().toISOString()
  const id = uuidv4()

  const window: DeliveryWindow = {
    ...data,
    id,
    created_at: now,
    updated_at: now,
  }

  await executeQuery(
    `INSERT INTO delivery_window (id, scheduled_date, locked, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, data.scheduled_date, data.locked ? 1 : 0, data.status, now, now]
  )

  return window
}

export async function getDeliveryWindowById(id: string): Promise<DeliveryWindow | null> {
  const result = await queryOne('SELECT * FROM delivery_window WHERE id = ?', [id])
  if (result) {
    result.locked = Boolean(result.locked)
  }
  return result
}

export async function getCurrentDeliveryWindow(): Promise<DeliveryWindow | null> {
  const result = await queryOne(
    `SELECT * FROM delivery_window WHERE status != 'completed' ORDER BY scheduled_date ASC LIMIT 1`
  )
  if (result) {
    result.locked = Boolean(result.locked)
  }
  return result
}

export async function getAllDeliveryWindows(): Promise<DeliveryWindow[]> {
  const results = await queryAll('SELECT * FROM delivery_window ORDER BY scheduled_date ASC')
  return results.map(r => ({ ...r, locked: Boolean(r.locked) }))
}

export async function updateDeliveryWindow(id: string, updates: Partial<DeliveryWindow>): Promise<void> {
  const now = new Date().toISOString()

  const fields: string[] = []
  const values: any[] = []

  Object.entries(updates).forEach(([key, value]) => {
    if (key !== 'id' && key !== 'created_at') {
      if (key === 'locked') {
        fields.push('locked = ?')
        values.push(value ? 1 : 0)
      } else {
        fields.push(`${key} = ?`)
        values.push(value)
      }
    }
  })

  fields.push('updated_at = ?')
  values.push(now)
  values.push(id)

  await executeQuery(`UPDATE delivery_window SET ${fields.join(', ')} WHERE id = ?`, values)
}

// DELIVERY WINDOW WINES OPERATIONS
export async function addWineToDeliveryWindow(
  windowId: string,
  wineId: string,
  quantity: number
): Promise<DeliveryWindowWine> {
  const now = new Date().toISOString()
  const id = uuidv4()

  const windowWine: DeliveryWindowWine = {
    id,
    delivery_window_id: windowId,
    wine_id: wineId,
    quantity,
    status: 'pending',
    created_at: now,
    updated_at: now,
  }

  await executeQuery(
    `INSERT INTO delivery_window_wines (id, delivery_window_id, wine_id, quantity, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, windowId, wineId, quantity, 'pending', now, now]
  )

  return windowWine
}

export async function getDeliveryWindowWines(windowId: string): Promise<DeliveryWindowWine[]> {
  return queryAll('SELECT * FROM delivery_window_wines WHERE delivery_window_id = ?', [windowId])
}

export async function updateDeliveryWindowWine(
  windowId: string,
  wineId: string,
  quantity: number
): Promise<void> {
  const now = new Date().toISOString()

  await executeQuery(
    `UPDATE delivery_window_wines SET quantity = ?, updated_at = ? WHERE delivery_window_id = ? AND wine_id = ?`,
    [quantity, now, windowId, wineId]
  )
}

export async function removeWineFromDeliveryWindow(windowId: string, wineId: string): Promise<void> {
  await executeQuery(
    'DELETE FROM delivery_window_wines WHERE delivery_window_id = ? AND wine_id = ?',
    [windowId, wineId]
  )
}

export async function deleteDeliveryWindowWinesByWindow(windowId: string): Promise<void> {
  await executeQuery('DELETE FROM delivery_window_wines WHERE delivery_window_id = ?', [windowId])
}

// DELIVERY COMPLETION LOG OPERATIONS
export async function createDeliveryCompletion(
  data: Omit<DeliveryCompletionLog, 'id' | 'created_at'>
): Promise<DeliveryCompletionLog> {
  const now = new Date().toISOString()
  const id = uuidv4()

  const completion: DeliveryCompletionLog = {
    ...data,
    id,
    created_at: now,
  }

  await executeQuery(
    `INSERT INTO delivery_completion_log (id, wine_id, delivery_window_id, quantity_delivered, delivered_date, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.wine_id,
      data.delivery_window_id,
      data.quantity_delivered,
      data.delivered_date,
      data.status,
      now,
    ]
  )

  return completion
}

export async function getDeliveryCompletionByWineId(wineId: string): Promise<DeliveryCompletionLog[]> {
  return queryAll('SELECT * FROM delivery_completion_log WHERE wine_id = ? ORDER BY delivered_date DESC', [
    wineId,
  ])
}

export async function getFirstDeliveryDateForWine(wineId: string): Promise<string | null> {
  // Get all deliveries for the wine and find the earliest
  const deliveries = await queryAll(
    'SELECT delivered_date FROM delivery_completion_log WHERE wine_id = ? ORDER BY delivered_date ASC',
    [wineId]
  )
  return deliveries.length > 0 ? deliveries[0].delivered_date : null
}

// AUDIT LOG OPERATIONS
export async function createAuditLog(
  data: Omit<AuditLogEntry, 'id' | 'created_at'>
): Promise<AuditLogEntry> {
  const now = new Date().toISOString()
  const id = uuidv4()

  const entry: AuditLogEntry = {
    ...data,
    id,
    created_at: now,
  }

  await executeQuery(
    `INSERT INTO audit_log (id, action, wine_id, delivery_window_id, details, user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.action,
      data.wine_id || null,
      data.delivery_window_id || null,
      JSON.stringify(data.details),
      data.user_id || null,
      now,
    ]
  )

  return entry
}

export async function getAuditLog(limit: number = 100): Promise<AuditLogEntry[]> {
  const logs = await queryAll('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?', [limit])
  return logs.map((log) => ({
    ...log,
    details: typeof log.details === 'string' ? JSON.parse(log.details) : log.details,
  }))
}
