import { Link } from 'react-router-dom'

export default function TopAppBar() {
  return (
    <header className="fixed top-0 w-full z-50 bg-[#131313]/70 backdrop-blur-xl shadow-[0_40px_40px_rgba(251,188,0,0.08)]">
      <div className="flex justify-between items-center px-6 h-16">
        <div className="flex items-center gap-4">
          <span className="material-symbols-outlined text-[#FFBF00] cursor-pointer active:scale-95 duration-200">menu</span>
          <h1 className="font-headline font-bold tracking-[0.2em] uppercase text-xl text-on-surface">THE CELLAR</h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="hidden md:flex gap-8">
            <Link to="/" className="text-[#FFBF00] font-medium transition-colors hover:text-[#FFE2AB]">Cellar</Link>
            <Link to="/schedule" className="text-[#9C8F78] font-medium transition-colors hover:text-[#FFE2AB]">Schedule</Link>
            <Link to="/deliveries" className="text-[#9C8F78] font-medium transition-colors hover:text-[#FFE2AB]">Deliveries</Link>
          </div>
          <div className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center overflow-hidden border border-outline-variant/30">
            <span className="text-2xl">👤</span>
          </div>
        </div>
      </div>
    </header>
  )
}
