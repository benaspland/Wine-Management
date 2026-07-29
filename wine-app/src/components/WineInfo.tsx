/**
 * The fields WineInfo renders. Structural on purpose: both full Wine
 * records and lightweight display objects (e.g. schedule entries)
 * satisfy it.
 */
interface WineDisplayFields {
  producer?: string
  name?: string
  country?: string
  region?: string
  classification?: string
}

interface WineInfoProps {
  wine: WineDisplayFields
  producerSize?: 'sm' | 'base' | 'lg' | 'xl' | '2xl' // Tailwind text sizes
  nameSize?: 'sm' | 'base' | 'lg'
  classificationSize?: 'xs' | 'sm'
  showClassification?: boolean
  /**
   * Set false where the second line adds nothing — a compact card whose
   * region line already carries the appellation, for instance.
   */
  showName?: boolean
  layout?: 'vertical' | 'inline' // vertical = separate lines, inline = same line
}

/**
 * Reusable component for displaying wine information consistently across all screens
 * Handles regional variations (Bordeaux, Burgundy, etc.)
 */
export default function WineInfo({
  wine,
  producerSize = 'lg',
  nameSize = 'base',
  classificationSize = 'sm',
  showClassification = true,
  showName = true,
  layout = 'vertical',
}: WineInfoProps) {
  const sizeMap = {
    xs: 'text-xs',
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
    '2xl': 'text-2xl',
  }

  // Skip the name line when it adds nothing: empty, or already the tail of
  // the producer (château-style wines where the importer derives one from
  // the other — showing both reads as a stutter).
  const producerLower = (wine.producer ?? '').trim().toLowerCase()
  const nameLower = (wine.name ?? '').trim().toLowerCase()
  const shouldHideName = !showName || !nameLower || producerLower.endsWith(nameLower)

  if (layout === 'inline') {
    return (
      <div className="flex items-baseline gap-2">
        <h3 className={`${sizeMap[producerSize]} font-medium text-on-surface`}>
          {wine.producer}
        </h3>
        {!shouldHideName && (
          <p className={`${sizeMap[nameSize]} text-outline`}>{wine.name}</p>
        )}
        {showClassification && wine.classification && wine.classification !== '-' && (
          <span
            className={`${sizeMap[classificationSize]} text-outline-variant opacity-70 italic`}
          >
            {wine.classification}
          </span>
        )}
      </div>
    )
  }

  // Vertical layout (default)
  return (
    <div className="space-y-1">
      <h3 className={`${sizeMap[producerSize]} font-medium text-on-surface leading-tight`}>
        {wine.producer}
      </h3>
      {!shouldHideName && (
        <p className={`${sizeMap[nameSize]} text-outline opacity-90`}>{wine.name}</p>
      )}
      {showClassification && wine.classification && wine.classification !== '-' && (
        <p
          className={`${sizeMap[classificationSize]} text-outline-variant opacity-70 italic font-light`}
        >
          {wine.classification}
        </p>
      )}
    </div>
  )
}
