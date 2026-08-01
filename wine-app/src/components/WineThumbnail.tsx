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
  // No border and no fill of its own: a framed box with a lighter
  // backing read as a label mounted in a mat. Sitting on the card's own
  // colour, what you see is the label.
  const frame = `${box} shrink-0 overflow-hidden ${className}`

  if (wine.image_url && crop) {
    return (
      <img
        src={wine.image_url}
        alt={wineDisplayName(wine.producer, wine.name)}
        loading="lazy"
        decoding="async"
        className={`${frame} object-cover`}
      />
    )
  }

  if (wine.image_url) {
    return (
      /* The whole label, sitting on the card rather than inside
         anything. A blurred copy of the photo used to fill the space a
         portrait label leaves above and below, which made the slot a
         visible grey panel; leaving that space as the card's own colour
         means the only thing on screen is the label. The shadow is what
         keeps it from reading as pasted flat.

         The image is positioned rather than laid out, so that its own
         proportions cannot set the slot's height. In the flow, a tall
         narrow label made its card 32px taller than the text needed and
         the bottom row fell away from the rest — so the spacing of the
         last line depended on the shape of a photograph. Now the text
         decides the height and the label fits itself into it. */
      <div className={`${frame} relative`}>
        <img
          src={wine.image_url}
          alt={wineDisplayName(wine.producer, wine.name)}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-contain rounded-[6px] drop-shadow-[0_6px_16px_rgba(0,0,0,0.5)]"
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
