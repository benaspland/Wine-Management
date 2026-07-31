import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, Wine, CalendarDays, Truck, Settings } from 'lucide-react'
import { useWineStore } from '../store/wineStore'
import { CLOSING_SOON_YEARS } from '../services/dashboard.service'

const TABS = [
  { to: '/', label: 'Overview', Icon: LayoutDashboard },
  { to: '/cellar', label: 'Cellar', Icon: Wine },
  { to: '/schedule', label: 'Schedule', Icon: CalendarDays },
  { to: '/deliveries', label: 'Deliveries', Icon: Truck },
  { to: '/settings', label: 'Settings', Icon: Settings },
]

export default function BottomNavBar() {
  const location = useLocation()
  const wines = useWineStore(state => state.wines)

  // Wines at risk: in-window, closing within the horizon, bottles owned
  const year = new Date().getFullYear()
  const closingSoon = wines.filter(
    w =>
      w.quantity_in_storage + w.quantity_at_home > 0 &&
      w.drinking_window_start <= year &&
      year <= w.drinking_window_end &&
      w.drinking_window_end <= year + CLOSING_SOON_YEARS
  ).length

  return (
    <nav className="md:hidden fixed bottom-0 w-full z-50 bg-surface-container-lowest/80 backdrop-blur-xl border-t border-outline-variant/40">
      {/* pb accounts for the gesture bar on notched phones (viewport-fit=cover) */}
      <div className="flex justify-around items-center pt-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {TABS.map(({ to, label, Icon }) => {
          const active = location.pathname === to
          const showBadge = to === '/cellar' && closingSoon > 0
          return (
            <Link
              key={to}
              to={to}
              className={`relative flex flex-col items-center justify-center transition-all ${
                active ? 'text-primary-container scale-110' : 'text-outline hover:text-on-surface-variant'
              }`}
            >
              <Icon size={22} className="mb-1" aria-hidden="true" />
              {showBadge && (
                <span
                  className="absolute -top-1.5 left-1/2 ml-1 min-w-4 h-4 px-1 rounded-full bg-warn text-background text-[10px] font-bold flex items-center justify-center"
                  title={`${closingSoon} ${closingSoon === 1 ? 'wine' : 'wines'} closing soon`}
                  aria-label={`${closingSoon} wines with drinking windows closing soon`}
                >
                  {closingSoon}
                </span>
              )}
              <span className="font-label text-[10px] font-medium tracking-tight">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
