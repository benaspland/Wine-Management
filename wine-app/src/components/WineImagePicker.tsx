import { useWineImageSearch } from '../hooks/useWineImageSearch'
import { Search } from 'lucide-react'

interface WineImagePickerProps {
  imageUrl: string
  onImageChange: (url: string) => void
  /** Fields used to build the search query */
  producer: string
  wineName: string
  vintage?: number
}

/**
 * Bottle-image field for the wine form: manual URL entry, web search
 * via the image worker, thumbnail picker, and preview with remove.
 */
export default function WineImagePicker({
  imageUrl,
  onImageChange,
  producer,
  wineName,
  vintage,
}: WineImagePickerProps) {
  const { results, searching, pickerOpen, search, closePicker } = useWineImageSearch()

  const handleSearch = () => {
    if (!producer && !wineName) {
      alert('Enter a producer or wine name first')
      return
    }
    search(producer, wineName, vintage)
  }

  const handleSelect = (url: string) => {
    onImageChange(url)
    closePicker()
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-on-surface mb-1">Bottle Image</label>
      <div className="flex gap-2">
        <input
          type="text"
          name="image_url"
          value={imageUrl}
          onChange={(e) => onImageChange(e.target.value)}
          placeholder="Image URL or search..."
          className="flex-1 bg-surface-container-low text-on-surface px-3 py-2 rounded border border-outline-variant/20 focus:outline-none focus:border-primary text-sm"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={searching}
          className="px-3 py-2 bg-primary-container text-on-primary rounded hover:bg-primary transition-colors disabled:opacity-50 flex items-center gap-1"
        >
          <Search size={16} aria-hidden="true" />
          {searching ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Image preview */}
      {imageUrl && (
        <div className="flex items-center gap-3 mt-2">
          <img
            src={imageUrl}
            alt="Wine bottle"
            className="h-20 w-auto object-contain rounded border border-outline-variant/20"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <button
            type="button"
            onClick={() => onImageChange('')}
            className="text-xs text-red-400 hover:text-red-300"
          >
            Remove
          </button>
        </div>
      )}

      {/* Image picker grid */}
      {pickerOpen && (
        <div className="mt-2 p-3 bg-surface-container-low rounded border border-outline-variant/20">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-outline uppercase tracking-wider">Select an image</span>
            <button
              type="button"
              onClick={closePicker}
              className="text-outline hover:text-on-surface text-sm"
            >
              Close
            </button>
          </div>
          {searching ? (
            <p className="text-sm text-outline py-4 text-center">Searching for images...</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-outline py-4 text-center">No images found</p>
          ) : (
            <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
              {results.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelect(img.url)}
                  className="relative group border border-outline-variant/20 rounded overflow-hidden hover:border-primary transition-colors aspect-square"
                >
                  <img
                    src={img.thumbnail}
                    alt={img.title}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
