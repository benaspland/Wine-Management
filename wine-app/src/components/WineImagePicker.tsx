import { useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { fileToStoredImage } from '../services/image.service'

interface WineImagePickerProps {
  imageUrl: string
  onImageChange: (url: string) => void
}

/**
 * Bottle-image field for the wine form. Photographs of your own bottles
 * are the point here — stock photography can't know what a specific
 * producer and vintage look like — so the camera leads and the URL box
 * is kept as a quieter fallback for pasting a merchant's image.
 */
export default function WineImagePicker({ imageUrl, onImageChange }: WineImagePickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div className="space-y-2">
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

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={working}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-surface-container-high text-on-surface-variant hover:bg-primary-container hover:text-on-primary disabled:opacity-50 transition-colors text-xs font-bold tracking-widest uppercase"
      >
        <Camera size={16} aria-hidden="true" />
        {working ? 'Processing...' : imageUrl ? 'Replace Photo' : 'Take or Choose Photo'}
      </button>

      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}

      {imageUrl && (
        <div className="flex items-center gap-3 mt-2">
          <img
            src={imageUrl}
            alt="Bottle"
            className="h-20 w-auto object-contain rounded-lg border border-outline-variant/20"
            onError={e => {
              ;(e.target as HTMLImageElement).style.display = 'none'
            }}
          />
          <button
            type="button"
            onClick={() => onImageChange('')}
            className="text-xs text-error hover:opacity-80"
          >
            Remove
          </button>
        </div>
      )}

      <details className="pt-1">
        <summary className="cursor-pointer text-xs text-outline hover:text-on-surface-variant">
          or paste an image URL
        </summary>
        <input
          type="text"
          name="image_url"
          value={imageUrl.startsWith('data:') ? '' : imageUrl}
          onChange={e => onImageChange(e.target.value)}
          placeholder="https://..."
          className="mt-2 w-full bg-surface-container-low text-on-surface px-3 py-2 rounded-lg border border-outline-variant/20 focus:outline-none focus:border-primary text-sm"
        />
        <p className="text-xs text-outline mt-1">
          A linked image needs a connection to display, and disappears if the site removes it.
        </p>
      </details>
    </div>
  )
}
