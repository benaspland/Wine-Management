import { useEffect, useState } from 'react'
import type { Wine } from '../types/index'
import { useWineStore } from '../store/wineStore'
import WineCard from '../components/WineCard'
import WineDetailPanel from '../components/WineDetailPanel'
import WineForm from '../components/WineForm'

export default function CollectionPage() {
  const wines = useWineStore(state => state.filteredWines)
  const loading = useWineStore(state => state.loading)
  const consumeWine = useWineStore(state => state.consumeWine)
  const moveWineToHome = useWineStore(state => state.moveWineToHome)
  const updateWine = useWineStore(state => state.updateWine)
  const addWine = useWineStore(state => state.addWine)

  const [selectedWine, setSelectedWine] = useState<Wine | null>(null)
  const [editingWine, setEditingWine] = useState<Wine | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [stats, setStats] = useState<any>(null)
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    loadStats()
  }, [wines])

  const loadStats = async () => {
    const result = await useWineStore.getState().getStats()
    setStats(result)
  }

  const handleAddWine = async (wineData: any) => {
    await addWine(wineData)
    setShowForm(false)
  }

  const handleEditWine = async (wineData: any) => {
    if (editingWine) {
      await updateWine(editingWine.id, wineData)
      setEditingWine(null)
      setSelectedWine(null)
    }
  }

  const handleSelectWine = (wine: Wine) => {
    setSelectedWine(wine)
  }

  const handleConsume = async (wineId: string) => {
    await consumeWine(wineId)
  }

  const handleMoveToHome = async (wineId: string) => {
    await moveWineToHome(wineId)
  }

  const handleEditClick = (wine: Wine) => {
    setEditingWine(wine)
    setShowForm(true)
  }

  return (
    <>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, background: 'red', color: 'white', padding: '20px', fontSize: '24px', zIndex: 999 }}>
        RED BANNER TEST
      </div>

      {/* Filter Toggle Button */}
      <button
        onClick={() => setShowFilters(!showFilters)}
        style={{ position: 'fixed', top: '120px', left: '24px', padding: '8px 12px', background: '#ffbf00', color: '#402d00', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '16px', zIndex: 50, fontWeight: 'bold' }}
      >
        🔍 Filters
      </button>

      {/* Filter Overlay */}
      {showFilters && (
        <div
          onClick={() => setShowFilters(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40 }}
        />
      )}

      {/* Filter Drawer */}
      {showFilters && (
        <div style={{ position: 'fixed', left: 0, top: 0, height: '100vh', width: '320px', background: '#1c1b1b', borderRight: '1px solid #504532', padding: '24px', overflowY: 'auto', zIndex: 45, display: 'flex', flexDirection: 'column' }}>
          <button
            onClick={() => setShowFilters(false)}
            style={{ alignSelf: 'flex-end', padding: '4px 8px', background: 'transparent', border: 'none', color: '#e5e2e1', cursor: 'pointer', fontSize: '20px' }}
          >
            ✕
          </button>
          <h2 style={{ color: '#e5e2e1', fontSize: '18px', fontWeight: 'bold', marginTop: '16px' }}>Filters</h2>
          <p style={{ color: '#9c8f78', marginTop: '12px' }}>Filter panel UI coming soon...</p>
        </div>
      )}

      <div className="px-6 max-w-7xl mx-auto py-8">
        {/* Hero Section */}
        <div className="mb-12">
          <h2 className="font-headline text-5xl md:text-7xl mb-4 text-on-surface">Private Collection</h2>
          <div className="flex items-baseline gap-4 mb-6">
            <span className="text-primary font-label tracking-widest text-sm uppercase">
              {stats?.totalBottles || 0} Bottles
            </span>
            <div className="h-[1px] flex-grow bg-outline-variant/20"></div>
            <span className="text-outline text-sm italic">
              {wines.length} {wines.length === 1 ? 'Wine' : 'Wines'}
            </span>
          </div>

          {/* Add Wine Button */}
          <div className="flex justify-end">
            <button
              onClick={() => {
                setEditingWine(null)
                setShowForm(true)
              }}
              className="flex items-center gap-2 bg-primary-container text-on-primary px-4 py-2 rounded font-medium hover:bg-primary transition-colors active:scale-95"
            >
              <span className="material-symbols-outlined">add</span>
              Add Wine
            </button>
          </div>
        </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-12">
          <p className="text-outline">Loading wines...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && wines.length === 0 && (
        <div className="text-center py-12">
          <p className="text-outline mb-4">No wines in collection yet</p>
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary"
          >
            Add Your First Wine
          </button>
        </div>
      )}

      {/* Wine Grid */}
      {!loading && wines.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-20 gap-x-12">
          {wines.map(wine => (
            <WineCard
              key={wine.id}
              wine={wine}
              onSelect={handleSelectWine}
              onConsume={handleConsume}
              isLoading={loading}
            />
          ))}
        </div>
      )}

      {/* Detail Panel (Desktop) */}
      {selectedWine && (
        <WineDetailPanel
          wine={selectedWine}
          onClose={() => setSelectedWine(null)}
          onConsume={handleConsume}
          onMoveToHome={handleMoveToHome}
          onEdit={handleEditClick}
          isLoading={loading}
        />
      )}

      {/* Wine Form Modal */}
      <WineForm
        isOpen={showForm && !editingWine}
        onClose={() => setShowForm(false)}
        onSubmit={handleAddWine}
        isLoading={loading}
      />

      {/* Edit Form Modal */}
      {editingWine && (
        <WineForm
          isOpen={showForm && !!editingWine}
          onClose={() => {
            setShowForm(false)
            setEditingWine(null)
          }}
          onSubmit={handleEditWine}
          initialWine={editingWine}
          isLoading={loading}
        />
      )}
      </div>
    </>
  )
}
