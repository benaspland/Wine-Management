import { useState, useRef, useEffect } from 'react'
import { useWineStore } from '../store/wineStore'
import * as db from '../services/database'
import { ImportService, CSV_COLUMNS, CSV_REQUIRED_COLUMNS } from '../services/import.service'
import MessageModal from '../components/MessageModal'
import { useToastStore } from '../store/toastStore'
import { wineDisplayName, criticRatingsOf } from '../services/wine.service'

/** What each CSV column expects, shown on the import card. */
const COLUMN_HELP: Record<string, string> = {
  Vintage: '4-digit year, e.g. 2019',
  Country: 'e.g. France',
  Region: 'e.g. Bordeaux',
  Wine: 'Full name — producer and cuvée, e.g. Chateau Meyney',
  Quantity: 'Bottles owned; imported into storage',
  Size: '375ml, 750ml, 1.5L or 3L',
  'Peak Drinking Window': 'Start and end year, e.g. 2026-2040',
  Classification: 'e.g. DOCG, 1er Cru',
  'Wine Rating': '1-5, sets the tier (1 Everyday … 5 Icon)',
  'Professional Critic Ratings': 'e.g. JS 97 : RP 96',
  'Wine Notes': 'Free text',
  Varietal: 'Colon-separated, e.g. Cabernet Sauvignon : Merlot',
  'Alcohol Level': 'e.g. 13.5%',
  'Flavour Profile': 'Colon-separated, e.g. Cassis : Graphite',
  'Recommended Service Temp': 'e.g. 16-18°C',
  'Purchase Price': 'Per bottle; £ and commas are fine, e.g. £32.50',
  'Purchase Date': '15/03/2024 (day first) or 2024-03-15',
  Merchant: 'Who you bought it from, e.g. Berry Bros. & Rudd',
}

