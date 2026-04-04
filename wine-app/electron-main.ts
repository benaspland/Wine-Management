const { app, BrowserWindow, Menu, ipcMain } = require('electron')
const path = require('path')
const isDev = require('electron-is-dev')
const initSqlJs = require('sql.js')
const fs = require('fs')

let mainWindow: any = null
let db: any = null
let SQL: any = null

// Get the database path
function getDatabasePath(): string {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'wine-collection.db')
}

// Save database to file
function saveDatabase(): void {
  if (!db) return
  try {
    const data = db.export()
    const buffer = Buffer.from(data)
    const dbPath = getDatabasePath()
    fs.writeFileSync(dbPath, buffer)
    console.log('[Database] Saved to', dbPath)
  } catch (error) {
    console.error('[Database] Error saving:', error)
  }
}

// Initialize database
async function initializeDatabase(): Promise<void> {
  if (!SQL) {
    SQL = await initSqlJs()
  }

  const dbPath = getDatabasePath()
  let fileData: Buffer | undefined

  // Load existing database or create new
  try {
    if (fs.existsSync(dbPath)) {
      fileData = fs.readFileSync(dbPath)
      db = new SQL.Database(fileData)
      console.log('[Database] Loaded existing database from', dbPath)
    } else {
      // Ensure directory exists
      const dir = path.dirname(dbPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      db = new SQL.Database()
      console.log('[Database] Created new database')
    }
  } catch (error) {
    console.error('[Database] Error initializing:', error)
    db = new SQL.Database()
  }

  // Initialize schema
  initializeSchema()
}

// Initialize database schema
function initializeSchema(): void {
  const statements = [
    // Master wine inventory table with split quantities
    `CREATE TABLE IF NOT EXISTS wines (
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
    )`,
    // Singleton configuration table
    `CREATE TABLE IF NOT EXISTS cellar_config (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      max_home_capacity INTEGER NOT NULL CHECK(max_home_capacity > 0),
      annual_consumption_target INTEGER NOT NULL CHECK(annual_consumption_target > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    // Historical consumption records
    `CREATE TABLE IF NOT EXISTS consumption_log (
      id TEXT PRIMARY KEY,
      wine_id TEXT NOT NULL,
      consumed_date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (wine_id) REFERENCES wines(id)
    )`,
    // Delivery windows (scheduled occasions)
    `CREATE TABLE IF NOT EXISTS delivery_window (
      id TEXT PRIMARY KEY,
      scheduled_date TEXT NOT NULL,
      locked INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned', 'in_transit', 'completed')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    // Manually-edited wines for locked windows (persisted)
    `CREATE TABLE IF NOT EXISTS delivery_window_wines (
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
    )`,
    // History of completed deliveries
    `CREATE TABLE IF NOT EXISTS delivery_completion_log (
      id TEXT PRIMARY KEY,
      wine_id TEXT NOT NULL,
      delivery_window_id TEXT NOT NULL,
      quantity_delivered INTEGER NOT NULL CHECK(quantity_delivered > 0),
      delivered_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'delivered' CHECK(status IN ('pending', 'delivered', 'failed')),
      created_at TEXT NOT NULL,
      FOREIGN KEY (wine_id) REFERENCES wines(id),
      FOREIGN KEY (delivery_window_id) REFERENCES delivery_window(id)
    )`,
    // Action history for traceability
    `CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      wine_id TEXT,
      delivery_window_id TEXT,
      details TEXT NOT NULL,
      user_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (wine_id) REFERENCES wines(id),
      FOREIGN KEY (delivery_window_id) REFERENCES delivery_window(id)
    )`,
  ]

  for (const stmt of statements) {
    try {
      db.run(stmt)
      console.log(`[Database] Created/verified table`)
    } catch (error) {
      // Table might already exist, ignore
      console.log(`[Database] Table creation note:`, (error as any).message?.substring(0, 50))
    }
  }

  // Create indices for performance
  const indices = [
    'CREATE INDEX IF NOT EXISTS idx_wines_tier ON wines(tier)',
    'CREATE INDEX IF NOT EXISTS idx_wines_region ON wines(region)',
    'CREATE INDEX IF NOT EXISTS idx_wines_vintage ON wines(vintage)',
    'CREATE INDEX IF NOT EXISTS idx_consumption_wine_id ON consumption_log(wine_id)',
    'CREATE INDEX IF NOT EXISTS idx_consumption_date ON consumption_log(consumed_date)',
    'CREATE INDEX IF NOT EXISTS idx_delivery_window_date ON delivery_window(scheduled_date)',
    'CREATE INDEX IF NOT EXISTS idx_delivery_window_wines_window ON delivery_window_wines(delivery_window_id)',
    'CREATE INDEX IF NOT EXISTS idx_delivery_completion_wine ON delivery_completion_log(wine_id)',
    'CREATE INDEX IF NOT EXISTS idx_delivery_completion_window ON delivery_completion_log(delivery_window_id)',
  ]

  for (const indexStmt of indices) {
    try {
      db.run(indexStmt)
    } catch (error) {
      // Index might already exist, ignore
    }
  }

  // Ensure default config exists
  try {
    console.log('[Database] Initializing default cellar_config...')
    db.run(
      `INSERT OR IGNORE INTO cellar_config (id, max_home_capacity, annual_consumption_target, created_at, updated_at)
       VALUES (1, 80, 30, datetime('now'), datetime('now'))`
    )

    // Verify it was created
    const checkStmt = db.prepare('SELECT COUNT(*) as count FROM cellar_config')
    checkStmt.step()
    const result = checkStmt.getAsObject()
    checkStmt.free()
    console.log('[Database] Cellar config rows after insert:', result)
  } catch (error) {
    console.error('[Database] Error initializing cellar_config:', error)
  }

  saveDatabase()
}

// Create app window
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  const startUrl = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '../dist/index.html')}`

  mainWindow.loadURL(startUrl)

  if (isDev) {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// Create application menu
function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit()
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Y', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: 'Full Screen', accelerator: 'F11', role: 'togglefullscreen' },
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

// Handle app events
app.on('ready', async () => {
  await initializeDatabase()
  createWindow()
  createMenu()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

// IPC Handlers for database operations
ipcMain.handle('db:query', async (_event, sql: string, params?: unknown[]) => {
  try {
    if (!db) throw new Error('Database not initialized')

    const stmt = db.prepare(sql)
    stmt.bind(params || [])

    const results: any[] = []
    while (stmt.step()) {
      results.push(stmt.getAsObject())
    }
    stmt.free()

    return results
  } catch (error) {
    console.error('[Database] Query error:', error)
    throw error
  }
})

ipcMain.handle('db:run', async (_event, sql: string, params?: unknown[]) => {
  try {
    if (!db) throw new Error('Database not initialized')

    console.log('[Database] Running:', sql.substring(0, 100) + '...')
    const stmt = db.prepare(sql)
    stmt.bind(params || [])
    stmt.step()
    stmt.free()

    saveDatabase()
    console.log('[Database] Query executed successfully')

    return {
      changes: 1, // sql.js doesn't track this reliably, assume success if no error
      lastInsertRowid: 0,
    }
  } catch (error) {
    console.error('[Database] Run error:', error)
    throw error
  }
})

ipcMain.handle('db:exec', async (_event, sql: string) => {
  try {
    if (!db) throw new Error('Database not initialized')
    db.run(sql)
    saveDatabase()
    return { success: true }
  } catch (error) {
    console.error('[Database] Exec error:', error)
    throw error
  }
})

ipcMain.handle('app:getDataPath', () => {
  return app.getPath('userData')
})

// Graceful shutdown
process.on('SIGTERM', () => {
  if (db) {
    saveDatabase()
  }
  app.quit()
})

app.on('before-quit', () => {
  if (db) {
    saveDatabase()
  }
})
