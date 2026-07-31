import { Link, useLocation } from 'react-router-dom'

const NAV_LINKS = [
  { to: '/', label: 'Overview' },
  { to: '/cellar', label: 'Cellar' },
  { to: '/schedule', label: 'Schedule' },
  { to: '/deliveries', label: 'Deliveries' },
  { to: '/settings', label: 'Settings' },
]

/**
 * Desktop only.
 *
 * On a phone this bar carried nothing but the wordmark — the nav links
 * are hidden below md, where the bottom bar does the navigating — so it
 * spent 64px of a 915px screen telling you the name of an app you had
 * already opened. Above md it is the only navigation there is, so it
 * stays.
 */
export default function TopAppBar() {
  const location = useLocation()

  return (
    <header className="hidden md:block fixed top-0 w-full z-50 bg-surface-container-lowest/70 backdrop-blur-xl border-b border-outline-variant/40">
      <div className="flex justify-between items-center px-6 h-16">
        <h1 className="font-headline font-bold tracking-[0.2em] uppercase text-xl text-on-surface">
          THE CELLAR
        </h1>
        <nav className="flex gap-8">
          {NAV_LINKS.map(link => (
            <Link
              key={link.to}
              to={link.to}
              className={`font-medium transition-colors hover:text-primary ${
                location.pathname === link.to ? 'text-primary-container' : 'text-outline'
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
