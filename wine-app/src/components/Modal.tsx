import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { useBackDismiss } from '../hooks/useBackDismiss'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

export default function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  // The phone's back gesture should close the dialog, not leave the page
  useBackDismiss(isOpen, onClose)

  if (!isOpen) return null

  const sizeClass =
    size === 'sm' ? 'max-w-sm' :
    size === 'lg' ? 'max-w-2xl' :
    'max-w-md'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className={`bg-surface rounded-2xl shadow-2xl w-full ${sizeClass} max-h-[90vh] overflow-y-auto`}>
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-outline-variant/10 sticky top-0 bg-surface z-10">
          <h2 className="font-headline text-2xl font-bold text-on-surface">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-outline-variant hover:text-on-surface transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
