import type { Wine, CellarConfig, ConsumptionLogEntry, DeliveryScheduleEntry } from '../types/index'

// Database abstraction layer - supports Electron, Capacitor, and in-memory (dev) modes
let db: any = null
let dbType: 'electron' | 'capacitor' | 'memory' = 'memory'
let memoryStorage: Map<string, any[]> = new Map()

// Export dbType for other modules
export function getDbType() {
  return dbType
}

export async function initializeDatabase() {
  // Detect environment
  const isElectron = (window as any).electronAPI !== undefined

  console.log('[Database] Initializing database...')
  console.log('[Database] window.electronAPI exists:', isElectron)
  console.log('[Database] window.electronAPI:', (window as any).electronAPI)

  if (isElectron) {
    dbType = 'electron'
    // Electron will handle initialization via preload
    db = (window as any).electronAPI
    console.log('[Database] Using Electron SQLite database')
    if (!db) {
      console.warn('[Database] Electron API not found, falling back to memory storage')
      dbType = 'memory'
      await initMemoryDatabase()
    }
  } else {
    try {
      dbType = 'capacitor'
      // Try to initialize Capacitor SQLite
      await initCapacitorDatabase()
    } catch (error) {
      console.warn('[Database] Capacitor not available, falling back to memory storage:', error)
      dbType = 'memory'
      await initMemoryDatabase()
    }
  }

  console.log('[Database] Database type:', dbType)
  await createSchema()
}

async function initMemoryDatabase() {
  // Initialize in-memory storage for development/testing
  // Try to load from localStorage first
  const stored = localStorage.getItem('wine-app-db')
  if (stored) {
    try {
      const data = JSON.parse(stored)
      memoryStorage = new Map(Object.entries(data))
      console.log('Loaded database from localStorage')
      return
    } catch (error) {
      console.warn('Failed to load from localStorage, starting fresh:', error)
    }
  }

  // Initialize with empty tables
  memoryStorage = new Map()
  memoryStorage.set('wines', [])
  memoryStorage.set('cellar_config', [])
  memoryStorage.set('consumption_log', [])
  memoryStorage.set('delivery_schedule', [])
}

// Persist memory database to localStorage
function persistMemoryDatabase() {
  try {
    const data = Object.fromEntries(memoryStorage)
    localStorage.setItem('wine-app-db', JSON.stringify(data))
  } catch (error) {
    console.warn('Failed to persist to localStorage:', error)
  }
}

async function initCapacitorDatabase() {
  // Capacitor SQLite will be implemented in Phase 8 when building for mobile
  // For now, use in-memory storage
  dbType = 'memory'
  await initMemoryDatabase()
}

async function createSchema() {
  if (dbType === 'memory') {
    // Initialize in-memory tables
    return
  }

  const schema = `
    CREATE TABLE IF NOT EXISTS wines (
      id TEXT PRIMARY KEY,
      producer TEXT NOT NULL,
      name TEXT NOT NULL,
      vintage INTEGER NOT NULL,
      country TEXT NOT NULL,
      region TEXT NOT NULL,
      classification TEXT,
      wine_type TEXT NOT NULL,
      varietal TEXT,
      tier INTEGER NOT NULL,
      location TEXT NOT NULL CHECK(location IN ('home', 'storage')),
      quantity INTEGER NOT NULL DEFAULT 0,
      format TEXT NOT NULL,
      drinking_window_start INTEGER NOT NULL,
      drinking_window_end INTEGER NOT NULL,
      alcohol_percent REAL,
      serving_temp_min INTEGER,
      serving_temp_max INTEGER,
      notes TEXT,
      critic_ratings TEXT,
      flavor_profile TEXT,
      image_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cellar_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      max_slots INTEGER NOT NULL DEFAULT 80,
      current_slots INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS consumption_log (
      id TEXT PRIMARY KEY,
      wine_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      consumed_date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (wine_id) REFERENCES wines(id)
    );

    CREATE TABLE IF NOT EXISTS delivery_schedule (
      id TEXT PRIMARY KEY,
      wine_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      scheduled_date TEXT NOT NULL,
      from_location TEXT NOT NULL,
      to_location TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      FOREIGN KEY (wine_id) REFERENCES wines(id)
    );

    CREATE INDEX IF NOT EXISTS idx_wines_location ON wines(location);
    CREATE INDEX IF NOT EXISTS idx_wines_tier ON wines(tier);
    CREATE INDEX IF NOT EXISTS idx_wines_vintage ON wines(vintage);
    CREATE INDEX IF NOT EXISTS idx_consumption_wine_id ON consumption_log(wine_id);
    CREATE INDEX IF NOT EXISTS idx_delivery_wine_id ON delivery_schedule(wine_id);
  `

  const statements = schema.split(';').filter(s => s.trim())

  for (const statement of statements) {
    if (statement.trim()) {
      await executeQuery(statement)
    }
  }

  // Initialize cellar_config if empty
  const config = await executeQuery('SELECT COUNT(*) as count FROM cellar_config')
  if (config.values?.length === 0 || config.values?.[0]?.count === 0) {
    await executeQuery(
      'INSERT INTO cellar_config (id, max_slots, current_slots) VALUES (1, 80, 0)'
    )
  }
}

