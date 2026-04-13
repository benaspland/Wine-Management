interface Env {
  BING_API_KEY: string
}

interface BingImageResult {
  name: string
  contentUrl: string
  thumbnailUrl: string
  width: number
  height: number
}

interface BingSearchResponse {
  value?: BingImageResult[]
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
      const searchUrl = new URL('https://api.bing.microsoft.com/v7.0/images/search')
      searchUrl.searchParams.set('q', `${query} wine bottle`)
      searchUrl.searchParams.set('count', '8')
      searchUrl.searchParams.set('imageType', 'Photo')

      const response = await fetch(searchUrl.toString(), {
        headers: {
          'Ocp-Apim-Subscription-Key': env.BING_API_KEY,
        },
      })
      const data = (await response.json()) as BingSearchResponse

      if (!response.ok) {
        return jsonResponse({ error: 'Search API error', status: response.status, details: data }, 502)
      }

      const images = (data.value || []).map((item) => ({
        url: item.contentUrl,
        thumbnail: item.thumbnailUrl,
        title: item.name,
        width: item.width || 0,
        height: item.height || 0,
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
