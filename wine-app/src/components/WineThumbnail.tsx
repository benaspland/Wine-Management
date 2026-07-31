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

interface SizeSpec {
  box: string
  /**
   * Whether a photo may be cropped to fill the slot.
   *
   * Only at 44px, where a label is far too small to read and a centred
   * crop still works as a marker. Anywhere you could actually read the
   * label, cropping takes the producer's name off it — a portrait label
   * in a narrow slot lost its left and right thirds, so Wagner-Stempel
   * read "NER STE".
   */
  crop: boolean
}

const SIZES = {
  sm: { box: 'h-11 w-11 rounded-[10px]', crop: true },
  /**
   * Stretches to whatever the text beside it needs, with a floor. A
   * fixed height would set the card's height too, so a wine with no
   * cuvee and no classification got a card sized for text it does not
   * have, and a void beside the thumbnail.
   */
  /* 84px, measured: at 92 the narrower text column tips names onto a
     second line and every card grows 21px, while 84 buys a tenth more
     label width for nothing. */
  md: { box: 'self-stretch min-h-[92px] w-[84px] rounded-[10px]', crop: false },
  lg: { box: 'h-[230px] w-[176px] rounded-[14px]', crop: false },
} as const satisfies Record<string, SizeSpec>

interface WineThumbnailProps {
  wine: Pick<Wine, 'image_url' | 'wine_type' | 'producer' | 'name'>
  size?: keyof typeof SIZES
  className?: string
}

export default function WineThumbnail({ wine, size = 'sm', className = '' }: WineThumbnailProps) {
  const token = TYPE_TINT[wine.wine_type ?? 'Red'] ?? '--wine-red'
  const { box, crop } = SIZES[size]
  const frame = `${box} shrink-0 overflow-hidden border border-outline-variant ${className}`

  if (wine.image_url && crop) {
    return (
      <img
        src={wine.image_url}
        alt={wineDisplayName(wine.producer, wine.name)}
        loading="lazy"
        decoding="async"
        className={`${frame} object-cover bg-surface-container-highest`}
      />
    )
  }

  if (wine.image_url) {
    return (
      /* Whole label, letterboxed against a blurred copy of itself. A
         portrait photo in this slot leaves real space above and below,
         and a flat panel there reads as a hole; the blurred backdrop
         fills it with something derived from the wine itself. */
      <div className={`${frame} relative bg-surface-container-highest`}>
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center scale-125 blur-lg opacity-40"
          style={{ backgroundImage: `url("${wine.image_url}")` }}
        />
        <img
          src={wine.image_url}
          alt={wineDisplayName(wine.producer, wine.name)}
          loading="lazy"
          decoding="async"
          className="relative h-full w-full object-contain"
        />
      </div>
    )
  }

  return (
    <div
      aria-hidden="true"
      className={frame}
      style={{
        backgroundImage: `linear-gradient(145deg, rgb(var(${token}) / 0.85), rgb(var(${token}) / 0.18))`,
      }}
    />
  )
}