async function executeQuery(sql: string, params: any[] = []): Promise<any> {
  if (dbType === 'memory') {
    const result = handleMemoryQuery(sql, params)
    // Persist to localStorage after write operations
    const upperSql = sql.trim().toUpperCase()
    if (upperSql.startsWith('INSERT') || upperSql.startsWith('UPDATE') || upperSql.startsWith('DELETE')) {
      persistMemoryDatabase()
    }
    return result
  } else if (dbType === 'electron') {
    const api = (window as any).electronAPI
    const upperSql = sql.trim().toUpperCase()

    if (upperSql.startsWith('SELECT')) {
      const result = await api.db.query(sql, params)
      // Wrap array result in values property for consistency
      return { values: result }
    } else {
      // For INSERT/UPDATE/DELETE, use run() method
      const result = await api.db.run(sql, params)
      return result
    }
  } else {
    return db.query(sql, params)
  }
}

function handleMemoryQuery(sql: string, params: any[] = []): any {
  // Simple in-memory query handler for development
  // This is a basic implementation - doesn't handle complex SQL
  const upperSql = sql.toUpperCase().trim()

  if (upperSql.startsWith('SELECT')) {
    // Handle SELECT
    if (upperSql.includes('COUNT(*)')) {
      const table = extractTableName(sql)
      const count = memoryStorage.get(table)?.length || 0
      return { values: [{ count }] }
    } else {
      const table = extractTableName(sql)
      let rows = memoryStorage.get(table) || []

      // Simple WHERE clause handling
      if (sql.includes('WHERE')) {
        rows = rows.filter(r => evaluateWhere(r, sql))
      }

      // Handle ORDER BY
      if (sql.includes('ORDER BY')) {
        const match = sql.match(/ORDER BY\s+(\w+)\s+(ASC|DESC)?/i)
        if (match) {
          const field = match[1]
          const direction = match[2]?.toUpperCase() === 'DESC' ? -1 : 1
          rows = rows.sort((a, b) => {
            if (a[field] < b[field]) return -direction
            if (a[field] > b[field]) return direction
            return 0
          })
        }
      }

      return { values: rows }
    }
  } else if (upperSql.startsWith('INSERT')) {
    const table = extractTableName(sql)
    const values = params
    const newRow: any = {}

    const columnMatch = sql.match(/INSERT INTO\s+\w+\s*\((.*?)\)\s*VALUES/is)
    if (columnMatch) {
      const columns = columnMatch[1].split(',').map(c => c.trim())
      columns.forEach((col, idx) => {
        newRow[col] = values[idx]
      })
    }

    const table_data = memoryStorage.get(table) || []
    table_data.push(newRow)
    memoryStorage.set(table, table_data)
    return { changes: 1 }
  } else if (upperSql.startsWith('UPDATE')) {
    const table = extractTableName(sql)
    let rows = memoryStorage.get(table) || []

    // Very simple update handling
    rows = rows.map(row => {
      if (evaluateWhere(row, sql, params)) {
        // Extract SET values - simplified
        const setMatch = sql.match(/SET\s+(.*?)\s+WHERE/is)
        if (setMatch) {
          const setParts = setMatch[1].split(',')
          setParts.forEach((setPart, idx) => {
            const [field] = setPart.split('=').map(p => p.trim())
            row[field] = params[idx]
          })
        }
      }
      return row
    })

    memoryStorage.set(table, rows)
    return { changes: rows.length }
  } else if (upperSql.startsWith('DELETE')) {
    const table = extractTableName(sql)
    const originalLength = memoryStorage.get(table)?.length || 0
    let rows = memoryStorage.get(table) || []

    rows = rows.filter(r => !evaluateWhere(r, sql, params))

    memoryStorage.set(table, rows)
    return { changes: originalLength - rows.length }
  }

  return { values: [] }
}

