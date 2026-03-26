import { contextBridge, ipcRenderer } from 'electron'

// Expose database API to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  db: {
    query: (sql: string, params?: unknown[]) =>
      ipcRenderer.invoke('db:query', sql, params),
    run: (sql: string, params?: unknown[]) =>
      ipcRenderer.invoke('db:run', sql, params),
    exec: (sql: string) =>
      ipcRenderer.invoke('db:exec', sql),
  },
  app: {
    getDataPath: () =>
      ipcRenderer.invoke('app:getDataPath'),
  },
})
