import { useState, useEffect } from 'react'

/**
 * Hook to detect media query matches
 * @param query - CSS media query string (e.g., '(min-width: 768px)')
 * @returns boolean indicating if query matches
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    // Try to get initial value during render (for SSR compatibility)
    if (typeof window === 'undefined') {
      return false
    }
    try {
      return window.matchMedia(query).matches
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const mediaQuery = window.matchMedia(query)

    // Ensure state is set correctly on mount
    setMatches(mediaQuery.matches)

    // Handle changes
    const handleChange = (e: MediaQueryListEvent) => {
      setMatches(e.matches)
    }

    // Modern API
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(handleChange)
      return () => mediaQuery.removeListener(handleChange)
    }
  }, [query])

  return matches
}

/**
 * Check if viewport is at least tablet size (md breakpoint: 768px)
 */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 768px)')
}

/**
 * Check if viewport is mobile (below md breakpoint: 768px)
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)')
}
