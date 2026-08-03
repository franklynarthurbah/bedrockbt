'use strict'

const fs = require('fs')
const path = require('path')

// Loaded here (not in index.js) so config.js is fully self-contained and
// testable in isolation. dotenv never overwrites variables that are already
// set in the real environment - panel-injected env vars always win.
// quiet:true suppresses dotenv's own startup banner so log output stays
// consistent with the rest of the app.
require('dotenv').config({ quiet: true })

const {
  isNonEmptyString,
  isValidHost,
  isValidPort,
  isPositiveInteger,
  isNonNegativeNumber,
  isOneOf,
  parseBoolean,
  parseIntSafe,
  parseFloatSafe,
  isPlausibleUsername
} = require('./utils/validation')

const ANTI_AFK_MODES = ['rotate', 'walk', 'none']
const LOG_LEVELS = ['debug', 'info', 'warn', 'error']
const LOG_FORMATS = ['text', 'json']
const RAKNET_BACKENDS = ['jsp-raknet', 'raknet-native', 'raknet-node']

const DEFAULTS = {
  bot: {
    username: 'AFKBot',
    host: '',
    port: 19132,
    version: '1.26.30',
    offline: true,
    connectTimeoutMs: 9000,
    viewDistance: 4,
    raknetBackend: 'jsp-raknet'
  },
  reconnect: {
    enabled: true,
    baseDelayMs: 5000,
    maxDelayMs: 300000,
    maxAttempts: 0, // 0 = unlimited
    jitterMs: 1000
  },
  antiAfk: {
    enabled: true,
    mode: 'rotate', // 'rotate' | 'walk' | 'none'
    intervalMs: 15000,
    walkRadius: 0.5
  },
  chatHeartbeat: {
    enabled: false,
    intervalMs: 600000,
    message: 'AFK bot keep-alive active.'
  },
  logging: {
    level: 'info',
    format: 'text'
  },
  health: {
    enabled: false,
    port: 3000,
    path: '/health'
  }
}

/** Deep-merges plain objects. Arrays and primitives from `override` replace `base`. */
function deepMerge (base, override) {
  if (typeof override !== 'object' || override === null || Array.isArray(override)) {
    return override === undefined ? base : override
  }
  const result = { ...base }
  for (const key of Object.keys(override)) {
    if (
      typeof base[key] === 'object' && base[key] !== null && !Array.isArray(base[key]) &&
      typeof override[key] === 'object' && override[key] !== null && !Array.isArray(override[key])
    ) {
      result[key] = deepMerge(base[key], override[key])
    } else {
      result[key] = override[key]
    }
  }
  return result
}

function loadJsonConfig (configPath, warnings) {
  if (!fs.existsSync(configPath)) return {}
  try {
    const raw = fs.readFileSync(configPath, 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    warnings.push(`Could not read/parse ${configPath}: ${err.message}. Ignoring file and using defaults/env only.`)
    return {}
  }
}

/** Strips one layer of matching leading/trailing quotes. Hosting panel UIs
 * often lead people to paste values like SERVER_PORT="19132" out of habit
 * from shell scripts; a bare 19132 and a quoted "19132" should behave the
 * same rather than silently failing numeric/boolean parsing. */
function stripQuotes (value) {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (trimmed.length >= 2) {
    const first = trimmed[0]
    const last = trimmed[trimmed.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1)
    }
  }
  return trimmed
}

/** Builds the env-var overlay. Only includes keys that were actually set,
 * so unset env vars never clobber values from config.json. */
