export interface ElectronAPI {
  database: {
    execute: (sql: string, params?: any[]) => Promise<any>
  }
  invoke: (channel: string, ...args: any[]) => Promise<any>
  on: (channel: string, callback: (...args: any[]) => void) => void
  off: (channel: string, callback: (...args: any[]) => void) => void
}

declare global {
  interface Window {
    electron?: ElectronAPI
  }
}
