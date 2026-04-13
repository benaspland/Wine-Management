interface Env {
  GOOGLE_SERVICE_ACCOUNT: string
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

interface ServiceAccountKey {
  client_email: string
  private_key: string
  token_uri: string
}

// Create a JWT and exchange it for an access token
async function getAccessToken(sa: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cse',
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  }

  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const unsignedToken = `${encode(header)}.${encode(payload)}`

  // Import the private key
  const pemContents = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '')
  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0))

  const key = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsignedToken)
  )

  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const jwt = `${unsignedToken}.${sig}`

  // Exchange JWT for access token
  const tokenResponse = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  })

  const tokenData = (await tokenResponse.json()) as { access_token?: string; error?: string }
  if (!tokenData.access_token) {
    throw new Error(`Token exchange failed: ${tokenData.error || 'unknown error'}`)
  }

  return tokenData.access_token
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
      const sa: ServiceAccountKey = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT)
      const accessToken = await getAccessToken(sa)

      const searchUrl = new URL('https://customsearch.googleapis.com/customsearch/v1')
      searchUrl.searchParams.set('cx', env.GOOGLE_CX)
      searchUrl.searchParams.set('q', `${query} wine bottle`)
      searchUrl.searchParams.set('searchType', 'image')
      searchUrl.searchParams.set('num', '8')
      searchUrl.searchParams.set('imgType', 'photo')

      const response = await fetch(searchUrl.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
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
