import { useToastStore } from '../store/toastStore'
import { X } from 'lucide-react'

/**
 * Renders active toasts above the mobile tab bar (bottom-right on
 * desktop). Success toasts auto-dismiss; each can carry an Undo action
 * and one secondary action. Actions sit on their own row so two of
 * them plus the message still fit a narrow phone without truncating.
 */
export default function ToastStack() {
  const toasts = useToastStore(state => state.toasts)
  const dismiss = useToastStore(state => state.dismiss)

  if (toasts.length === 0) return null

  return (
    <div
      aria-live="polite"
      className="fixed inset-x-4 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] md:inset-x-auto md:right-6 md:bottom-6 z-[60] flex flex-col gap-2 items-center md:items-end pointer-events-none"
    >
      {toasts.map(toast => {
        const hasActions = Boolean(toast.action || toast.onUndo)

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto max-w-md w-full md:w-auto md:min-w-[20rem] bg-surface-container-high shadow-2xl rounded-2xl px-4 py-3 border-l-4 ${
              toast.type === 'error' ? 'border-l-error' : 'border-l-primary-container'
            }`}
          >
            <div className="flex items-start gap-3">
              <p className="flex-1 text-sm text-on-surface">{toast.text}</p>
              <button
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss"
                className="text-outline hover:text-on-surface shrink-0 mt-0.5"
              >
                <X size={16} />
              </button>
            </div>

            {hasActions && (
              <div className="flex justify-end gap-4 mt-2">
                {toast.action && (
                  <button
                    onClick={() => {
                      void toast.action?.run()
                      dismiss(toast.id)
                    }}
                    className="text-outline text-xs font-bold tracking-widest uppercase hover:text-on-surface"
                  >
                    {toast.action.label}
                  </button>
                )}
                {toast.onUndo && (
                  <button
                    onClick={() => {
                      void toast.onUndo?.()
                      dismiss(toast.id)
                    }}
                    className="text-primary-container text-xs font-bold tracking-widest uppercase hover:text-primary"
                  >
                    Undo
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
