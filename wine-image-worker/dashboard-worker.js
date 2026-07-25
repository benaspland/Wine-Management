/**
 * Paste-ready version of src/index.ts for the Cloudflare dashboard editor.
 *
 * The dashboard editor takes a single plain-JavaScript file — it does not
 * compile TypeScript — so this is the same worker with the types removed.
 * It exists so the worker can be deployed from a phone browser without
 * wrangler or a terminal. Keep it in step with src/index.ts if that changes.
 */

export default {
  async fetch(request, env) {
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
      const data = await response.json()

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
      return jsonResponse({ error: 'Internal error', message: error.message }, 500)
    }
  },
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  })
}
