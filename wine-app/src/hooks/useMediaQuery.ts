import { useSyncExternalStore } from 'react'

/**
 * Reactively track a CSS media query. Built on useSyncExternalStore so
 * the subscription and the snapshot stay in sync without any effects.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === 'undefined') return () => {}
      const mediaQuery = window.matchMedia(query)
      mediaQuery.addEventListener('change', onStoreChange)
      return () => mediaQuery.removeEventListener('change', onStoreChange)
    },
    () => (typeof window === 'undefined' ? false : window.matchMedia(query).matches),
    () => false
  )
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
