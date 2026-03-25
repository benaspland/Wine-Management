import { BrowserRouter, Routes, Route } from 'react-router-dom'
import TopAppBar from './components/TopAppBar'
import BottomNavBar from './components/BottomNavBar'
import CollectionPage from './pages/CollectionPage'
import WineDetailPage from './pages/WineDetailPage'
import DrinkingSchedulePage from './pages/DrinkingSchedulePage'
import DeliverySchedulePage from './pages/DeliverySchedulePage'
import SettingsPage from './pages/SettingsPage'
import './styles/globals.css'

function App() {
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
