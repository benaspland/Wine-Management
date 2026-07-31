import { create } from 'zustand'

/**
 * Non-blocking feedback for successful actions (consume, promote,
 * delivery confirmed...). Blocking modals stay reserved for errors that
 * need acknowledgment.
 */

export interface ToastAction {
  label: string
  run: () => void | Promise<void>
}

export interface Toast {
  id: number
  type: 'success' | 'error'
  text: string
  /** Optional undo action; rendered as an "Undo" button on the toast. */
  onUndo?: () => void | Promise<void>
  /**
   * Secondary action shown before Undo — e.g. "Add note" after logging
   * a bottle. A plain tap like Undo: nothing on a toast is hidden
   * behind a gesture, since the toast itself is already time-limited.
   */
  action?: ToastAction
  /**
   * Stays until acted on. Reserved for the few messages that are worth
   * more than five seconds — a waiting app update is the case this
   * exists for: it is useless if it disappears before it is read.
   */
  persistent?: boolean
}

interface ToastState {
  toasts: Toast[]
  show: (
    text: string,
    options?: {
      type?: 'success' | 'error'
      onUndo?: Toast['onUndo']
      action?: ToastAction
      persistent?: boolean
    }
  ) => void
  dismiss: (id: number) => void
}

const AUTO_DISMISS_MS = 5000
let nextId = 1

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  show: (text, options) => {
    const toast: Toast = {
      id: nextId++,
      type: options?.type ?? 'success',
      text,
      onUndo: options?.onUndo,
      action: options?.action,
      persistent: options?.persistent,
    }
    set(state => ({ toasts: [...state.toasts, toast] }))
    if (!toast.persistent) {
      setTimeout(() => get().dismiss(toast.id), AUTO_DISMISS_MS)
    }
  },

  dismiss: (id) => {
    set(state => ({ toasts: state.toasts.filter(t => t.id !== id) }))
  },
}))
