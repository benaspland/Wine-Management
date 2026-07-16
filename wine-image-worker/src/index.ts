interface Env {
  PIXABAY_API_KEY: string
}

interface PixabayHit {
  largeImageURL: string
  webformatURL: string
  previewURL: string
  tags: string
  imageWidth: number
  imageHeight: number
}

interface PixabayResponse {
  hits?: PixabayHit[]
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() })
    }

    const url = new URL(request.url)
    const query = url.searchParams.get('q')

    if (!query) {
      return jsonResponse({ error: 'Missing query parameter' }, 400)
    }

    if (!env.PIXABAY_API_KEY) {
      return jsonResponse({ error: 'PIXABAY_API_KEY not configured' }, 500)
    }

    try {
      const searchUrl = new URL('https://pixabay.com/api/')
      searchUrl.searchParams.set('key', env.PIXABAY_API_KEY)
      searchUrl.searchParams.set('q', `${query} wine bottle`)
      searchUrl.searchParams.set('image_type', 'photo')
      searchUrl.searchParams.set('per_page', '8')
      searchUrl.searchParams.set('safesearch', 'true')

      const response = await fetch(searchUrl.toString())
      const data = (await response.json()) as PixabayResponse

      if (!response.ok) {
        return jsonResponse({ error: 'Search API error', status: response.status }, 502)
      }

      const images = (data.hits || []).map((hit) => ({
        url: hit.largeImageURL || hit.webformatURL,
        thumbnail: hit.previewURL,
        title: hit.tags,
        width: hit.imageWidth,
        height: hit.imageHeight,
      }))

      return jsonResponse({ images })
    } catch (error) {
      return jsonResponse({ error: 'Internal error', message: (error as Error).message }, 500)
    }
  },
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  })
}
