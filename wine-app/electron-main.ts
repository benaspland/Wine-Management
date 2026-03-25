import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import isDev from 'electron-is-dev'
import Database from 'better-sqlite3'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null
let db: Database.Database | null = null

// Get the database path
function getDatabasePath(): string {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'wine-collection.db')
}

// Initialize database
function initializeDatabase(): Database.Database {
  const dbPath = getDatabasePath()
  const database = new Database(dbPath)

  // Enable foreign keys
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')

  // Initialize schema if needed
  initializeSchema(database)

  return database
}

// Initialize database schema
function initializeSchema(database: Database.Database): void {
  const schema = `
    CREATE TABLE IF NOT EXISTS wines (
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
    );

    CREATE TABLE IF NOT EXISTS cellar_config (
      id TEXT PRIMARY KEY DEFAULT 'default',
      max_slots INTEGER DEFAULT 80,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
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
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (wine_id) REFERENCES wines(id)
    );

    -- Create default cellar config if it doesn't exist
    INSERT OR IGNORE INTO cellar_config (id, max_slots, created_at, updated_at)
    VALUES ('default', 80, datetime('now'), datetime('now'));
  `

  database.exec(schema)
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
app.on('ready', () => {
  db = initializeDatabase()
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
    return stmt.all(...(params || []))
  } catch (error) {
    console.error('Database query error:', error)
    throw error
  }
})

ipcMain.handle('db:run', async (_event, sql: string, params?: unknown[]) => {
  try {
    if (!db) throw new Error('Database not initialized')
    const stmt = db.prepare(sql)
    const result = stmt.run(...(params || []))
    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid,
    }
  } catch (error) {
    console.error('Database run error:', error)
    throw error
  }
})

ipcMain.handle('db:exec', async (_event, sql: string) => {
  try {
    if (!db) throw new Error('Database not initialized')
    db.exec(sql)
    return { success: true }
  } catch (error) {
    console.error('Database exec error:', error)
    throw error
  }
})

ipcMain.handle('app:getDataPath', () => {
  return app.getPath('userData')
})

// Graceful shutdown
process.on('SIGTERM', () => {
  if (db) {
    db.close()
  }
  app.quit()
})
