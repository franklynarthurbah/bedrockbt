'use strict'

/**
 * Categories a disconnect/error can fall into. Used purely for diagnostics -
 * every category still reconnects (unless reconnect is disabled or the
 * attempt cap is hit), because a bot's job is to keep trying. The category
 * only changes what we print, so the person running the bot knows whether to
 * go fix something instead of just waiting.
 */
const CATEGORY = {
  AUTH_FAILURE: 'AUTH_FAILURE',
  VERSION_MISMATCH: 'VERSION_MISMATCH',
  ACCESS_DENIED: 'ACCESS_DENIED',
  NETWORK: 'NETWORK',
  UNKNOWN: 'UNKNOWN'
}

const HINTS = {
  [CATEGORY.AUTH_FAILURE]: 'This looks like an authentication problem. If bot.offline is true, make sure the server allows non-Xbox-Live / offline connections. If bot.offline is false, the bot needs a real Microsoft sign-in.',
  [CATEGORY.VERSION_MISMATCH]: 'This looks like a protocol version mismatch. Check that bot.version (BEDROCK_VERSION) matches the Bedrock version your server actually runs, or omit it to use the library default.',
  [CATEGORY.ACCESS_DENIED]: 'The server actively rejected this connection (ban, whitelist, or explicit kick). Reconnecting will not help until that is resolved on the server side.',
  [CATEGORY.NETWORK]: 'This looks like a network-level problem: wrong host/port, the server is offline, or a firewall is blocking UDP traffic.',
  [CATEGORY.UNKNOWN]: 'No specific cause detected from the disconnect reason.'
}

/** Classifies a disconnect/error reason string into a coarse category. */
function classify (reasonText) {
  const text = String(reasonText || '').toLowerCase()
  if (!text) return CATEGORY.UNKNOWN

  if (/(outdated|incompatible|version)/.test(text)) return CATEGORY.VERSION_MISMATCH
  if (/(xbox|xbl|auth|login|token|unable to authenticate|multiplayer\.disconnect\.notauthenticated)/.test(text)) return CATEGORY.AUTH_FAILURE
  if (/(banned|ban |whitelist|not whitelisted|not allowlisted)/.test(text)) return CATEGORY.ACCESS_DENIED
  if (/(timed out|timeout|econnrefused|econnreset|enotfound|eai_again|unreachable|refused)/.test(text)) return CATEGORY.NETWORK
  return CATEGORY.UNKNOWN
}

class ReconnectManager {
  constructor (config, logger) {
    this.config = config
    this.logger = logger
    this.attempt = 0
    this.lastCategory = null
    this.consecutiveSameCategory = 0
  }

  /** Call once a session has successfully spawned - forgets prior failures. */
  reset () {
    this.attempt = 0
    this.lastCategory = null
    this.consecutiveSameCategory = 0
  }

  /** Returns true if we've hit the configured attempt cap (0 = unlimited). */
  shouldGiveUp () {
    const max = this.config.reconnect.maxAttempts
    return max > 0 && this.attempt >= max
  }

  /**
   * Records a failed attempt and returns { delayMs, category, hint,
   * attempt }. Backoff doubles each attempt up to maxDelayMs, then adds
   * random jitter so many bots on one host don't all retry in lockstep.
   */
  recordFailureAndGetDelay (reasonText) {
    const category = classify(reasonText)
    this.consecutiveSameCategory = category === this.lastCategory ? this.consecutiveSameCategory + 1 : 1
    this.lastCategory = category
    this.attempt += 1

    const { baseDelayMs, maxDelayMs, jitterMs } = this.config.reconnect
    const exponential = baseDelayMs * Math.pow(2, this.attempt - 1)
    // If the same non-network problem (e.g. auth/version) keeps repeating,
    // stop climbing gradually and just sit at the max delay - rapid retries
    // against a config problem waste everyone's time and hammer the server.
    const stuckOnSameProblem = this.consecutiveSameCategory >= 3 && category !== CATEGORY.UNKNOWN
    const base = stuckOnSameProblem ? maxDelayMs : Math.min(exponential, maxDelayMs)
    const jitter = Math.floor(Math.random() * jitterMs)

    return {
      delayMs: base + jitter,
      category,
      hint: HINTS[category],
      attempt: this.attempt
    }
  }
}

module.exports = { ReconnectManager, classify, CATEGORY, HINTS }
