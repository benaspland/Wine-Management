interface LocationFilterProps {
  value: 'all' | 'home' | 'storage'
  onChange: (value: 'all' | 'home' | 'storage') => void
}

export default function LocationFilter({ value, onChange }: LocationFilterProps) {
  return (
    <div className="flex gap-2">
      <button
        onClick={() => onChange('all')}
        className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
          value === 'all'
            ? 'bg-primary-container text-on-primary-container'
            : 'bg-surface-container-low text-outline hover:bg-surface-container'
        }`}
      >
        All
      </button>
      <button
        onClick={() => onChange('home')}
        className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
          value === 'home'
            ? 'bg-primary-container text-on-primary-container'
            : 'bg-surface-container-low text-outline hover:bg-surface-container'
        }`}
      >
        Home
      </button>
      <button
        onClick={() => onChange('storage')}
        className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
          value === 'storage'
            ? 'bg-primary-container text-on-primary-container'
            : 'bg-surface-container-low text-outline hover:bg-surface-container'
        }`}
      >
        Storage
      </button>
    </div>
  )
}
