/**
 * The Claude API key, and whether lookups may search the web.
 *
 * The app is a static site with no server of its own, so a lookup is a
 * call straight from the browser to api.anthropic.com — which means the
 * key has to be in the browser. It is kept in localStorage, on the one
 * device it was typed into, and nowhere else: not in the repository, not
 * in the build, not in any backup or CSV export this app writes. A key
 * committed to a public repo is a key published, and this one is the
 * user's own billing account.
 *
 * The consequence to be aware of: anything with access to this browser
 * profile can read the key. Revoking it is one click in the Console,
 * which is the right answer if a phone is lost.
 */

const KEY_STORAGE = 'wine-app-anthropic-key'
const SEARCH_STORAGE = 'wine-app-ai-web-search'

/** Console keys start `sk-ant-`; anything else is a paste gone wrong. */
export function looksLikeApiKey(value: string): boolean {
  return /^sk-ant-\S{20,}$/.test(value.trim())
}

export function storedApiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? ''
  } catch {
    // Private browsing, or storage blocked: no key, and no lookups.
    return ''
  }
}

export function saveApiKey(value: string): void {
  try {
    const trimmed = value.trim()
    if (trimmed) localStorage.setItem(KEY_STORAGE, trimmed)
    else localStorage.removeItem(KEY_STORAGE)
  } catch {
    // Nothing to be done about it here; the lookup will say it has no key.
  }
}

export function hasApiKey(): boolean {
  return storedApiKey().length > 0
}

/**
 * Web search is on unless turned off.
 *
 * It is the single biggest thing standing between a lookup and an
 * invented answer: model knowledge of a small grower's 2022 alcohol
 * level is thin, and thin knowledge is exactly where a model fills the
 * gap with something plausible. Grounding the answer in pages it has
 * just read, and showing which ones, makes a wrong answer checkable
 * instead of merely confident.
 */
export function webSearchEnabled(): boolean {
  try {
    return localStorage.getItem(SEARCH_STORAGE) !== 'off'
  } catch {
    return true
  }
}

export function setWebSearchEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SEARCH_STORAGE, enabled ? 'on' : 'off')
  } catch {
    // Preference only; the default stands.
  }
}
