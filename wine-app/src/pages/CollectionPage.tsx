import { useState } from 'react'
import type { Wine } from '../types/index'
import { useWineStore } from '../store/wineStore'
import WineCard from '../components/WineCard'
import WineDetailPanel from '../components/WineDetailPanel'
import WineForm from '../components/WineForm'
import * as db from '../services/database'

export default function CollectionPage() {
  const wines = useWineStore(state => state.filteredWines)
  const loading = useWineStore(state => state.loading)
  const consumeWine = useWineStore(state => state.consumeWine)
  const moveWineToHome = useWineStore(state => state.moveWineToHome)
  const editWineDetails = useWineStore(state => state.editWineDetails)
  const addWine = useWineStore(state => state.addWine)

  const [selectedWine, setSelectedWine] = useState<Wine | null>(null)
  const [editingWine, setEditingWine] = useState<Wine | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [selectedWineScheduledDate, setSelectedWineScheduledDate] = useState<string | undefined>()

  // Get filter state and actions from store
  const searchTerm = useWineStore(state => state.searchTerm)
  const setSearchTerm = useWineStore(state => state.setSearchTerm)
  const locationFilter = useWineStore(state => state.locationFilter)
  const setLocationFilter = useWineStore(state => state.setLocationFilter)
  const tierFilter = useWineStore(state => state.tierFilter)
  const setTierFilter = useWineStore(state => state.setTierFilter)

  const totalBottles = wines.reduce((sum, w) => sum + w.quantity_in_storage + w.quantity_at_home, 0)

  const handleAddWine = async (wineData: any) => {
    await addWine(wineData)
    setShowForm(false)
  }

  const handleEditWine = async (wineData: any) => {
    if (editingWine) {
      await editWineDetails(editingWine.id, wineData)
      setEditingWine(null)
      setSelectedWine(null)
    }
  }

  const handleSelectWine = async (wine: Wine) => {
    setSelectedWine(wine)
    // Fetch scheduled delivery date from database
    const scheduledDate = await db.getNextScheduledDeliveryDateForWine(wine.id)
    setSelectedWineScheduledDate(scheduledDate ?? undefined)
  }

  const handleConsume = async (wineId: string) => {
    await consumeWine(wineId)
  }

  const handleMoveToHome = async (wineId: string) => {
    await moveWineToHome(wineId, 1)
  }

  const handleEditClick = (wine: Wine) => {
    setEditingWine(wine)
    setShowForm(true)
  }

  return (
    <>

      {/* Filter Toggle Button */}
      <button
        onClick={() => setShowFilters(!showFilters)}
        title="Open filters"
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#ffcd45'
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 191, 0, 0.3)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 191, 0, 0.1)'
          e.currentTarget.style.boxShadow = 'none'
        }}
        style={{
          position: 'fixed',
          top: '20px',
          left: '20px',
          padding: '10px',
          background: 'rgba(255, 191, 0, 0.1)',
          color: '#ffbf00',
          border: '1px solid rgba(255, 191, 0, 0.2)',
          borderRadius: '8px',
          cursor: 'pointer',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s ease',
          backdropFilter: 'blur(8px)'
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>tune</span>
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
            style={{ alignSelf: 'flex-end', padding: '4px 8px', background: 'transparent', border: 'none', color: '#e5e2e1', cursor: 'pointer', fontSize: '20px', marginBottom: '12px' }}
          >
            ✕
          </button>
          <h2 style={{ color: '#e5e2e1', fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>Filters</h2>

          {/* Filter Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Search */}
            <div>
              <label style={{ display: 'block', color: '#9c8f78', fontSize: '12px', marginBottom: '4px' }}>Search</label>
              <input
                type="text"
                placeholder="Producer, name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: '100%', padding: '6px', background: '#201f1f', border: '1px solid #504532', color: '#e5e2e1', borderRadius: '4px', boxSizing: 'border-box' }}
              />
            </div>

            {/* Location */}
            <div>
              <label style={{ display: 'block', color: '#9c8f78', fontSize: '12px', marginBottom: '4px' }}>Location</label>
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value as 'all' | 'home' | 'storage')}
                style={{ width: '100%', padding: '6px', background: '#201f1f', border: '1px solid #504532', color: '#e5e2e1', borderRadius: '4px', boxSizing: 'border-box' }}>
                <option value="all">All</option>
                <option value="home">Home</option>
                <option value="storage">Storage</option>
              </select>
            </div>

            {/* Tier */}
            <div>
              <label style={{ display: 'block', color: '#9c8f78', fontSize: '12px', marginBottom: '4px' }}>Tier</label>
              <select
                value={tierFilter || ''}
                onChange={(e) => setTierFilter(e.target.value ? parseInt(e.target.value) : null)}
                style={{ width: '100%', padding: '6px', background: '#201f1f', border: '1px solid #504532', color: '#e5e2e1', borderRadius: '4px', boxSizing: 'border-box' }}>
                <option value="">All Tiers</option>
                <option value="1">1 - Everyday</option>
                <option value="2">2 - Quality</option>
                <option value="3">3 - Fine</option>
                <option value="4">4 - Premium</option>
                <option value="5">5 - Icon</option>
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="px-6 max-w-7xl mx-auto py-8">
        {/* Hero Section */}
        <div className="mb-12">
          <h2 className="font-headline text-5xl md:text-7xl mb-4 text-on-surface">Private Collection</h2>
          <div className="flex items-baseline gap-4 mb-6">
            <span className="text-primary font-label tracking-widest text-sm uppercase">
              {totalBottles} Bottles
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
          scheduledDeliveryDate={selectedWineScheduledDate}
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
