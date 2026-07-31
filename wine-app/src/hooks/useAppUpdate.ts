import { useEffect, useRef } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { useToastStore } from '../store/toastStore'

/**
 * Tells you when a new build is waiting, and reloads into it on a tap.
 *
 * Without this the app is precached by its service worker and keeps
 * serving the version it already has: the new worker installs quietly
 * in the background, and only the *next* launch picks up the new
 * assets. So a deploy appears not to have happened, and the fix is to
 * close the app entirely and open it twice — which nobody would guess.
 *
 * The toast is persistent because a five-second window for a message
 * about a waiting update is no window at all.
 */
export function useAppUpdate() {
  const show = useToastStore(state => state.show)
  // Registration is global and must happen once, not per StrictMode pass
  const registered = useRef(false)

  useEffect(() => {
    if (registered.current) return
    registered.current = true

    const updateSW = registerSW({
      onNeedRefresh() {
        show('A new version is ready', {
          persistent: true,
          action: {
            label: 'Reload',
            // true: activate the waiting worker, then reload into it
            run: () => updateSW(true),
          },
        })
      },
    })
  }, [show])
}
