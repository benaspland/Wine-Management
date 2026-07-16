import { openDB, type IDBPDatabase } from 'idb'

/**
 * Storage adapters persist the entire database snapshot (a map of
 * table name -> rows). The dataset is small (a few hundred wines), so
 * whole-snapshot persistence keeps the adapter interface trivial and
 * writes atomic.
 */
export type DbSnapshot = Record<string, unknown[]>

export interface StorageAdapter {
  readonly name: string
  load(): Promise<DbSnapshot | null>
  save(snapshot: DbSnapshot): Promise<void>
}

const IDB_NAME = 'wine-app'
const IDB_STORE = 'tables'
const IDB_KEY = 'db'

/** Legacy localStorage key used by the original storage layer. */
export const LOCAL_STORAGE_KEY = 'wine-app-db'

export class IndexedDBAdapter implements StorageAdapter {
  readonly name = 'indexeddb'
  private dbPromise: Promise<IDBPDatabase> | null = null

  private getDb(): Promise<IDBPDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB(IDB_NAME, 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE)
          }
        },
      })
    }
    return this.dbPromise
  }

  async load(): Promise<DbSnapshot | null> {
    const db = await this.getDb()
    const snapshot = await db.get(IDB_STORE, IDB_KEY)
    return snapshot ?? null
  }

  async save(snapshot: DbSnapshot): Promise<void> {
    const db = await this.getDb()
    await db.put(IDB_STORE, snapshot, IDB_KEY)
  }
}

export class LocalStorageAdapter implements StorageAdapter {
  readonly name = 'localstorage'

  async load(): Promise<DbSnapshot | null> {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!stored) return null
    try {
      return JSON.parse(stored) as DbSnapshot
    } catch (error) {
      console.warn('[Storage] Failed to parse localStorage snapshot:', error)
      return null
    }
  }

  async save(snapshot: DbSnapshot): Promise<void> {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(snapshot))
  }
}

/**
 * Read any snapshot left behind by the legacy localStorage layer, so it
 * can be migrated into IndexedDB on first launch after the upgrade.
 */
export function readLegacyLocalStorageSnapshot(): DbSnapshot | null {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
    return stored ? (JSON.parse(stored) as DbSnapshot) : null
  } catch {
    return null
  }
}

export function createStorageAdapter(): StorageAdapter {
  if (typeof indexedDB !== 'undefined') {
    return new IndexedDBAdapter()
  }
  return new LocalStorageAdapter()
}