function extractTableName(sql: string): string {
  const match = sql.match(/(?:FROM|INTO)\s+(\w+)/i)
  return (match?.[1] || 'wines').toLowerCase()
}

function evaluateWhere(row: any, sql: string, params: any[] = []): boolean {
  const whereMatch = sql.match(/WHERE\s+(.*?)(?:ORDER BY|LIMIT|$)/is)
  if (!whereMatch) return true

  const whereClause = whereMatch[1].trim()
  // Very simple WHERE handling - just check for equality
  const conditionMatch = whereClause.match(/(\w+)\s*=\s*\?/)
  if (conditionMatch) {
    const fieldName = conditionMatch[1]
    const expectedValue = params[0] // WHERE clause typically uses first parameter
    return row[fieldName] === expectedValue
  }

  return true
}

// Wine operations
export async function getWines(location?: 'home' | 'storage'): Promise<Wine[]> {
  let sql = 'SELECT * FROM wines'
  const params = []

  if (location) {
    sql += ' WHERE location = ?'
    params.push(location)
  }

  sql += ' ORDER BY vintage DESC'

  const result = await executeQuery(sql, params)
  return (result.values || []).map(parseWineRow)
}

export async function getWine(id: string): Promise<Wine | null> {
  const result = await executeQuery('SELECT * FROM wines WHERE id = ?', [id])
  const row = result.values?.[0]
  return row ? parseWineRow(row) : null
}

export async function createWine(wine: Omit<Wine, 'id' | 'created_at' | 'updated_at'>): Promise<Wine> {
  const id = generateId()
  const now = new Date().toISOString()

  const sql = `
    INSERT INTO wines (
      id, producer, name, vintage, country, region, classification,
      wine_type, varietal, tier, location, quantity, format,
      drinking_window_start, drinking_window_end, alcohol_percent,
      serving_temp_min, serving_temp_max, notes, critic_ratings,
      flavor_profile, image_url, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `

  const params = [
    id,
    wine.producer,
    wine.name,
    wine.vintage,
    wine.country,
    wine.region,
    wine.classification,
    wine.wine_type,
    wine.varietal,
    wine.tier,
    wine.location,
    wine.quantity,
    wine.format,
    wine.drinking_window_start,
    wine.drinking_window_end,
    wine.alcohol_percent,
    wine.serving_temp_min,
    wine.serving_temp_max,
    wine.notes,
    JSON.stringify(wine.critic_ratings),
    wine.flavor_profile,
    wine.image_url || null,
    now,
    now,
  ]

  await executeQuery(sql, params)
  return { ...wine, id, created_at: now, updated_at: now }
}

export async function updateWine(id: string, updates: Partial<Wine>): Promise<Wine> {
  const wine = await getWine(id)
  if (!wine) throw new Error(`Wine ${id} not found`)

  const updated = { ...wine, ...updates, updated_at: new Date().toISOString() }

  // Build dynamic UPDATE statement with only changed fields
  const fields = Object.keys(updates).filter(key => key !== 'id' && key !== 'created_at')
  if (fields.length === 0) {
    return updated // No changes to make
  }

  const setClauses = fields.map(field => `${field} = ?`)
  const sql = `UPDATE wines SET ${setClauses.join(', ')}, updated_at = ? WHERE id = ?`

  const params = fields.map(field => {
    const value = (updated as any)[field]
    // Special handling for JSON fields
    if (field === 'critic_ratings' && typeof value === 'object') {
      return JSON.stringify(value)
    }
    return value ?? null
  })
  params.push(updated.updated_at)
  params.push(id)

  await executeQuery(sql, params)
  return updated
}