function loadEnvConfig () {
  const env = process.env
  const get = (key) => (env[key] !== undefined ? stripQuotes(env[key]) : undefined)
  const overlay = { bot: {}, reconnect: {}, antiAfk: {}, chatHeartbeat: {}, logging: {}, health: {} }

  if (get('BOT_USERNAME') !== undefined) overlay.bot.username = get('BOT_USERNAME')
  if (get('SERVER_HOST') !== undefined) overlay.bot.host = get('SERVER_HOST')
  if (get('SERVER_PORT') !== undefined) overlay.bot.port = parseIntSafe(get('SERVER_PORT'), get('SERVER_PORT'))
  if (get('BEDROCK_VERSION') !== undefined) overlay.bot.version = get('BEDROCK_VERSION')
  if (get('AUTH_OFFLINE') !== undefined) overlay.bot.offline = parseBoolean(get('AUTH_OFFLINE'), get('AUTH_OFFLINE'))
  if (get('CONNECT_TIMEOUT_MS') !== undefined) overlay.bot.connectTimeoutMs = parseIntSafe(get('CONNECT_TIMEOUT_MS'), get('CONNECT_TIMEOUT_MS'))
  if (get('VIEW_DISTANCE') !== undefined) overlay.bot.viewDistance = parseIntSafe(get('VIEW_DISTANCE'), get('VIEW_DISTANCE'))
  if (get('RAKNET_BACKEND') !== undefined) overlay.bot.raknetBackend = get('RAKNET_BACKEND')

  if (get('RECONNECT_ENABLED') !== undefined) overlay.reconnect.enabled = parseBoolean(get('RECONNECT_ENABLED'), get('RECONNECT_ENABLED'))
  if (get('RECONNECT_BASE_DELAY_MS') !== undefined) overlay.reconnect.baseDelayMs = parseIntSafe(get('RECONNECT_BASE_DELAY_MS'), get('RECONNECT_BASE_DELAY_MS'))
  if (get('RECONNECT_MAX_DELAY_MS') !== undefined) overlay.reconnect.maxDelayMs = parseIntSafe(get('RECONNECT_MAX_DELAY_MS'), get('RECONNECT_MAX_DELAY_MS'))
  if (get('RECONNECT_MAX_ATTEMPTS') !== undefined) overlay.reconnect.maxAttempts = parseIntSafe(get('RECONNECT_MAX_ATTEMPTS'), get('RECONNECT_MAX_ATTEMPTS'))
  if (get('RECONNECT_JITTER_MS') !== undefined) overlay.reconnect.jitterMs = parseIntSafe(get('RECONNECT_JITTER_MS'), get('RECONNECT_JITTER_MS'))

  if (get('ANTI_AFK_ENABLED') !== undefined) overlay.antiAfk.enabled = parseBoolean(get('ANTI_AFK_ENABLED'), get('ANTI_AFK_ENABLED'))
  if (get('ANTI_AFK_MODE') !== undefined) overlay.antiAfk.mode = get('ANTI_AFK_MODE')
  if (get('ANTI_AFK_INTERVAL_MS') !== undefined) overlay.antiAfk.intervalMs = parseIntSafe(get('ANTI_AFK_INTERVAL_MS'), get('ANTI_AFK_INTERVAL_MS'))
  if (get('ANTI_AFK_WALK_RADIUS') !== undefined) overlay.antiAfk.walkRadius = parseFloatSafe(get('ANTI_AFK_WALK_RADIUS'), get('ANTI_AFK_WALK_RADIUS'))

  if (get('CHAT_HEARTBEAT_ENABLED') !== undefined) overlay.chatHeartbeat.enabled = parseBoolean(get('CHAT_HEARTBEAT_ENABLED'), get('CHAT_HEARTBEAT_ENABLED'))
  if (get('CHAT_HEARTBEAT_INTERVAL_MS') !== undefined) overlay.chatHeartbeat.intervalMs = parseIntSafe(get('CHAT_HEARTBEAT_INTERVAL_MS'), get('CHAT_HEARTBEAT_INTERVAL_MS'))
  if (get('CHAT_HEARTBEAT_MESSAGE') !== undefined) overlay.chatHeartbeat.message = get('CHAT_HEARTBEAT_MESSAGE')

  if (get('LOG_LEVEL') !== undefined) overlay.logging.level = get('LOG_LEVEL')
  if (get('LOG_FORMAT') !== undefined) overlay.logging.format = get('LOG_FORMAT')

  if (get('HEALTH_CHECK_ENABLED') !== undefined) overlay.health.enabled = parseBoolean(get('HEALTH_CHECK_ENABLED'), get('HEALTH_CHECK_ENABLED'))
  if (get('HEALTH_CHECK_PORT') !== undefined) overlay.health.port = parseIntSafe(get('HEALTH_CHECK_PORT'), get('HEALTH_CHECK_PORT'))
  if (get('HEALTH_CHECK_PATH') !== undefined) overlay.health.path = get('HEALTH_CHECK_PATH')

  return overlay
}

/** Renders a config value for inclusion in an error message. Quotes strings
 * (so an empty string isn't confused with "not set"), truncates anything
 * long (a pasted URL or an overlong chat message), and never throws. */
function describe (value) {
  if (value === undefined) return 'not set'
  try {
    if (typeof value === 'string') {
      const truncated = value.length > 60 ? value.slice(0, 57) + '...' : value
      return JSON.stringify(truncated)
    }
    return JSON.stringify(value)
  } catch (_e) {
    return String(value)
  }
}

