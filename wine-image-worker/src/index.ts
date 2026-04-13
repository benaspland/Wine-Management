interface Env {
  GOOGLE_API_KEY: string
  GOOGLE_CX: string
}

interface GoogleSearchItem {
  title: string
  link: string
  image?: {
    contextLink: string
    thumbnailLink: string
    width: number
    height: number
  }
}

interface GoogleSearchResponse {
  items?: GoogleSearchItem[]
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(),
      })
    }

    const url = new URL(request.url)
    const query = url.searchParams.get('q')

    if (!query) {
      return jsonResponse({ error: 'Missing query parameter' }, 400)
    }

    try {
      const searchUrl = new URL('https://www.googleapis.com/customsearch/v1')
      searchUrl.searchParams.set('key', env.GOOGLE_API_KEY)
      searchUrl.searchParams.set('cx', env.GOOGLE_CX)
      searchUrl.searchParams.set('q', `${query} wine bottle`)
      searchUrl.searchParams.set('searchType', 'image')
      searchUrl.searchParams.set('num', '8')
      searchUrl.searchParams.set('imgType', 'photo')

      const response = await fetch(searchUrl.toString())
      const data = (await response.json()) as GoogleSearchResponse

      if (!response.ok) {
        return jsonResponse({ error: 'Search API error', status: response.status, details: data }, 502)
      }

      const images = (data.items || []).map((item) => ({
        url: item.link,
        thumbnail: item.image?.thumbnailLink || item.link,
        title: item.title,
        width: item.image?.width || 0,
        height: item.image?.height || 0,
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