export async function deleteWine(id: string): Promise<void> {
  await executeQuery('DELETE FROM wines WHERE id = ?', [id])
}

export async function isWineConsumedInPeriod(wineId: string, year: number, month: number): Promise<{ consumed: boolean; consumedDate?: string }> {
  const result = await executeQuery(
    'SELECT consumed_date FROM consumption_log WHERE wine_id = ? ORDER BY created_at DESC LIMIT 1',
    [wineId]
  )

  if (!result.values?.length) {
    return { consumed: false }
  }

  const logEntry = result.values[0]
  const notes = logEntry.notes || ''

  // Check if notes contain the schedule period this was consumed from
  const schedulePattern = `Schedule: ${year}-${String(month).padStart(2, '0')}`
  if (notes.includes(schedulePattern)) {
    return { consumed: true, consumedDate: logEntry.consumed_date }
  }

  return { consumed: false }
}

export async function consumeWine(
  wineId: string,
  quantity: number = 1,
  notes?: string,
  scheduleYear?: number,
  scheduleMonth?: number
): Promise<void> {
  const wine = await getWine(wineId)
  if (!wine) throw new Error(`Wine ${wineId} not found`)
  if (wine.quantity < quantity) throw new Error('Not enough bottles to consume')

  // Update wine quantity directly in database (more efficient than fetching full record)
  await executeQuery('UPDATE wines SET quantity = quantity - ? WHERE id = ?', [quantity, wineId])

  // Log consumption with optional schedule pinning info
  const logId = generateId()
  const now = new Date().toISOString()
  const scheduleInfo = scheduleYear && scheduleMonth
    ? `Schedule: ${scheduleYear}-${String(scheduleMonth).padStart(2, '0')}`
    : null
  const fullNotes = [notes, scheduleInfo].filter(Boolean).join(' | ')

  await executeQuery(
    'INSERT INTO consumption_log (id, wine_id, quantity, consumed_date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [logId, wineId, quantity, now, fullNotes || null, now]
  )
}

export async function moveWineLocation(wineId: string, toLocation: 'home' | 'storage', _quantity?: number): Promise<void> {
  // Verify wine exists
  const result = await executeQuery('SELECT id FROM wines WHERE id = ?', [wineId])
  if (!result.values?.length) throw new Error(`Wine ${wineId} not found`)

  // Direct UPDATE is more efficient than fetching and updating full record
  await executeQuery('UPDATE wines SET location = ?, updated_at = ? WHERE id = ?', [
    toLocation,
    new Date().toISOString(),
    wineId,
  ])
}

// Delivery delay management
export async function delayWineFromDelivery(wineId: string, deliveryDate: string): Promise<void> {
  const id = generateId()
  const now = new Date().toISOString()
  await executeQuery(
    'INSERT INTO delivery_delays (id, wine_id, delivery_date, created_at) VALUES (?, ?, ?, ?)',
    [id, wineId, deliveryDate, now]
  )
}

export async function getDelayedWines(deliveryDate: string): Promise<string[]> {
  const result = await executeQuery(
    'SELECT wine_id FROM delivery_delays WHERE delivery_date = ?',
    [deliveryDate]
  )
  return (result.values || []).map((row: any) => row.wine_id)
}

export async function clearDelayMarks(deliveryDate: string): Promise<void> {
  await executeQuery('DELETE FROM delivery_delays WHERE delivery_date = ?', [deliveryDate])
}

export async function isWineDelayed(wineId: string, deliveryDate: string): Promise<boolean> {
  const result = await executeQuery(
    'SELECT id FROM delivery_delays WHERE wine_id = ? AND delivery_date = ?',
    [wineId, deliveryDate]
  )
  return result.values?.length > 0
}

