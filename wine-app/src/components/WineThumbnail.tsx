import type { Wine } from '../types/index'
import { wineDisplayName } from '../services/wine.service'

/**
 * The thumbnail slot every wine gets, photo or not.
 *
 * One of 125 wines in this collection has a label photo, so making the
 * slot conditional meant 124 rows with a hole where the 125th had an
 * image — the row's shape announcing which records happen to be
 * complete. The slot is always there; without a photo it holds a
 * gradient in the wine's own colour, which is at least true about the
 * wine rather than a generic bottle icon repeated 124 times.
 */

const TYPE_TINT: Record<string, string> = {
  Red: '--wine-red',
  White: '--wine-white',
  'Rosé': '--wine-rose',
  Sparkling: '--wine-sparkling',
  Fortified: '--wine-fortified',
}

const SIZES = {
  sm: 'h-11 w-11 rounded-[10px]',
  lg: 'h-40 w-32 rounded-[14px]',
} as const

interface WineThumbnailProps {
  wine: Pick<Wine, 'image_url' | 'wine_type' | 'producer' | 'name'>
  size?: keyof typeof SIZES
  className?: string
}

export default function WineThumbnail({ wine, size = 'sm', className = '' }: WineThumbnailProps) {
  const token = TYPE_TINT[wine.wine_type ?? 'Red'] ?? '--wine-red'
  const box = `${SIZES[size]} shrink-0 overflow-hidden border border-outline-variant ${className}`

  if (wine.image_url) {
    return (
      <img
        src={wine.image_url}
        alt={wineDisplayName(wine.producer, wine.name)}
        loading="lazy"
        decoding="async"
        className={`${box} object-cover bg-surface-container-highest`}
      />
    )
  }

  return (
    <div
      aria-hidden="true"
      className={box}
      style={{
        backgroundImage: `linear-gradient(145deg, rgb(var(${token}) / 0.85), rgb(var(${token}) / 0.18))`,
      }}
    />
  )
}
