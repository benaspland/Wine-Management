import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, Wine, CalendarDays, Truck, Settings } from 'lucide-react'

const TABS = [
  { to: '/', label: 'Overview', Icon: LayoutDashboard },
  { to: '/cellar', label: 'Cellar', Icon: Wine },
  { to: '/schedule', label: 'Schedule', Icon: CalendarDays },
  { to: '/deliveries', label: 'Deliveries', Icon: Truck },
  { to: '/settings', label: 'Settings', Icon: Settings },
]

export default function BottomNavBar() {
  const location = useLocation()

  return (
    <nav className="md:hidden fixed bottom-0 w-full z-50 bg-[#131313]/70 backdrop-blur-xl border-t border-[#504532]/15">
      {/* pb accounts for the gesture bar on notched phones (viewport-fit=cover) */}
      <div className="flex justify-around items-center pt-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {TABS.map(({ to, label, Icon }) => {
          const active = location.pathname === to
          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-col items-center justify-center transition-all ${
                active ? 'text-[#FFBF00] scale-110' : 'text-[#9C8F78] opacity-60 hover:opacity-100'
              }`}
            >
              <Icon size={22} className="mb-1" aria-hidden="true" />
              <span className="font-label text-[10px] font-medium tracking-tight">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