/** Quote a CSV value only when it needs it, doubling any inner quotes. */
function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export default function SettingsPage() {
  const wines = useWineStore(state => state.wines)
  const [cellarCapacity, setCellarCapacity] = useState(80)
  const [minDeliveryBottles, setMinDeliveryBottles] = useState(24)
  const [annualConsumptionTarget, setAnnualConsumptionTarget] = useState(30)
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const restoreInputRef = useRef<HTMLInputElement>(null)

  const showToast = useToastStore(state => state.show)
  const loadWines = useWineStore(state => state.loadWines)
  const triggerScheduleUpdate = useWineStore(state => state.triggerScheduleUpdate)

  // Load cellar config on mount
  useEffect(() => {
    db.getCellarConfig().then(config => {
      setCellarCapacity(config.max_home_capacity)
      setAnnualConsumptionTarget(config.annual_consumption_target || 30)
      setMinDeliveryBottles(config.min_delivery_bottles || 24)
    })
  }, [])

  const handleCapacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCellarCapacity(parseInt(e.target.value) || 80)
  }

  const handleMinDeliveryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMinDeliveryBottles(parseInt(e.target.value) || 24)
  }

  const handleAnnualConsumptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAnnualConsumptionTarget(parseInt(e.target.value) || 30)
  }

  const handleSaveConfig = async () => {
    // Validate cellar capacity against current wines at home
    const winesAtHome = wines
      .filter(w => w.quantity_at_home > 0)
      .reduce((sum, w) => sum + w.quantity_at_home, 0)

    if (cellarCapacity < winesAtHome) {
      setMessage({
        type: 'error',
        text: `Cellar capacity cannot be less than ${winesAtHome} bottles currently at home`
      })
      return
    }

    if (minDeliveryBottles <= 0) {
      setMessage({ type: 'error', text: 'Minimum delivery bottles must be greater than 0' })
      return
    }

    setIsLoading(true)
    try {
      await db.updateCellarConfig({
        max_home_capacity: cellarCapacity,
        annual_consumption_target: annualConsumptionTarget,
        min_delivery_bottles: minDeliveryBottles,
      })
      // Regenerate schedules with new parameters
      triggerScheduleUpdate()
      showToast('Settings saved — schedules regenerated')
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

      // Reload wines and regenerate schedules
      await loadWines()
      triggerScheduleUpdate()

      const skippedMsg = result.skipped > 0 ? `, ${result.skipped} skipped as duplicates` : ''
      const successMsg = `Imported ${result.success} wines successfully${skippedMsg}`
      const errorMsg = result.failed > 0 ? ` (${result.failed} failed)` : ''

      if (result.failed > 0) {
        setMessage({ type: 'error', text: successMsg + errorMsg })
      } else {
        showToast(successMsg)
      }

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

  const handleBackup = async () => {
    setIsLoading(true)
    try {
      const backup = await db.exportDatabase()
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `wine-cellar-backup-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      showToast('Full backup downloaded')
    } catch (error) {
      setMessage({ type: 'error', text: `Backup failed: ${(error as Error).message}` })
    } finally {
      setIsLoading(false)
    }
  }

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const proceed = confirm(
      'Restoring a backup REPLACES everything currently in the app — wines, delivery windows and consumption history. Continue?'
    )
    if (!proceed) {
      if (restoreInputRef.current) restoreInputRef.current.value = ''
      return
    }

    setIsLoading(true)
    setMessage(null)
    try {
      const backup: unknown = JSON.parse(await file.text())
      await db.restoreDatabase(backup)
      await loadWines()
      triggerScheduleUpdate()

      showToast('Backup restored successfully')
    } catch (error) {
      setMessage({ type: 'error', text: `Restore failed: ${(error as Error).message}` })
    } finally {
      setIsLoading(false)
      if (restoreInputRef.current) restoreInputRef.current.value = ''
    }
  }

  const handleResetData = async () => {
    const bottles = wines.reduce((sum, w) => sum + w.quantity_in_storage + w.quantity_at_home, 0)
    const proceed = confirm(
      `Delete all ${wines.length} wines (${bottles} bottles), plus delivery windows and consumption history?\n\n` +
        'Your cellar settings are kept. This cannot be undone — make sure you have a backup.'
    )
    if (!proceed) return

    setIsLoading(true)
    setMessage(null)
    try {
      await db.resetDatabase()
      await loadWines()
      triggerScheduleUpdate()
      showToast('All wine data deleted')
    } catch (error) {
      setMessage({ type: 'error', text: `Reset failed: ${(error as Error).message}` })
    } finally {
      setIsLoading(false)
    }
  }

  const handleExport = async () => {
    setIsLoading(true)
    try {
      // Values are keyed by column name and emitted in CSV_COLUMNS order,
      // so export can never drift out of step with what import reads.
      const rows = wines.map(wine => {
        const criticRatings = Object.entries(criticRatingsOf(wine.critic_ratings))
          .map(([key, value]) => `${key.toUpperCase()} ${value}`)
          .join(' : ')

        const values: Record<string, unknown> = {
          Vintage: wine.vintage,
          Country: wine.country,
          Region: wine.region,
          // Deduped name so an export -> import round trip re-parses cleanly
          Wine: wineDisplayName(wine.producer, wine.name),
          Quantity: wine.quantity_in_storage + wine.quantity_at_home,
          Size: wine.format,
          'Peak Drinking Window': `${wine.drinking_window_start}-${wine.drinking_window_end}`,
          Classification: wine.classification,
          'Wine Rating': wine.tier,
          'Professional Critic Ratings': criticRatings,
          'Wine Notes': wine.notes,
          Varietal: wine.varietal,
          'Alcohol Level': wine.alcohol_percent != null ? `${wine.alcohol_percent}%` : '',
          'Flavour Profile': wine.flavor_profile,
          'Recommended Service Temp': `${wine.serving_temp_min}-${wine.serving_temp_max}°C`,
          'Purchase Price': wine.purchase_price ?? '',
          'Purchase Date': wine.purchase_date ?? '',
          Merchant: wine.merchant ?? '',
        }

        return CSV_COLUMNS.map(column => csvEscape(values[column])).join(',')
      })

      const csvContent = [CSV_COLUMNS.join(','), ...rows].join('\n')

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

      showToast('Wines exported successfully')
    } catch (error) {
      setMessage({ type: 'error', text: `Export failed: ${(error as Error).message}` })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="px-6 max-w-2xl mx-auto py-8">
      <h2 className="font-headline text-5xl md:text-7xl mb-4 text-on-surface">Settings</h2>

      {/* Modal notification for import/export feedback */}
      {message && (
        <MessageModal
          type={message.type}
          text={message.text}
          onClose={() => setMessage(null)}
        />
      )}

      <div className="space-y-8">
        {/* Schedule & Cellar Configuration */}
        <div className="card">
          <h3 className="font-headline text-2xl font-bold mb-2">Schedule & Cellar Configuration</h3>
          <p className="text-outline text-sm mb-6">Configure cellar capacity, delivery, and consumption settings</p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-on-surface mb-2">Maximum Cellar Capacity (bottles)</label>
              <input
                type="number"
                value={cellarCapacity}
                onChange={handleCapacityChange}
                disabled={isLoading}
                min="1"
                max="500"
                className="w-full bg-surface-container-low text-on-surface px-4 py-3 rounded border border-outline-variant/20 focus:outline-none focus:border-primary disabled:opacity-50"
              />
              <p className="text-xs text-outline mt-1">Maximum total bottles your home cellar can hold</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-on-surface mb-2">Minimum Delivery (bottles)</label>
              <input
                type="number"
                value={minDeliveryBottles}
                onChange={handleMinDeliveryChange}
                disabled={isLoading}
                min="1"
                max="100"
                className="w-full bg-surface-container-low text-on-surface px-4 py-3 rounded border border-outline-variant/20 focus:outline-none focus:border-primary disabled:opacity-50"
              />
              <p className="text-xs text-outline mt-1">Minimum bottles required for a delivery to be created</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-on-surface mb-2">Annual Consumption Target (bottles)</label>
              <input
                type="number"
                value={annualConsumptionTarget}
                onChange={handleAnnualConsumptionChange}
                disabled={isLoading}
                min="1"
                max="200"
                className="w-full bg-surface-container-low text-on-surface px-4 py-3 rounded border border-outline-variant/20 focus:outline-none focus:border-primary disabled:opacity-50"
              />
              <p className="text-xs text-outline mt-1">Target number of bottles to consume per year</p>
            </div>

            <button
              onClick={handleSaveConfig}
              disabled={isLoading}
              className="btn-primary w-full disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>

        {/* Import Data */}
        <div className="card">
          <h3 className="font-headline text-2xl font-bold mb-2">Import Wines</h3>
          <p className="text-outline text-sm mb-6">
            Upload a CSV file with your wine collection. Expected format:
          </p>

          <div className="bg-surface-container-lowest p-4 rounded-xl mb-4 text-xs text-outline font-mono overflow-x-auto">
            <p className="whitespace-nowrap">{CSV_COLUMNS.join(',')}</p>
          </div>

          <p className="text-xs text-outline mb-4">
            <span className="text-on-surface-variant">
              {CSV_REQUIRED_COLUMNS.join(', ')}
            </span>{' '}
            are required. Every other column is optional — leave it blank or omit it entirely.
            Column order does not matter.
          </p>

          <details className="mb-6 group">
            <summary className="cursor-pointer text-xs uppercase tracking-widest font-bold text-outline hover:text-on-surface transition-colors">
              What each column expects
            </summary>
            <dl className="mt-3 space-y-2">
              {CSV_COLUMNS.map(column => (
                <div key={column} className="text-xs">
                  <dt className="text-on-surface-variant font-medium">
                    {column}
                    {(CSV_REQUIRED_COLUMNS as readonly string[]).includes(column) && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-primary-container">
                        required
                      </span>
                    )}
                  </dt>
                  <dd className="text-outline">{COLUMN_HELP[column]}</dd>
                </div>
              ))}
            </dl>
          </details>

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

        {/* Backup & Restore */}
        <div className="card">
          <h3 className="font-headline text-2xl font-bold mb-2">Backup & Restore</h3>
          <p className="text-outline text-sm mb-6">
            Full snapshot of everything — wines, delivery windows, consumption history and settings —
            as a JSON file. Take a backup before app upgrades; restore replaces all current data.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleBackup}
              disabled={isLoading}
              className="btn-primary flex-1 disabled:opacity-50"
            >
              {isLoading ? 'Working...' : 'Download Backup'}
            </button>

            <input
              ref={restoreInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleRestoreFile}
              disabled={isLoading}
              className="hidden"
              data-testid="restore-input"
            />
            <button
              onClick={() => restoreInputRef.current?.click()}
              disabled={isLoading}
              className="flex-1 border border-outline/40 text-outline hover:text-on-surface hover:border-outline py-3 text-xs tracking-widest uppercase font-bold rounded-full disabled:opacity-50 transition-colors"
            >
              Restore Backup
            </button>
          </div>
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
                {wines.reduce((sum, w) => sum + w.quantity_in_storage + w.quantity_at_home, 0)}
              </p>
            </div>
            <div className="bg-surface-container-low p-4 rounded">
              <p className="text-outline text-xs uppercase tracking-wider mb-1">At Home</p>
              <p className="font-headline text-3xl font-bold text-primary">
                {wines.filter(w => w.quantity_at_home > 0).reduce((sum, w) => sum + w.quantity_at_home, 0)}
              </p>
            </div>
            <div className="bg-surface-container-low p-4 rounded">
              <p className="text-outline text-xs uppercase tracking-wider mb-1">In Storage</p>
              <p className="font-headline text-3xl font-bold text-primary">
                {wines.filter(w => w.quantity_in_storage > 0).reduce((sum, w) => sum + w.quantity_in_storage, 0)}
              </p>
            </div>
          </div>
        </div>

        {/* Danger zone */}
        <div className="card border border-error/30">
          <h3 className="font-headline text-2xl font-bold mb-2 text-error">Reset Collection Data</h3>
          <p className="text-outline text-sm mb-6">
            Deletes every wine, delivery window and consumption record so you can start over from a
            fresh import. Your cellar capacity, delivery and consumption settings are kept.
            Download a backup first — this cannot be undone.
          </p>

          <button
            onClick={handleResetData}
            disabled={isLoading}
            className="w-full border border-error/40 text-error hover:bg-error/10 hover:border-error py-3 text-xs tracking-widest uppercase font-bold rounded-full disabled:opacity-50 transition-colors"
          >
            {isLoading ? 'Working...' : 'Delete All Wine Data'}
          </button>
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
