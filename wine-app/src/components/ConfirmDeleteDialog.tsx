import { useState } from 'react'
import Modal from './Modal'
import HoldButton from './HoldButton'
import { TriangleAlert } from 'lucide-react'

/**
 * Confirmation for deletes that cannot be undone.
 *
 * The confirmation step itself is deliberate — it names what is about
 * to be lost — and the commit is a press-and-hold rather than a tap.
 * A tap is the same gesture used everywhere else in the app, so on a
 * phone it can be spent before the eye has read the dialog; a hold
 * cannot be given accidentally.
 */

interface ConfirmDeleteDialogProps {
  isOpen: boolean
  onClose: () => void
  title: string
  /** What will be destroyed, in the user's terms. */
  message: string
  /** Optional detail line, e.g. counts or what survives. */
  detail?: string
  confirmLabel: string
  onConfirm: () => Promise<void>
}

const HOLD_MS = 900

export default function ConfirmDeleteDialog({
  isOpen,
  onClose,
  title,
  message,
  detail,
  confirmLabel,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [hint, setHint] = useState(false)

  const handleConfirm = async () => {
    setIsDeleting(true)
    try {
      await onConfirm()
      onClose()
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="space-y-5">
        <div className="flex gap-3">
          <TriangleAlert size={20} className="text-error shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-2">
            <p className="text-sm text-on-surface">{message}</p>
            {detail && <p className="text-sm text-outline">{detail}</p>}
          </div>
        </div>

        <p aria-live="polite" className="text-xs text-outline text-center">
          {hint ? 'Keep holding to confirm' : 'Press and hold to confirm'}
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 border border-outline-variant text-outline-variant hover:text-outline py-3 text-xs tracking-widest uppercase font-bold rounded-full disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <HoldButton
            // A tap is not enough here; say so rather than doing nothing
            onTap={() => setHint(true)}
            onHold={() => void handleConfirm()}
            durationMs={HOLD_MS}
            progressStyle="fill"
            progressColor="rgba(255, 180, 171, 0.35)"
            disabled={isDeleting}
            aria-label={confirmLabel}
            className="flex-1 border border-error/40 text-error py-3 text-xs tracking-widest uppercase font-bold rounded-full disabled:opacity-50 transition-colors"
          >
            {isDeleting ? 'Deleting...' : confirmLabel}
          </HoldButton>
        </div>
      </div>
    </Modal>
  )
}
