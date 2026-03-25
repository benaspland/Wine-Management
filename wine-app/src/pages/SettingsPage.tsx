import { useState, useRef, useEffect } from 'react'
import { useWineStore } from '../store/wineStore'
import * as db from '../services/database'
import { ImportService } from '../services/import.service'

export default function SettingsPage() {
  const wines = useWineStore(state => state.wines)
  const [cellarCapacity, setCellarCapacity] = useState(80)
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadWines = useWineStore(state => state.loadWines)

  // Load cellar config on mount
  useEffect(() => {
    db.getCellarConfig().then(config => {
      setCellarCapacity(config.max_slots)
    })
  }, [])

  const handleCapacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCellarCapacity(parseInt(e.target.value) || 80)
  }

  const handleSaveCapacity = async () => {
    setIsLoading(true)
    try {
      await db.updateCellarCapacity(cellarCapacity)
      setMessage({ type: 'success', text: 'Cellar capacity updated successfully' })
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      setMessage({ type: 'error', text: `Error: ${(error as Error).message}` })
    } finally {
      setIsLoading(false)
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsLoading(true)
    setMessage(null)

    try {
      const result = await ImportService.importFromCSV(file)

      // Reload wines
      await loadWines()

      const successMsg = `Imported ${result.success} wines successfully`
      const errorMsg = result.failed > 0 ? ` (${result.failed} failed)` : ''

      setMessage({
        type: result.failed > 0 ? 'success' : 'success',
        text: successMsg + errorMsg
      })

      if (result.errors.length > 0) {
        console.warn('Import errors:', result.errors)
      }

      setTimeout(() => setMessage(null), 5000)
    } catch (error) {
      setMessage({ type: 'error', text: `Import failed: ${(error as Error).message}` })
    } finally {
      setIsLoading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleExport = async () => {
    setIsLoading(true)
    try {
      // Create CSV content
      const headers = [
        'Vintage',
        'Country',
        'Region',
        'Wine',
        'Quantity',
        'Size',
        'Peak Drinking Window',
        'Classification',
        'Wine Rating',
        'Professional Critic Ratings',
        'Wine Notes',
        'Varietal',
        'Alcohol Level',
        'Flavour Profile',
        'Recommended Service Temp',
      ]

      const rows = wines.map(wine => {
        const criticRatings = Object.entries(wine.critic_ratings || {})
          .map(([key, value]) => `${key.toUpperCase()} ${value}`)
          .join(' : ')

        const peakWindow = `${wine.drinking_window_start}-${wine.drinking_window_end}`
        const serviceTemp = `${wine.serving_temp_min}-${wine.serving_temp_max}°C`
        const fullName = `${wine.producer} ${wine.name}`

        return [
          wine.vintage,
          wine.country,
          wine.region,
          `"${fullName}"`,
          wine.quantity,
          wine.format,
          peakWindow,
          wine.classification,
          wine.tier,
          `"${criticRatings}"`,
          `"${wine.notes}"`,
          wine.varietal,
          `${wine.alcohol_percent}%`,
          `"${wine.flavor_profile}"`,
          serviceTemp,
        ].join(',')
      })

      const csvContent = [headers.join(','), ...rows].join('\n')

      // Download
      const blob = new Blob([csvContent], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `wine-collection-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      setMessage({ type: 'success', text: 'Wines exported successfully' })
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      setMessage({ type: 'error', text: `Export failed: ${(error as Error).message}` })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="px-6 max-w-2xl mx-auto py-8">
      <h2 className="font-headline text-5xl md:text-7xl mb-4 text-on-surface">Settings</h2>

      {message && (
        <div
          className={`mb-6 p-4 rounded ${
            message.type === 'success'
              ? 'bg-tertiary-fixed/20 text-tertiary border border-tertiary/30'
              : 'bg-error-container/20 text-error border border-error/30'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="space-y-8">
        {/* Cellar Capacity */}
        <div className="card">
          <h3 className="font-headline text-2xl font-bold mb-2">Cellar Capacity</h3>
          <p className="text-outline text-sm mb-6">Configure maximum wine slots in your home cellar</p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-on-surface mb-2">Maximum Slots</label>
              <input
                type="number"
                value={cellarCapacity}
                onChange={handleCapacityChange}
                disabled={isLoading}
                min="1"
                max="500"
                className="w-full bg-surface-container-low text-on-surface px-4 py-3 rounded border border-outline-variant/20 focus:outline-none focus:border-primary disabled:opacity-50"
              />
            </div>

            <button
              onClick={handleSaveCapacity}
              disabled={isLoading}
              className="btn-primary w-full disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : 'Save Capacity'}
            </button>
          </div>
        </div>

        {/* Import Data */}
        <div className="card">
          <h3 className="font-headline text-2xl font-bold mb-2">Import Wines</h3>
          <p className="text-outline text-sm mb-6">
            Upload a CSV file with your wine collection. Expected format:
          </p>

          <div className="bg-surface-container-lowest p-4 rounded mb-6 text-xs text-outline font-mono overflow-x-auto">
            <p>Vintage,Country,Region,Wine,Quantity,Size,Peak Drinking Window,Classification,Wine Rating,...</p>
            <p className="text-outline-variant mt-2">
              See documentation for full column requirements
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            disabled={isLoading}
            className="hidden"
          />

          <button
            onClick={handleImportClick}
            disabled={isLoading}
            className="btn-primary w-full disabled:opacity-50"
          >
            {isLoading ? 'Importing...' : 'Select CSV File'}
          </button>
        </div>

        {/* Export Data */}
        <div className="card">
          <h3 className="font-headline text-2xl font-bold mb-2">Export Wines</h3>
          <p className="text-outline text-sm mb-6">Download your entire wine collection as CSV for backup or external use</p>

          <button
            onClick={handleExport}
            disabled={isLoading || wines.length === 0}
            className="btn-primary w-full disabled:opacity-50"
          >
            {isLoading ? 'Exporting...' : `Export ${wines.length} Wines`}
          </button>
        </div>

        {/* Data Summary */}
        <div className="card">
          <h3 className="font-headline text-2xl font-bold mb-4">Collection Summary</h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-surface-container-low p-4 rounded">
              <p className="text-outline text-xs uppercase tracking-wider mb-1">Total Wines</p>
              <p className="font-headline text-3xl font-bold text-primary">{wines.length}</p>
            </div>
            <div className="bg-surface-container-low p-4 rounded">
              <p className="text-outline text-xs uppercase tracking-wider mb-1">Total Bottles</p>
              <p className="font-headline text-3xl font-bold text-primary">
                {wines.reduce((sum, w) => sum + w.quantity, 0)}
              </p>
            </div>
            <div className="bg-surface-container-low p-4 rounded">
              <p className="text-outline text-xs uppercase tracking-wider mb-1">At Home</p>
              <p className="font-headline text-3xl font-bold text-primary">
                {wines.filter(w => w.location === 'home').length}
              </p>
            </div>
            <div className="bg-surface-container-low p-4 rounded">
              <p className="text-outline text-xs uppercase tracking-wider mb-1">In Storage</p>
              <p className="font-headline text-3xl font-bold text-primary">
                {wines.filter(w => w.location === 'storage').length}
              </p>
            </div>
          </div>
        </div>

        {/* About */}
        <div className="card">
          <h3 className="font-headline text-2xl font-bold mb-4">About</h3>
          <div className="text-sm text-outline space-y-2">
            <p>
              <strong>The Cellar</strong> - Wine Portfolio Management System
            </p>
            <p>
              Version 1.0.0
            </p>
            <p>
              Manage your wine collection across multiple locations with smart scheduling and consumption planning.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
