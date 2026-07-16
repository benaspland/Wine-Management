import { create } from 'zustand'

/**
 * Non-blocking feedback for successful actions (consume, promote,
 * delivery confirmed...). Blocking modals stay reserved for errors that
 * need acknowledgment.
 */

export interface Toast {
  id: number
  type: 'success' | 'error'
  text: string
  /** Optional undo action; rendered as an "Undo" button on the toast. */
  onUndo?: () => void | Promise<void>
}

interface ToastState {
  toasts: Toast[]
  show: (text: string, options?: { type?: 'success' | 'error'; onUndo?: Toast['onUndo'] }) => void
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
    }
    set(state => ({ toasts: [...state.toasts, toast] }))
    setTimeout(() => get().dismiss(toast.id), AUTO_DISMISS_MS)
  },

  dismiss: (id) => {
    set(state => ({ toasts: state.toasts.filter(t => t.id !== id) }))
  },
}))
