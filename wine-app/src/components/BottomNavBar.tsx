import { Link, useLocation } from 'react-router-dom'

export default function BottomNavBar() {
  const location = useLocation()

  const isActive = (path: string) => location.pathname === path

  return (
    <nav className="md:hidden fixed bottom-0 w-full z-50 bg-[#131313]/70 backdrop-blur-xl border-t border-[#504532]/15">
      <div className="flex justify-around items-center pt-3 pb-6 px-4">
        <Link to="/" className={`flex flex-col items-center justify-center transition-all ${isActive('/') ? 'text-[#FFBF00] scale-110' : 'text-[#9C8F78] opacity-60 hover:opacity-100'}`}>
          <span className="material-symbols-outlined mb-1">grid_view</span>
          <span className="font-label text-[10px] font-medium tracking-tight">Cellar</span>
        </Link>
        <Link to="/schedule" className={`flex flex-col items-center justify-center transition-all ${isActive('/schedule') ? 'text-[#FFBF00] scale-110' : 'text-[#9C8F78] opacity-60 hover:opacity-100'}`}>
          <span className="material-symbols-outlined mb-1">event_note</span>
          <span className="font-label text-[10px] font-medium tracking-tight">Schedule</span>
        </Link>
        <Link to="/deliveries" className={`flex flex-col items-center justify-center transition-all ${isActive('/deliveries') ? 'text-[#FFBF00] scale-110' : 'text-[#9C8F78] opacity-60 hover:opacity-100'}`}>
          <span className="material-symbols-outlined mb-1">local_shipping</span>
          <span className="font-label text-[10px] font-medium tracking-tight">Deliveries</span>
        </Link>
        <Link to="/settings" className={`flex flex-col items-center justify-center transition-all ${isActive('/settings') ? 'text-[#FFBF00] scale-110' : 'text-[#9C8F78] opacity-60 hover:opacity-100'}`}>
          <span className="material-symbols-outlined mb-1">settings</span>
          <span className="font-label text-[10px] font-medium tracking-tight">Settings</span>
        </Link>
      </div>
    </nav>
  )
}
