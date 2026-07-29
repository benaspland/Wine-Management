import { useEffect, useRef } from 'react'

/**
 * Make the phone's back gesture close an overlay instead of leaving the
 * page.
 *
 * Panels and modals here are component state rather than routes, so
 * Android's back button doesn't see them: it walks the history stack
 * and takes you out of the cellar entirely, losing your scroll position
 * — when what you meant was "close this".
 *
 * One throwaway history entry is kept while any overlay is open. Back
 * consumes it and closes the topmost overlay, re-arming if others are
 * still open beneath. Closing through the UI retracts the entry so the
 * stack never accumulates dead steps.
 *
 * Two things this has to survive:
 *
 * - **Nesting.** A delete confirmation opens on top of the detail
 *   panel, and every open overlay hears the same popstate. They share
 *   one stack so only the topmost closes.
 * - **Remounting.** StrictMode runs effects twice in development
 *   (mount, cleanup, mount). history.back() is asynchronous, so a
 *   naive retract-on-cleanup interleaves with the re-push and eats a
 *   real navigation. The retract is therefore deferred a tick and
 *   cancelled if anything re-opens first.
 */

interface Overlay {
  close: () => void
  /** Set when back removed the entry, so cleanup must not retract it again. */
  dismissedByBack: boolean
}

const stack: Overlay[] = []
let sentinelActive = false
let retractTimer: ReturnType<typeof setTimeout> | null = null
/** True while we are popping our own entry, whose popstate we must ignore. */
let retractingSelf = false

function handlePopState() {
  if (retractingSelf) {
    retractingSelf = false
    return
  }

  // The browser has consumed our entry
  sentinelActive = false

  const top = stack.pop()
  if (top) {
    top.dismissedByBack = true
    top.close()
  }

  if (stack.length > 0) {
    // Overlays remain beneath; arm again for the next back
    ensureSentinel()
  } else {
    window.removeEventListener('popstate', handlePopState)
  }
}

function ensureSentinel() {
  if (retractTimer) {
    clearTimeout(retractTimer)
    retractTimer = null
  }
  if (sentinelActive) return

  window.history.pushState({ overlay: true }, '')
  sentinelActive = true
  window.addEventListener('popstate', handlePopState)
}

function scheduleRetract() {
  if (!sentinelActive || retractTimer) return

  retractTimer = setTimeout(() => {
    retractTimer = null
    // Something re-opened in the meantime (or remounted): keep the entry
    if (stack.length > 0) return

    window.removeEventListener('popstate', handlePopState)
    sentinelActive = false

    // Only if it is still the current entry — navigating away with an
    // overlay open puts a real route on top, and stepping back then
    // would undo that navigation instead
    if (window.history.state?.overlay) {
      retractingSelf = true
      window.history.back()
    }
  }, 0)
}

export function useBackDismiss(isOpen: boolean, onClose: () => void) {
  // Kept in a ref so a caller's inline arrow function does not retrigger
  // the effect and push a second entry on every render. Assigned in an
  // effect rather than during render; it is only read once popstate
  // fires, long after commit.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!isOpen) return

    const overlay: Overlay = {
      close: () => onCloseRef.current(),
      dismissedByBack: false,
    }
    stack.push(overlay)
    ensureSentinel()

    return () => {
      const index = stack.indexOf(overlay)
      if (index !== -1) stack.splice(index, 1)
      if (stack.length === 0) scheduleRetract()
    }
  }, [isOpen])
}
