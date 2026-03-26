import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import isDev from 'electron-is-dev'
import initSqlJs from 'sql.js'
import * as fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null
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
    `CREATE TABLE IF NOT EXISTS wines (
      id TEXT PRIMARY KEY,
      producer TEXT NOT NULL,
      name TEXT NOT NULL,
      vintage INTEGER NOT NULL,
      country TEXT NOT NULL,
      region TEXT NOT NULL,
      classification TEXT,
      wine_type TEXT,
      varietal TEXT,
      tier INTEGER NOT NULL,
      location TEXT NOT NULL,
      quantity INTEGER NOT NULL,
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
    )`,
    `CREATE TABLE IF NOT EXISTS cellar_config (
      id TEXT PRIMARY KEY DEFAULT 'default',
      max_slots INTEGER DEFAULT 80,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS consumption_log (
      id TEXT PRIMARY KEY,
      wine_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      consumed_date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (wine_id) REFERENCES wines(id)
    )`,
    `CREATE TABLE IF NOT EXISTS delivery_schedule (
      id TEXT PRIMARY KEY,
      wine_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      scheduled_date TEXT NOT NULL,
      from_location TEXT NOT NULL,
      to_location TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (wine_id) REFERENCES wines(id)
    )`,
  ]

  for (const stmt of statements) {
    try {
      db.run(stmt)
    } catch (error) {
      // Table might already exist, ignore
    }
  }

  // Ensure default config exists
  try {
    db.run(
      `INSERT OR IGNORE INTO cellar_config (id, max_slots, created_at, updated_at)
       VALUES (?, ?, datetime('now'), datetime('now'))`,
      ['default', 80]
    )
  } catch (error) {
    // Might already exist
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

    const stmt = db.prepare(sql)
    stmt.bind(params || [])
    stmt.step()
    stmt.free()

    saveDatabase()

    return {
      changes: db.getRowsModified(),
      lastInsertRowid: 0, // sql.js doesn't provide this, approximation
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
