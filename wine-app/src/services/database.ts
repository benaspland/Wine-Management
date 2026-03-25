import type { Wine, CellarConfig, ConsumptionLogEntry, DeliveryScheduleEntry } from '../types/index'

// Database abstraction layer - supports Electron, Capacitor, and in-memory (dev) modes
let db: any = null
let dbType: 'electron' | 'capacitor' | 'memory' = 'memory'
let memoryStorage: Map<string, any[]> = new Map()

export async function initializeDatabase() {
  // Detect environment
  const isElectron = (window as any).electronAPI !== undefined

  if (isElectron) {
    dbType = 'electron'
    // Electron will handle initialization via preload
    db = (window as any).electronAPI
    if (!db) {
      console.warn('Electron API not found, falling back to memory storage')
      dbType = 'memory'
      await initMemoryDatabase()
    }
  } else {
    try {
      dbType = 'capacitor'
      // Try to initialize Capacitor SQLite
      await initCapacitorDatabase()
    } catch (error) {
      console.warn('Capacitor not available, falling back to memory storage:', error)
      dbType = 'memory'
      await initMemoryDatabase()
    }
  }

  await createSchema()
}

async function initMemoryDatabase() {
  // Initialize in-memory storage for development/testing
  memoryStorage = new Map()
  memoryStorage.set('wines', [])
  memoryStorage.set('cellar_config', [])
  memoryStorage.set('consumption_log', [])
  memoryStorage.set('delivery_schedule', [])
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
      consumed_at TEXT NOT NULL,
      notes TEXT,
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
    return handleMemoryQuery(sql, params)
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
      if (evaluateWhere(row, sql)) {
        // Extract SET values - simplified
        const setMatch = sql.match(/SET\s+(.*?)\s+WHERE/i)
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

    rows = rows.filter(r => !evaluateWhere(r, sql))

    memoryStorage.set(table, rows)
    return { changes: originalLength - rows.length }
  }

  return { values: [] }
}

function extractTableName(sql: string): string {
  const match = sql.match(/(?:FROM|INTO)\s+(\w+)/i)
  return (match?.[1] || 'wines').toLowerCase()
}

function evaluateWhere(_row: any, sql: string): boolean {
  const whereMatch = sql.match(/WHERE\s+(.*?)(?:ORDER BY|LIMIT|$)/i)
  if (!whereMatch) return true

  const whereClause = whereMatch[1].trim()
  // Very simple WHERE handling - just check for equality
  const conditionMatch = whereClause.match(/(\w+)\s*=\s*\?/)
  if (conditionMatch) {
    // This would need proper parameter binding
    return true
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

  const sql = `
    UPDATE wines SET
      producer = ?, name = ?, vintage = ?, country = ?, region = ?,
      classification = ?, wine_type = ?, varietal = ?, tier = ?, location = ?,
      quantity = ?, format = ?, drinking_window_start = ?, drinking_window_end = ?,
      alcohol_percent = ?, serving_temp_min = ?, serving_temp_max = ?, notes = ?,
      critic_ratings = ?, flavor_profile = ?, image_url = ?, updated_at = ?
    WHERE id = ?
  `

  const params = [
    updated.producer,
    updated.name,
    updated.vintage,
    updated.country,
    updated.region,
    updated.classification,
    updated.wine_type,
    updated.varietal,
    updated.tier,
    updated.location,
    updated.quantity,
    updated.format,
    updated.drinking_window_start,
    updated.drinking_window_end,
    updated.alcohol_percent,
    updated.serving_temp_min,
    updated.serving_temp_max,
    updated.notes,
    JSON.stringify(updated.critic_ratings),
    updated.flavor_profile,
    updated.image_url || null,
    updated.updated_at,
    id,
  ]

  await executeQuery(sql, params)
  return updated
}

export async function deleteWine(id: string): Promise<void> {
  await executeQuery('DELETE FROM wines WHERE id = ?', [id])
}

export async function consumeWine(wineId: string, quantity: number = 1, notes?: string): Promise<void> {
  const wine = await getWine(wineId)
  if (!wine) throw new Error(`Wine ${wineId} not found`)
  if (wine.quantity < quantity) throw new Error('Not enough bottles to consume')

  // Update wine quantity
  await updateWine(wineId, { quantity: wine.quantity - quantity })

  // Log consumption
  const logId = generateId()
  const sql = `
    INSERT INTO consumption_log (id, wine_id, quantity, consumed_at, notes)
    VALUES (?, ?, ?, ?, ?)
  `
  await executeQuery(sql, [logId, wineId, quantity, new Date().toISOString(), notes || null])
}

export async function moveWineLocation(wineId: string, toLocation: 'home' | 'storage', _quantity?: number): Promise<void> {
  const wine = await getWine(wineId)
  if (!wine) throw new Error(`Wine ${wineId} not found`)

  // For now, move entire wine entry. Future: support partial moves via delivery schedule
  await updateWine(wineId, { location: toLocation })
}

// Cellar config
export async function getCellarConfig(): Promise<CellarConfig> {
  const result = await executeQuery('SELECT * FROM cellar_config WHERE id = 1')
  const row = result.values?.[0]
  return row || { max_slots: 80, current_slots: 0 }
}

export async function updateCellarCapacity(maxSlots: number): Promise<void> {
  await executeQuery('UPDATE cellar_config SET max_slots = ? WHERE id = 1', [maxSlots])
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
    'SELECT * FROM delivery_schedule WHERE status = "pending" ORDER BY scheduled_date ASC'
  )
  return result.values || []
}

export async function createDelivery(delivery: Omit<DeliveryScheduleEntry, 'id' | 'created_at'>): Promise<DeliveryScheduleEntry> {
  const id = generateId()
  const now = new Date().toISOString()

  const sql = `
    INSERT INTO delivery_schedule (id, wine_id, quantity, scheduled_date, from_location, to_location, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `

  await executeQuery(sql, [
    id,
    delivery.wine_id,
    delivery.quantity,
    delivery.scheduled_date,
    delivery.from_location,
    delivery.to_location,
    delivery.status || 'pending',
    now,
  ])

  return { ...delivery, id, created_at: now }
}

export async function completeDelivery(deliveryId: string): Promise<void> {
  const delivery = (await executeQuery('SELECT * FROM delivery_schedule WHERE id = ?', [deliveryId])).values?.[0]
  if (!delivery) throw new Error(`Delivery ${deliveryId} not found`)

  // Move wine location
  await moveWineLocation(delivery.wine_id, delivery.to_location, delivery.quantity)

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

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}
