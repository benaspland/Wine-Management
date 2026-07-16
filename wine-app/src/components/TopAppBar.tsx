import { Link, useLocation } from 'react-router-dom'

const NAV_LINKS = [
  { to: '/', label: 'Overview' },
  { to: '/cellar', label: 'Cellar' },
  { to: '/schedule', label: 'Schedule' },
  { to: '/deliveries', label: 'Deliveries' },
  { to: '/settings', label: 'Settings' },
]

export default function TopAppBar() {
  const location = useLocation()

  return (
    <header className="fixed top-0 w-full z-50 bg-[#131313]/70 backdrop-blur-xl shadow-[0_40px_40px_rgba(251,188,0,0.08)]">
      <div className="flex justify-between items-center px-6 h-16">
        <h1 className="font-headline font-bold tracking-[0.2em] uppercase text-xl text-on-surface">
          THE CELLAR
        </h1>
        <nav className="hidden md:flex gap-8">
          {NAV_LINKS.map(link => (
            <Link
              key={link.to}
              to={link.to}
              className={`font-medium transition-colors hover:text-[#FFE2AB] ${
                location.pathname === link.to ? 'text-[#FFBF00]' : 'text-[#9C8F78]'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