// Cellar config
export async function getCellarConfig(): Promise<CellarConfig> {
  const result = await executeQuery('SELECT * FROM cellar_config WHERE id = ?', ['default'])
  const row = result.values?.[0]
  return (
    row || {
      max_slots: 80,
      current_slots: 0,
      min_delivery_bottles: 24,
      annual_consumption_target: 30,
    }
  )
}

export async function updateCellarCapacity(maxSlots: number): Promise<void> {
  await executeQuery('UPDATE cellar_config SET max_slots = ? WHERE id = ?', [maxSlots, 'default'])
}

export async function updateCellarConfig(config: Partial<CellarConfig>): Promise<void> {
  const updates: string[] = []
  const values: (string | number)[] = []

  if (config.max_slots !== undefined) {
    updates.push('max_slots = ?')
    values.push(config.max_slots)
  }
  if (config.min_delivery_bottles !== undefined) {
    updates.push('min_delivery_bottles = ?')
    values.push(config.min_delivery_bottles)
  }
  if (config.annual_consumption_target !== undefined) {
    updates.push('annual_consumption_target = ?')
    values.push(config.annual_consumption_target)
  }

  if (updates.length === 0) return

  values.push('default')
  const sql = `UPDATE cellar_config SET ${updates.join(', ')} WHERE id = ?`
  await executeQuery(sql, values)
}

// Consumption log
export async function getConsumptionLog(wineId?: string, year?: number): Promise<ConsumptionLogEntry[]> {
  let sql = 'SELECT * FROM consumption_log'
  const params = []

  if (wineId) {
    sql += ' WHERE wine_id = ?'
    params.push(wineId)
  }

  if (year) {
    sql += wineId ? ' AND' : ' WHERE'
    sql += ' strftime("%Y", consumed_at) = ?'
    params.push(year.toString())
  }

  sql += ' ORDER BY consumed_at DESC'

  const result = await executeQuery(sql, params)
  return result.values || []
}

// Delivery schedule
export async function getDeliverySchedule(): Promise<DeliveryScheduleEntry[]> {
  const result = await executeQuery(
    'SELECT * FROM delivery_schedule WHERE status = ? ORDER BY scheduled_date ASC',
    ['pending']
  )
  return result.values || []
}

export async function createDelivery(delivery: Omit<DeliveryScheduleEntry, 'id' | 'created_at'>): Promise<DeliveryScheduleEntry> {
  const id = generateId()
  const now = new Date().toISOString()

  await executeQuery(
    'INSERT INTO delivery_schedule (id, wine_id, quantity, scheduled_date, from_location, to_location, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, delivery.wine_id, delivery.quantity, delivery.scheduled_date, delivery.from_location, delivery.to_location, delivery.status || 'pending', now]
  )

  return { ...delivery, id, created_at: now }
}

export async function completeDelivery(deliveryId: string): Promise<void> {
  // Only fetch what we need (wine_id and to_location)
  const result = await executeQuery('SELECT wine_id, to_location FROM delivery_schedule WHERE id = ?', [deliveryId])
  const delivery = result.values?.[0]
  if (!delivery) throw new Error(`Delivery ${deliveryId} not found`)

  // Move wine location
  await moveWineLocation(delivery.wine_id, delivery.to_location)

  // Mark delivery as complete
  await executeQuery('UPDATE delivery_schedule SET status = ? WHERE id = ?', ['completed', deliveryId])
}

// Utilities
function parseWineRow(row: any): Wine {
  return {
    ...row,
    critic_ratings: typeof row.critic_ratings === 'string' ? JSON.parse(row.critic_ratings) : row.critic_ratings || {},
  }
}

// Admin utilities
export async function deduplicateWines(): Promise<number> {
  // Delete all but the first (oldest) copy of each wine based on producer + name
  const sql = `
    DELETE FROM wines WHERE id IN (
      SELECT id FROM wines w1
      WHERE EXISTS (
        SELECT 1 FROM wines w2
        WHERE w1.producer = w2.producer
        AND w1.name = w2.name
        AND w1.created_at > w2.created_at
      )
    )
  `
  await executeQuery(sql, [])
  return (await getWines()).length
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}
