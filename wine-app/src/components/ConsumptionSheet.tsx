import { useState } from 'react'
import Modal from './Modal'
import {
  CONSUMPTION_REASONS,
  DEFAULT_REASON,
  REASON_ORDER,
  reasonOf,
  type ConsumptionReason,
} from '../services/consumptionReason.service'

/**
 * Log or amend a consumption: when the bottle was actually drunk, and
 * what it was like. Reached by holding the consume button (to log a
 * bottle late), or from the toast / consumption history afterwards —
 * because the tasting note is something you write after the glass, not
 * at the moment you tap.
 */

interface ConsumptionSheetProps {
  isOpen: boolean
  onClose: () => void
  /** Wine label for the heading, e.g. "Chateau Meyney 2019". */
  wineLabel: string
  initialDate: string
  initialNotes?: string
  initialReason?: string
  /** Amending an existing entry rather than logging a new bottle. */
  isAmendment?: boolean
  onSubmit: (values: {
    consumedDate: string
    notes: string
    reason: ConsumptionReason
  }) => Promise<void>
}

export default function ConsumptionSheet({
  isOpen,
  onClose,
  wineLabel,
  initialDate,
  initialNotes,
  initialReason,
  isAmendment,
  onSubmit,
}: ConsumptionSheetProps) {
  const [consumedDate, setConsumedDate] = useState(initialDate)
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [reason, setReason] = useState<ConsumptionReason>(
    initialReason ? reasonOf(initialReason) : DEFAULT_REASON
  )
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const today = new Date().toISOString().split('T')[0]

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsSaving(true)
    setError(null)
    try {
      await onSubmit({ consumedDate, notes, reason })
      onClose()
    } catch (err) {
      // Stay open so the date can be corrected rather than retyped
      setError((err as Error).message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isAmendment ? 'Edit Entry' : 'Log a Bottle'}
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <p className="text-sm text-outline">{wineLabel}</p>

        {/* Reason first: it names what the date and the note are about,
            and a bottle given away is not a tasting. */}
        <div>
          <label htmlFor="consumed-reason" className="block text-sm font-medium text-on-surface mb-1">
            Reason
          </label>
          <select
            id="consumed-reason"
            value={reason}
            onChange={e => setReason(e.target.value as ConsumptionReason)}
            className="field"
          >
            {REASON_ORDER.map(key => (
              <option key={key} value={key}>
                {CONSUMPTION_REASONS[key].label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="consumed-date" className="block text-sm font-medium text-on-surface mb-1">
            {reason === 'drank' ? 'Date drunk' : 'Date'}
          </label>
          <input
            id="consumed-date"
            type="date"
            value={consumedDate}
            max={today}
            onChange={e => setConsumedDate(e.target.value)}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="tasting-note" className="block text-sm font-medium text-on-surface mb-1">
            {reason === 'drank' ? 'Tasting note' : 'Note'}{' '}
            <span className="text-outline font-normal">(optional)</span>
          </label>
          <textarea
            id="tasting-note"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={4}
            placeholder={
              reason === 'drank' ? 'How was it? Who was it with?' : 'Anything worth remembering?'
            }
            className="field resize-none"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 border border-outline-variant text-outline-variant hover:text-outline py-3 text-xs tracking-widest uppercase font-bold rounded-full disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button type="submit" disabled={isSaving} className="flex-1 btn-primary disabled:opacity-50">
            {isSaving ? 'Saving...' : isAmendment ? 'Save' : 'Log Bottle'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
