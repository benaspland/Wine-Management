import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import TopAppBar from './components/TopAppBar'
import BottomNavBar from './components/BottomNavBar'
import CollectionPage from './pages/CollectionPage'
import WineDetailPage from './pages/WineDetailPage'
import DrinkingSchedulePage from './pages/DrinkingSchedulePage'
import DeliverySchedulePage from './pages/DeliverySchedulePage'
import SettingsPage from './pages/SettingsPage'
import { initializeDatabase } from './services/database'
import { seedDatabase } from './services/seed.service'
import { useWineStore } from './store/wineStore'
import './styles/globals.css'

function App() {
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadWines = useWineStore(state => state.loadWines)

  useEffect(() => {
    const init = async () => {
      try {
        await initializeDatabase()
        await seedDatabase()
        await loadWines()
        setIsReady(true)
      } catch (err) {
        setError((err as Error).message)
        console.error('Failed to initialize app:', err)
      }
    }

    init()
  }, [loadWines])

  if (error) {
    return (
      <div className="min-h-screen bg-background text-on-surface flex items-center justify-center p-6">
        <div className="max-w-md">
          <h1 className="font-headline text-2xl mb-4 text-error">Error</h1>
          <p className="text-outline mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="btn-primary"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!isReady) {
    return (
      <div className="min-h-screen bg-background text-on-surface flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-container border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-outline">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background text-on-surface dark">
        <TopAppBar />
        <main className="pt-16 pb-24 md:pb-0">
          <Routes>
            <Route path="/" element={<CollectionPage />} />
            <Route path="/wine/:id" element={<WineDetailPage />} />
            <Route path="/schedule" element={<DrinkingSchedulePage />} />
            <Route path="/deliveries" element={<DeliverySchedulePage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
        <BottomNavBar />
      </div>
    </BrowserRouter>
  )
}

export default App

