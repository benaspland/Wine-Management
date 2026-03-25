export default function SettingsPage() {
  return (
    <div className="px-6 max-w-2xl mx-auto">
      <h2 className="font-headline text-4xl mb-4 text-on-surface">Settings</h2>
      <div className="space-y-6">
        <div className="card">
          <h3 className="font-headline text-xl mb-2">Cellar Capacity</h3>
          <p className="text-outline text-sm mb-4">Configure maximum storage slots</p>
          <input type="number" defaultValue={80} className="w-full bg-surface-container-low p-2 rounded border border-outline-variant/20" />
        </div>
        <div className="card">
          <h3 className="font-headline text-xl mb-2">Import Data</h3>
          <p className="text-outline text-sm mb-4">Upload CSV file with wines</p>
          <input type="file" accept=".csv" className="w-full" />
        </div>
        <div className="card">
          <h3 className="font-headline text-xl mb-2">Export Data</h3>
          <p className="text-outline text-sm mb-4">Download all wines as CSV</p>
          <button className="btn-primary">Export</button>
        </div>
      </div>
    </div>
  )
}