/** Validates a fully-merged config object. Returns { valid, errors } - all
 * errors are collected in one pass so the user can fix everything at once
 * instead of hitting them one at a time across repeated restarts. Every
 * message includes the offending value, since on a hosting panel the most
 * common failure is a typo/stray-character in an env var field and "must be
 * an integer" alone doesn't show which value was actually received. */
function validateConfig (config) {
  const errors = []

  if (!isPlausibleUsername(config.bot.username)) {
    errors.push(`bot.username (BOT_USERNAME) must be a non-empty string of 32 characters or fewer (got: ${describe(config.bot.username)}).`)
  }
  if (!isValidHost(config.bot.host)) {
    errors.push(`bot.host (SERVER_HOST) is required and must be a bare hostname/IP, e.g. "myserver.aternos.me" (not a URL) (got: ${describe(config.bot.host)}).`)
  }
  if (!isValidPort(config.bot.port)) {
    errors.push(`bot.port (SERVER_PORT) must be an integer between 1 and 65535 (Bedrock default is 19132) (got: ${describe(config.bot.port)}).`)
  }
  if (!isNonEmptyString(config.bot.version)) {
    errors.push(`bot.version (BEDROCK_VERSION) must be a non-empty version string, e.g. "1.26.30" (got: ${describe(config.bot.version)}).`)
  }
  if (typeof config.bot.offline !== 'boolean') {
    errors.push(`bot.offline (AUTH_OFFLINE) must resolve to true or false (got: ${describe(config.bot.offline)}).`)
  }
  if (!isPositiveInteger(config.bot.connectTimeoutMs)) {
    errors.push(`bot.connectTimeoutMs (CONNECT_TIMEOUT_MS) must be a positive integer (got: ${describe(config.bot.connectTimeoutMs)}).`)
  }
  if (!isPositiveInteger(config.bot.viewDistance) || config.bot.viewDistance > 32) {
    errors.push(`bot.viewDistance (VIEW_DISTANCE) must be a positive integer no greater than 32 (got: ${describe(config.bot.viewDistance)}).`)
  }
  if (!isOneOf(config.bot.raknetBackend, RAKNET_BACKENDS)) {
    errors.push(`bot.raknetBackend (RAKNET_BACKEND) must be one of: ${RAKNET_BACKENDS.join(', ')} (got: ${describe(config.bot.raknetBackend)}).`)
  }

  if (typeof config.reconnect.enabled !== 'boolean') {
    errors.push(`reconnect.enabled (RECONNECT_ENABLED) must resolve to true or false (got: ${describe(config.reconnect.enabled)}).`)
  }
  if (!isPositiveInteger(config.reconnect.baseDelayMs)) {
    errors.push(`reconnect.baseDelayMs (RECONNECT_BASE_DELAY_MS) must be a positive integer (got: ${describe(config.reconnect.baseDelayMs)}).`)
  }
  if (!isPositiveInteger(config.reconnect.maxDelayMs)) {
    errors.push(`reconnect.maxDelayMs (RECONNECT_MAX_DELAY_MS) must be a positive integer (got: ${describe(config.reconnect.maxDelayMs)}).`)
  }
  if (isPositiveInteger(config.reconnect.baseDelayMs) && isPositiveInteger(config.reconnect.maxDelayMs) &&
      config.reconnect.baseDelayMs > config.reconnect.maxDelayMs) {
    errors.push(`reconnect.baseDelayMs cannot be greater than reconnect.maxDelayMs (got: ${describe(config.reconnect.baseDelayMs)} > ${describe(config.reconnect.maxDelayMs)}).`)
  }
  if (!isNonNegativeNumber(config.reconnect.maxAttempts) || !Number.isInteger(config.reconnect.maxAttempts)) {
    errors.push(`reconnect.maxAttempts (RECONNECT_MAX_ATTEMPTS) must be 0 (unlimited) or a positive integer (got: ${describe(config.reconnect.maxAttempts)}).`)
  }
  if (!isNonNegativeNumber(config.reconnect.jitterMs)) {
    errors.push(`reconnect.jitterMs (RECONNECT_JITTER_MS) must be 0 or a positive integer (got: ${describe(config.reconnect.jitterMs)}).`)
  }

  if (typeof config.antiAfk.enabled !== 'boolean') {
    errors.push(`antiAfk.enabled (ANTI_AFK_ENABLED) must resolve to true or false (got: ${describe(config.antiAfk.enabled)}).`)
  }
  if (!isOneOf(config.antiAfk.mode, ANTI_AFK_MODES)) {
    errors.push(`antiAfk.mode (ANTI_AFK_MODE) must be one of: ${ANTI_AFK_MODES.join(', ')} (got: ${describe(config.antiAfk.mode)}).`)
  }
  if (!isPositiveInteger(config.antiAfk.intervalMs) || config.antiAfk.intervalMs < 2000) {
    errors.push(`antiAfk.intervalMs (ANTI_AFK_INTERVAL_MS) must be an integer >= 2000 (avoid spammy packet rates) (got: ${describe(config.antiAfk.intervalMs)}).`)
  }
  if (!isNonNegativeNumber(config.antiAfk.walkRadius) || config.antiAfk.walkRadius > 3) {
    errors.push(`antiAfk.walkRadius (ANTI_AFK_WALK_RADIUS) must be between 0 and 3 blocks (got: ${describe(config.antiAfk.walkRadius)}).`)
  }

  if (typeof config.chatHeartbeat.enabled !== 'boolean') {
    errors.push(`chatHeartbeat.enabled (CHAT_HEARTBEAT_ENABLED) must resolve to true or false (got: ${describe(config.chatHeartbeat.enabled)}).`)
  }
  if (!isPositiveInteger(config.chatHeartbeat.intervalMs) || config.chatHeartbeat.intervalMs < 30000) {
    errors.push(`chatHeartbeat.intervalMs (CHAT_HEARTBEAT_INTERVAL_MS) must be an integer >= 30000 (avoid chat spam) (got: ${describe(config.chatHeartbeat.intervalMs)}).`)
  }
  if (!isNonEmptyString(config.chatHeartbeat.message)) {
    errors.push(`chatHeartbeat.message (CHAT_HEARTBEAT_MESSAGE) must be a non-empty string (got: ${describe(config.chatHeartbeat.message)}).`)
  }

  if (!isOneOf(config.logging.level, LOG_LEVELS)) {
    errors.push(`logging.level (LOG_LEVEL) must be one of: ${LOG_LEVELS.join(', ')} (got: ${describe(config.logging.level)}).`)
  }
  if (!isOneOf(config.logging.format, LOG_FORMATS)) {
    errors.push(`logging.format (LOG_FORMAT) must be one of: ${LOG_FORMATS.join(', ')} (got: ${describe(config.logging.format)}).`)
  }

  if (typeof config.health.enabled !== 'boolean') {
    errors.push(`health.enabled (HEALTH_CHECK_ENABLED) must resolve to true or false (got: ${describe(config.health.enabled)}).`)
  }
  if (!isValidPort(config.health.port)) {
    errors.push(`health.port (HEALTH_CHECK_PORT) must be an integer between 1 and 65535 (got: ${describe(config.health.port)}).`)
  }
  if (!isNonEmptyString(config.health.path) || !config.health.path.startsWith('/')) {
    errors.push(`health.path (HEALTH_CHECK_PATH) must be a non-empty path starting with "/" (got: ${describe(config.health.path)}).`)
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Loads config from defaults -> config.json -> environment variables
 * (highest precedence), validates the result, and returns it frozen.
 * Exits the process with a clear message if validation fails, since a bot
 * with bad config should never be allowed to boot and thrash a server.
 */
function loadConfig ({ exitOnError = true } = {}) {
  const warnings = []
  const configPath = path.resolve(process.cwd(), process.env.CONFIG_PATH || 'config.json')

  const jsonConfig = loadJsonConfig(configPath, warnings)
  const envConfig = loadEnvConfig()

  let merged = deepMerge(DEFAULTS, jsonConfig)
  merged = deepMerge(merged, envConfig)

  for (const w of warnings) {
    // eslint-disable-next-line no-console
    console.warn(`[config] ${w}`)
  }

  const { valid, errors } = validateConfig(merged)

  if (!valid) {
    // eslint-disable-next-line no-console
    console.error('\nConfiguration is invalid. Fix the following and restart:\n')
    for (const err of errors) {
      // eslint-disable-next-line no-console
      console.error(`  - ${err}`)
    }
    // eslint-disable-next-line no-console
    console.error('\nSee config.example.json and .env.example for reference.\n')
    if (exitOnError) process.exit(1)
    throw new Error('Invalid configuration')
  }

  return Object.freeze({
    bot: Object.freeze({ ...merged.bot }),
    reconnect: Object.freeze({ ...merged.reconnect }),
    antiAfk: Object.freeze({ ...merged.antiAfk }),
    chatHeartbeat: Object.freeze({ ...merged.chatHeartbeat }),
    logging: Object.freeze({ ...merged.logging }),
    health: Object.freeze({ ...merged.health })
  })
}

module.exports = { loadConfig, validateConfig, deepMerge, DEFAULTS, ANTI_AFK_MODES, LOG_LEVELS, RAKNET_BACKENDS }
