/**
 * The one place a Claude client is made, and the one place an API
 * failure is turned into something a person can act on.
 *
 * Both of the app's AI features — looking a wine up, and reading a
 * purchase off a photograph — talk to the same account with the same
 * key and fail in the same ways, so neither should carry its own copy
 * of how to do that.
 */

import { storedApiKey } from './aiSettings.service'

export const CLAUDE_MODEL = 'claude-opus-5'

/** Something went wrong with the call itself, as opposed to the answer. */
export class ClaudeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ClaudeError'
  }
}

/**
 * The SDK is imported on first use, not at startup.
 *
 * It is by far the largest dependency in the app and most sessions
 * never ask it anything, so it sits in its own chunk and is fetched
 * when it is first needed.
 */
export async function createClaudeClient() {
  const apiKey = storedApiKey()
  if (!apiKey) {
    throw new ClaudeError('No Claude API key saved. Add one in Settings to use this.')
  }

  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  return new Anthropic({
    apiKey,
    // There is no server to put in front of this: the app is a static
    // site, so the call goes from the browser or not at all.
    dangerouslyAllowBrowser: true,
    maxRetries: 1,
  })
}

/**
 * Say what actually went wrong.
 *
 * Every one of these has a different fix — a wrong key, an empty
 * account, too many requests, a phone with no signal — and "it failed"
 * sends the user looking in the wrong place for all of them.
 */
export function describeFailure(error: unknown): string {
  const status = (error as { status?: number })?.status
  switch (status) {
    case 401:
    case 403:
      return 'That API key was rejected. Check it in Settings, or make a new one in the Anthropic Console.'
    case 400:
      return `Claude rejected the request: ${(error as Error).message}`
    case 404:
      return `Model ${CLAUDE_MODEL} is not available to this account.`
    case 413:
      return 'That image is too large to send. Try a tighter crop.'
    case 429:
      return 'Rate limited by the API. Wait a moment and try again.'
    case 529:
      return 'The API is overloaded right now. Try again shortly.'
  }
  if (status !== undefined && status >= 500) {
    return 'The API had a server error. Try again shortly.'
  }
  const message = (error as Error)?.message ?? ''
  if (/credit|billing|quota/i.test(message)) {
    return 'The account has no API credit. Top it up in the Anthropic Console.'
  }
  if (/fetch|network|Connection/i.test(message)) {
    return 'Could not reach the API. Check the connection and try again.'
  }
  return message || 'The request failed.'
}
