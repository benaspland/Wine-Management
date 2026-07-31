import { useRef, useState } from 'react'
import { Camera, Trash2, RefreshCw, Link2 } from 'lucide-react'
import { fileToStoredImage } from '../services/image.service'

interface WineImagePickerProps {
  imageUrl: string
  onImageChange: (url: string) => void
}

/**
 * Bottle-photo field.
 *
 * Previously a full-width button, then a loose thumbnail floating beside
 * a red text link, then a disclosure triangle for a URL — three
 * different shapes for one idea. It is now a single tile that shows the
 * state it is in: an empty frame that invites a photo, or the photo
 * itself with its actions tucked underneath.
 *
 * Photographs of your own bottles are the point here, so the camera
 * leads and pasting a link stays a quieter fallback.
 */
export default function WineImagePicker({ imageUrl, onImageChange }: WineImagePickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showUrl, setShowUrl] = useState(false)

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setWorking(true)
    setError(null)
    try {
      onImageChange(await fileToStoredImage(file))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setWorking(false)
      // Allow re-picking the same file after a removal
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const pick = () => fileInputRef.current?.click()

  return (
    <div>
      <label className="block text-sm font-medium text-on-surface mb-1">Bottle Photo</label>

      {/* No capture attribute: Android then offers camera *and* gallery,
          so an existing photo works as well as a fresh one */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
        data-testid="wine-photo-input"
      />

      {imageUrl ? (
        <div className="flex items-start gap-3">
          <img
            src={imageUrl}
            alt="Bottle"
            className="h-28 w-24 object-cover rounded-xl border border-outline-variant shrink-0"
            onError={e => {
              ;(e.target as HTMLImageElement).style.display = 'none'
            }}
          />
          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={pick}
              disabled={working}
              className="flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-outline hover:text-on-surface disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={14} aria-hidden="true" />
              {working ? 'Processing...' : 'Replace'}
            </button>
            <button
              type="button"
              onClick={() => onImageChange('')}
              className="flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-error hover:opacity-80 transition-opacity"
            >
              <Trash2 size={14} aria-hidden="true" />
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={pick}
          disabled={working}
          className="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-xl border border-dashed border-outline-variant/30 text-outline hover:text-on-surface hover:border-outline-variant/60 disabled:opacity-50 transition-colors"
        >
          <Camera size={22} aria-hidden="true" />
          <span className="text-xs font-bold tracking-widest uppercase">
            {working ? 'Processing...' : 'Take or Choose Photo'}
          </span>
          <span className="text-xs text-outline-variant normal-case tracking-normal font-normal">
            Stored on this device — works offline
          </span>
        </button>
      )}

      {error && (
        <p role="alert" className="text-xs text-error mt-2">
          {error}
        </p>
      )}

      {/* A linked image is the exception, so it stays out of the way */}
      {showUrl ? (
        <div className="mt-3">
          <input
            type="text"
            name="image_url"
            value={imageUrl.startsWith('data:') ? '' : imageUrl}
            onChange={e => onImageChange(e.target.value)}
            placeholder="https://..."
            className="w-full bg-surface-container-low text-on-surface px-3 py-2 rounded-lg border border-outline-variant focus:outline-none focus:border-primary text-sm"
          />
          <p className="text-xs text-outline mt-1">
            A linked image needs a connection, and disappears if the site removes it.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowUrl(true)}
          className="flex items-center gap-1.5 mt-2 text-xs text-outline hover:text-on-surface-variant transition-colors"
        >
          <Link2 size={12} aria-hidden="true" />
          Use an image URL instead
        </button>
      )}
    </div>
  )
}
