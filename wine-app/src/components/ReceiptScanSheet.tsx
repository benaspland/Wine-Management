import { useRef, useState } from 'react'
import Modal from './Modal'
import { fileToScanImage, UnsupportedImageError } from '../services/image.service'
import { scanPurchase, type ScannedWine } from '../services/receiptScan.service'
import { describeFailure } from '../services/claudeClient.service'
import { hasApiKey } from '../services/aiSettings.service'
import { Camera, TriangleAlert, Check } from 'lucide-react'

/**
 * Add several wines at once by photographing what you bought.
 *
 * A screenshot of a merchant's confirmation email, an invoice, a list
 * from a shop. It is the one route into the app that can fill what it
 * cost, when, and from whom — facts about a transaction, which no
 * amount of research about the wine itself could ever supply.
 *
 * Nothing is added until the list has been looked at. A picture read is
 * still a picture read: the point of the review step is that a misread
 * price is caught by the person who paid it, in the moment they can
 * still remember what it was.
 */

interface ReceiptScanSheetProps {
  isOpen: boolean
  onClose: () => void
  /** Adds the chosen lines; resolves when they are all saved. */
  onAdd: (wines: ScannedWine[]) => Promise<void>
}

type State =
  | { status: 'idle' }
  | { status: 'reading' }
  | { status: 'review'; wines: ScannedWine[]; chosen: boolean[] }
  | { status: 'nothing'; reason: string }
  | { status: 'error'; message: string }

export default function ReceiptScanSheet({ isOpen, onClose, onAdd }: ReceiptScanSheetProps) {
  const [state, setState] = useState<State>({ status: 'idle' })
  const [isAdding, setIsAdding] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Cleared so picking the same picture twice still fires a change
    event.target.value = ''
    if (!file) return

    setState({ status: 'reading' })
    try {
      const image = await fileToScanImage(file)
      const result = await scanPurchase(image)
      if (result.status === 'not_found') {
        setState({ status: 'nothing', reason: result.reason })
        return
      }
      setState({
        status: 'review',
        wines: result.wines,
        chosen: result.wines.map(() => true),
      })
    } catch (error) {
      setState({
        status: 'error',
        message:
          error instanceof UnsupportedImageError
            ? error.message
            : describeFailure(error),
      })
    }
  }

  const handleAdd = async () => {
    if (state.status !== 'review') return
    const picked = state.wines.filter((_, i) => state.chosen[i])
    if (picked.length === 0) return

    setIsAdding(true)
    try {
      await onAdd(picked)
      onClose()
      setState({ status: 'idle' })
    } catch (error) {
      setState({ status: 'error', message: (error as Error).message })
    } finally {
      setIsAdding(false)
    }
  }

  const close = () => {
    onClose()
    setState({ status: 'idle' })
  }

  const chosenCount = state.status === 'review' ? state.chosen.filter(Boolean).length : 0

  return (
    <Modal isOpen={isOpen} onClose={close} title="Add from a photo" size="sm">
      <div className="space-y-5">
        {/* capture="environment" opens the camera straight away for an
            invoice in front of you; the gallery is still one tap away,
            which is where an emailed confirmation will have been
            screenshotted to. */}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          onChange={handleFile}
          className="hidden"
        />

        {state.status === 'idle' && (
          <>
            <p className="text-sm text-outline">
              Photograph an invoice, or pick a screenshot of a confirmation
              email. Claude reads the wines and what you paid, and you check
              them before anything is added.
            </p>
            {!hasApiKey() ? (
              <p className="text-sm text-warning">
                Add a Claude API key in Settings to use this.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                <Camera size={16} aria-hidden="true" />
                Choose a picture
              </button>
            )}
          </>
        )}

        {state.status === 'reading' && (
          <p className="text-sm text-outline py-6 text-center">
            Reading the picture...
          </p>
        )}

        {state.status === 'review' && (
          <>
            <p className="text-sm text-outline">
              {state.wines.length === 1
                ? 'One wine found. Check it before adding.'
                : `${state.wines.length} wines found. Untick anything you do not want.`}
            </p>

            <ul className="space-y-2 max-h-[45vh] overflow-y-auto">
              {state.wines.map((wine, index) => (
                <li key={`${wine.producer}-${wine.name}-${wine.vintage}-${index}`}>
                  <label className="panel panel-sunken flex items-start gap-3 p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={state.chosen[index]}
                      onChange={e =>
                        setState({
                          ...state,
                          chosen: state.chosen.map((on, i) =>
                            i === index ? e.target.checked : on
                          ),
                        })
                      }
                      className="mt-1 h-4 w-4 shrink-0 accent-[rgb(var(--accent))]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-on-surface">
                        {[wine.producer, wine.name].filter(Boolean).join(' ')}
                      </span>
                      <span className="block text-xs text-outline mt-0.5">
                        {wine.vintage} · {wine.quantity} × {wine.format}
                        {wine.purchase_price !== undefined &&
                          ` · £${wine.purchase_price.toFixed(2)} each`}
                      </span>
                      {/* Named, because a field the reader could not
                          trust is the most important thing on the line:
                          it is where the picture and the record are
                          most likely to disagree. */}
                      {wine.rejected.length > 0 && (
                        <span className="mt-1 flex items-start gap-1 text-xs text-warning">
                          <TriangleAlert size={11} className="mt-0.5 shrink-0" aria-hidden="true" />
                          <span>
                            Could not read the {wine.rejected.join(' or ')} — check it after
                            adding.
                          </span>
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>

            {(state.wines[0]?.merchant || state.wines[0]?.purchase_date) && (
              <p className="text-xs text-outline">
                Recorded against{' '}
                {[state.wines[0].merchant, state.wines[0].purchase_date]
                  .filter(Boolean)
                  .join(', ')}
                .
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={close}
                disabled={isAdding}
                className="flex-1 border border-outline-variant text-outline-variant hover:text-outline py-3 text-xs tracking-widest uppercase font-bold rounded-full disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={isAdding || chosenCount === 0}
                className="flex-1 btn-primary flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <Check size={15} aria-hidden="true" />
                {isAdding
                  ? 'Adding...'
                  : `Add ${chosenCount} ${chosenCount === 1 ? 'wine' : 'wines'}`}
              </button>
            </div>
          </>
        )}

        {state.status === 'nothing' && (
          <>
            <p className="flex items-start gap-2 text-sm text-warning">
              <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{state.reason}</span>
            </p>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="btn-secondary w-full"
            >
              Try another picture
            </button>
          </>
        )}

        {state.status === 'error' && (
          <>
            <p role="alert" className="text-sm text-error">
              {state.message}
            </p>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="btn-secondary w-full"
            >
              Try again
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}
