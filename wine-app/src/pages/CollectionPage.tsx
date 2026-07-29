import { useState } from 'react'
import type { Wine, ConsumptionLogEntry } from '../types/index'
import { useWineStore } from '../store/wineStore'
import { useToastStore } from '../store/toastStore'
import { getScheduledDeliveryDateForWine } from '../services/deliveryPlanning.service'
import { wineDisplayName } from '../services/wine.service'
import * as db from '../services/database'
import * as workflows from '../services/workflows.service'
import ConsumptionSheet from '../components/ConsumptionSheet'
import WineCard from '../components/WineCard'
import WineListRow from '../components/WineListRow'
import WineDetailPanel from '../components/WineDetailPanel'
import WineForm from '../components/WineForm'
import FilterDrawer from '../components/FilterDrawer'
import { Plus, Search, SlidersHorizontal, LayoutGrid, List } from 'lucide-react'

const VIEW_MODE_KEY = 'wine-app-view-mode'

function initialViewMode(): 'grid' | 'list' {
  try {
    return localStorage.getItem(VIEW_MODE_KEY) === 'list' ? 'list' : 'grid'
  } catch {
    return 'grid'
  }
}

export default function CollectionPage() {
  const allWines = useWineStore(state => state.wines)
  const wines = useWineStore(state => state.filteredWines)
  const loading = useWineStore(state => state.loading)
  const consumeWine = useWineStore(state => state.consumeWine)
  const undoConsume = useWineStore(state => state.undoConsume)
  const moveWineToHome = useWineStore(state => state.moveWineToHome)
  const editWineDetails = useWineStore(state => state.editWineDetails)
  const addWine = useWineStore(state => state.addWine)
  const deleteWine = useWineStore(state => state.deleteWine)
  const showToast = useToastStore(state => state.show)

  const [selectedWine, setSelectedWine] = useState<Wine | null>(null)
  const [editingWine, setEditingWine] = useState<Wine | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(initialViewMode)
  const [selectedWineScheduledDate, setSelectedWineScheduledDate] = useState<string | undefined>()
  const [selectedWineLog, setSelectedWineLog] = useState<ConsumptionLogEntry[]>([])
  // Hold-to-log: a bottle being logged with a chosen date and note
  const [logging, setLogging] = useState<{ wineId: string; label: string } | null>(null)
  // An already-logged bottle being annotated from the toast
  const [amending, setAmending] = useState<{ entry: ConsumptionLogEntry; label: string } | null>(null)

  const searchTerm = useWineStore(state => state.searchTerm)
  const setSearchTerm = useWineStore(state => state.setSearchTerm)
  const locationFilter = useWineStore(state => state.locationFilter)
  const tierFilter = useWineStore(state => state.tierFilter)
  const regionFilter = useWineStore(state => state.regionFilter)
  const countryFilter = useWineStore(state => state.countryFilter)
  const wineTypeFilter = useWineStore(state => state.wineTypeFilter)
  const formatFilter = useWineStore(state => state.formatFilter)
  const windowFilter = useWineStore(state => state.windowFilter)

  const activeFilterCount = [
    locationFilter !== 'all',
    tierFilter !== null,
    regionFilter !== null,
    countryFilter !== null,
    wineTypeFilter !== null,
    formatFilter !== null,
    windowFilter !== 'all',
  ].filter(Boolean).length

  const totalBottles = wines.reduce((sum, w) => sum + w.quantity_in_storage + w.quantity_at_home, 0)

  const switchViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode)
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode)
    } catch {
      // View preference is a nice-to-have; ignore storage failures
    }
  }

  const handleAddWine = async (wineData: Omit<Wine, 'id' | 'created_at' | 'updated_at'>) => {
    await addWine(wineData)
    setShowForm(false)
    showToast(`${wineDisplayName(wineData.producer, wineData.name)} added to the collection`)
  }

  const handleEditWine = async (wineData: Partial<Wine>) => {
    if (editingWine) {
      await editWineDetails(editingWine.id, wineData)
      setEditingWine(null)
      setSelectedWine(null)
    }
  }

  const handleSelectWine = async (wine: Wine) => {
    setSelectedWine(wine)
    setSelectedWineLog(await db.getConsumptionLogByWineId(wine.id))
    setSelectedWineScheduledDate(await getScheduledDeliveryDateForWine(allWines, wine.id))
  }

  /** Keep the open detail panel in sync after inventory changes. */
  const refreshSelectedWine = async (wineId: string) => {
    const updated = await db.getWineById(wineId)
    setSelectedWine(current => (current?.id === wineId && updated ? updated : current))
    setSelectedWineLog(await db.getConsumptionLogByWineId(wineId))
  }

  const wineLabel = (wine: Wine) => `${wineDisplayName(wine.producer, wine.name)} ${wine.vintage}`

  /** Log a bottle, then offer to annotate or undo it from the toast. */
  const logConsumption = async (wineId: string, consumedDate?: string, notes?: string) => {
    const wine = allWines.find(w => w.id === wineId)
    const label = wine ? wineLabel(wine) : 'Bottle'

    const entry = await consumeWine(wineId, consumedDate, notes)
    showToast(`${label} consumed`, {
      action: {
        label: notes ? 'Edit note' : 'Add note',
        run: () => setAmending({ entry, label }),
      },
      onUndo: async () => {
        try {
          await undoConsume(entry.id)
          await refreshSelectedWine(wineId)
        } catch (error) {
          showToast(`Undo failed: ${(error as Error).message}`, { type: 'error' })
        }
      },
    })
    await refreshSelectedWine(wineId)
  }

  /** Short tap: log it now, with today's date. */
  const handleConsume = async (wineId: string) => {
    try {
      await logConsumption(wineId)
    } catch (error) {
      showToast(`Could not consume: ${(error as Error).message}`, { type: 'error' })
    }
  }

  /** Hold: pick the date it was actually drunk, and note it. */
  const handleConsumeDetailed = (wine: Wine) => {
    setLogging({ wineId: wine.id, label: wineLabel(wine) })
  }

  const handleMoveToHome = async (wineId: string, quantity: number) => {
    await moveWineToHome(wineId, quantity)
    showToast(`${quantity} ${quantity === 1 ? 'bottle' : 'bottles'} moved home`)
    await refreshSelectedWine(wineId)
  }

  const handleDelete = async (wineId: string) => {
    await deleteWine(wineId)
  }

  const handlePhotoChange = async (wineId: string, imageUrl: string) => {
    await editWineDetails(wineId, { image_url: imageUrl })
    await refreshSelectedWine(wineId)
    showToast('Photo saved')
  }

  const handleEditClick = (wine: Wine) => {
    setEditingWine(wine)
    setShowForm(true)
  }

  return (
    <>
      <FilterDrawer open={showFilters} onClose={() => setShowFilters(false)} />

      {/* Hold-to-log: choose the date actually drunk, plus a note */}
      {logging && (
        <ConsumptionSheet
          isOpen
          onClose={() => setLogging(null)}
          wineLabel={logging.label}
          initialDate={new Date().toISOString().split('T')[0]}
          onSubmit={async ({ consumedDate, notes }) => {
            await logConsumption(logging.wineId, consumedDate, notes || undefined)
          }}
        />
      )}

      {/* Annotating a bottle already logged */}
      {amending && (
        <ConsumptionSheet
          isOpen
          isAmendment
          onClose={() => setAmending(null)}
          wineLabel={amending.label}
          initialDate={amending.entry.consumed_date}
          initialNotes={amending.entry.notes}
          onSubmit={async ({ consumedDate, notes }) => {
            await workflows.amendConsumption(amending.entry.id, { consumedDate, notes })
            await refreshSelectedWine(amending.entry.wine_id)
            showToast('Tasting note saved')
          }}
        />
      )}

      <div className="px-6 max-w-7xl mx-auto py-8">
        {/* Hero Section */}
        <div className="mb-8">
          <h2 className="font-headline text-4xl md:text-7xl mb-4 text-on-surface">Private Collection</h2>
          <div className="flex items-baseline gap-4 mb-6">
            <span className="text-primary font-label tracking-widest text-sm uppercase">
              {totalBottles} Bottles
            </span>
            <div className="h-[1px] flex-grow bg-outline-variant/20"></div>
            <span className="text-outline text-sm italic">
              {wines.length} {wines.length === 1 ? 'Wine' : 'Wines'}
            </span>
          </div>

          {/* Toolbar: search + filters + view + add */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-48">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-outline pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                placeholder="Search producer, name, region..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-surface-container-low text-on-surface pl-9 pr-3 py-2.5 rounded-full border border-outline-variant/20 focus:outline-none focus:border-primary text-sm"
              />
            </div>

            <button
              onClick={() => setShowFilters(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-surface-container-low border border-outline-variant/20 text-on-surface-variant hover:border-primary text-sm font-medium transition-colors"
            >
              <SlidersHorizontal size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Filter & Sort</span>
              {activeFilterCount > 0 && (
                <span className="bg-primary-container text-on-primary text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>

            <div className="flex rounded-full border border-outline-variant/20 overflow-hidden">
              <button
                onClick={() => switchViewMode('grid')}
                aria-label="Grid view"
                aria-pressed={viewMode === 'grid'}
                className={`p-2.5 transition-colors ${viewMode === 'grid' ? 'bg-primary-container text-on-primary' : 'bg-surface-container-low text-outline hover:text-on-surface'}`}
              >
                <LayoutGrid size={16} />
              </button>
              <button
                onClick={() => switchViewMode('list')}
                aria-label="List view"
                aria-pressed={viewMode === 'list'}
                className={`p-2.5 transition-colors ${viewMode === 'list' ? 'bg-primary-container text-on-primary' : 'bg-surface-container-low text-outline hover:text-on-surface'}`}
              >
                <List size={16} />
              </button>
            </div>

            <button
              onClick={() => {
                setEditingWine(null)
                setShowForm(true)
              }}
              className="flex items-center gap-2 bg-primary-container text-on-primary px-5 py-2.5 rounded-full font-medium hover:bg-primary transition-colors active:scale-95"
            >
              <Plus size={18} aria-hidden="true" />
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
            <p className="text-outline mb-4">
              {allWines.length === 0 ? 'No wines in collection yet' : 'No wines match the current filters'}
            </p>
            {allWines.length === 0 && (
              <button onClick={() => setShowForm(true)} className="btn-primary">
                Add Your First Wine
              </button>
            )}
          </div>
        )}

        {/* Wine Grid */}
        {!loading && wines.length > 0 && viewMode === 'grid' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pt-6">
            {wines.map(wine => (
              <WineCard
                key={wine.id}
                wine={wine}
                onSelect={handleSelectWine}
                onConsume={handleConsume}
                onConsumeDetailed={handleConsumeDetailed}
                isLoading={loading}
              />
            ))}
          </div>
        )}

        {/* Wine List */}
        {!loading && wines.length > 0 && viewMode === 'list' && (
          <div className="flex flex-col gap-2">
            {wines.map(wine => (
              <WineListRow
                key={wine.id}
                wine={wine}
                onSelect={handleSelectWine}
                onConsume={handleConsume}
                onConsumeDetailed={handleConsumeDetailed}
                isLoading={loading}
              />
            ))}
          </div>
        )}

        {/* Detail Panel */}
        {selectedWine && (
          <WineDetailPanel
            wine={selectedWine}
            onClose={() => setSelectedWine(null)}
            onConsume={handleConsume}
            onMoveToHome={handleMoveToHome}
            onEdit={handleEditClick}
            onDelete={handleDelete}
            onPhotoChange={handlePhotoChange}
            isLoading={loading}
            scheduledDeliveryDate={selectedWineScheduledDate}
            consumptionLog={selectedWineLog}
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
