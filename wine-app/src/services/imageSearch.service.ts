export interface ImageResult {
  url: string
  thumbnail: string
  title: string
  width: number
  height: number
}

const WORKER_URL = import.meta.env.VITE_IMAGE_WORKER_URL || ''

export async function searchWineImages(
  producer: string,
  name: string,
  vintage?: number
): Promise<ImageResult[]> {
  if (!WORKER_URL) {
    console.warn('[ImageSearch] VITE_IMAGE_WORKER_URL not configured')
    return []
  }

  const parts = [producer, name]
  if (vintage) parts.push(String(vintage))
  const query = parts.filter(Boolean).join(' ')

  if (!query.trim()) return []

  const url = `${WORKER_URL}?q=${encodeURIComponent(query)}`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Image search failed: ${response.status}`)
  }

  const data = await response.json()
  return data.images || []
}
