/**
 * Turning a phone photo into something the app can keep.
 *
 * Photos are stored as data URLs on the wine record itself, which means
 * they persist with everything else, appear in the JSON backup, and
 * work with no network — the whole point of using your own camera. The
 * cost is that every byte lives in the database and in every backup, so
 * a 4MB camera JPEG is downscaled and recompressed before it is stored.
 * A label only ever renders a few hundred pixels wide.
 */

/** Longest edge kept, in pixels. Plenty for a card or the detail panel. */
const MAX_EDGE = 900
const INITIAL_QUALITY = 0.72
/** Below this, stop trying to shrink further. */
const MIN_QUALITY = 0.4
/** Ceiling per photo; 125 of these stays comfortably inside IndexedDB. */
const MAX_BYTES = 300_000

export class UnsupportedImageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedImageError'
  }
}

/**
 * Scale dimensions to fit within a square bound, preserving aspect
 * ratio. Images already inside the bound are left alone rather than
 * upscaled — enlarging a small photo only adds bytes.
 */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = MAX_EDGE
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 }
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width: Math.round(width), height: Math.round(height) }

  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** Rough decoded size of a data URL, without materialising a Blob. */
export function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
}

/**
 * Decode a file into a bitmap, honouring the EXIF orientation phones
 * write instead of rotating pixels — without this, half of all camera
 * photos are stored sideways.
 */
async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bitmap, width: bitmap.width, height: bitmap.height }
    } catch {
      // Fall through to the <img> path below
    }
  }

  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new UnsupportedImageError('That image could not be read'))
      element.src = url
    })
    return { source: image, width: image.naturalWidth, height: image.naturalHeight }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Downscale and compress a picked image to a storable data URL.
 * Quality steps down until the result fits the size ceiling, so an
 * unusually detailed photo cannot quietly bloat the database.
 */
export async function fileToStoredImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new UnsupportedImageError('That file is not an image')
  }

  const { source, width, height } = await decode(file)
  if (!width || !height) {
    throw new UnsupportedImageError('That image could not be read')
  }

  const target = fitWithin(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = target.width
  canvas.height = target.height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new UnsupportedImageError('This browser cannot process images')
  }
  context.drawImage(source, 0, 0, target.width, target.height)
  if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
    source.close()
  }

  let quality = INITIAL_QUALITY
  let dataUrl = canvas.toDataURL('image/jpeg', quality)
  while (dataUrlBytes(dataUrl) > MAX_BYTES && quality > MIN_QUALITY) {
    quality -= 0.1
    dataUrl = canvas.toDataURL('image/jpeg', quality)
  }

  return dataUrl
}

/** True for images held on the device rather than fetched from a URL. */
export function isStoredImage(imageUrl?: string): boolean {
  return Boolean(imageUrl?.startsWith('data:'))
}
