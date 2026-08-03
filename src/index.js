'use strict'

const { loadConfig } = require('./config')
const { Logger } = require('./logger')
const { createBotSession } = require('./bot')
const { ReconnectManager } = require('./reconnect')
const { startHealthServer } = require('./health')

const BOOT_TIME = Date.now()
const config = loadConfig()
const logger = new Logger(config.logging)
const reconnectManager = new ReconnectManager(config, logger)

let currentSession = null
let shuttingDown = false
let sessionEndedHandled = false
let reconnectTimer = null
let lastSpawnAt = null
let connectionState = 'starting'
let health = { close () {} } // replaced below once the health server (if enabled) is up

// Crash-loop guard for errors that escape normal event handling entirely
// (see README "Limitations" - some low-level network errors, like a
// bad hostname, surface as uncaught exceptions rather than client 'error'
// events). A handful of these in quick succession means something is
// fundamentally broken, not just a flaky connection, so we stop trying
// in-process and let the host's process supervisor restart us cleanly.
//
// Threshold verified against the actual reconnect backoff math (not just
// picked): a DNS-failure-style error that keeps recurring forever is
// EXPECTED to eventually stop tripping this guard once the exponentially
// growing reconnect delay outruns CRASH_LOOP_WINDOW_MS - the question is
// only whether it outruns the window before or after hitting the
// threshold. Simulating this against the default RECONNECT_BASE_DELAY_MS
// (5000ms), threshold=5 never triggers - good. But a deliberately fast,
// still-reasonable RECONNECT_BASE_DELAY_MS=1000 *did* false-trigger around
// the 5th-7th attempt purely because delays hadn't grown past the window
// yet, even though every single attempt was correctly backing off. 8
// clears that false positive (base delay down to ~1000ms never triggers)
// while a truly pathological loop - failures with little/no delay between
// them at all, which would mean reconnect scheduling itself is broken -
// still trips it in well under a second, which is the actual failure mode
// this guard exists to catch.
const crashTimestamps = []
const CRASH_LOOP_WINDOW_MS = 60000
const CRASH_LOOP_THRESHOLD = 8

function isCrashLooping () {
  const now = Date.now()
  while (crashTimestamps.length && now - crashTimestamps[0] > CRASH_LOOP_WINDOW_MS) {
    crashTimestamps.shift()
  }
  crashTimestamps.push(now)
  return crashTimestamps.length >= CRASH_LOOP_THRESHOLD
}

function printBanner () {
  logger.info('Bedrock AFK Bot starting', {
    host: config.bot.host,
    port: config.bot.port,
    username: config.bot.username,
    version: config.bot.version,
    authMode: config.bot.offline ? 'offline' : 'online (Microsoft sign-in)',
    antiAfkMode: config.antiAfk.mode,
    reconnect: config.reconnect.enabled,
    healthCheck: config.health.enabled
  })
}

function startSession () {
  if (shuttingDown) return
  sessionEndedHandled = false
  connectionState = 'connecting'

  currentSession = createBotSession(config, logger, {
    onSpawn () {
      reconnectManager.reset()
      connectionState = 'connected'
      lastSpawnAt = new Date().toISOString()
    },
    onEnded (reasonText) {
      connectionState = 'disconnected'
      scheduleReconnectOrExit(reasonText)
    }
  })
}

function scheduleReconnectOrExit (reasonText) {
  if (shuttingDown || sessionEndedHandled) return
  sessionEndedHandled = true

  if (!config.reconnect.enabled) {
    logger.error('Disconnected and reconnect is disabled (RECONNECT_ENABLED=false). Exiting.', { reason: reasonText })
    process.exitCode = 1
    shutdown('disconnect with reconnect disabled')
    return
  }

  if (reconnectManager.shouldGiveUp()) {
    logger.error('Reached the maximum number of reconnect attempts. Exiting.', {
      attempts: reconnectManager.attempt,
      maxAttempts: config.reconnect.maxAttempts
    })
    process.exitCode = 1
    shutdown('max reconnect attempts reached')
    return
  }

  const { delayMs, category, hint, attempt } = reconnectManager.recordFailureAndGetDelay(reasonText)
  logger.warn('Session ended; scheduling reconnect', {
    reason: reasonText,
    category,
    attempt,
    retryingInMs: delayMs
  })
  if (hint) logger.info(hint)

  connectionState = 'reconnecting'
  reconnectTimer = setTimeout(startSession, delayMs)
}

function shutdown (reason) {
  if (shuttingDown) return
  shuttingDown = true
  logger.info('Shutting down', { reason })

  if (reconnectTimer) clearTimeout(reconnectTimer)
  if (currentSession) currentSession.shutdown()
  health.close()

  logger.info('Shutdown complete. Goodbye.')
  process.exit(process.exitCode || 0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack })

  if (shuttingDown) return

  if (isCrashLooping()) {
    logger.error('Too many unexpected errors in a short window; exiting for the host to restart the process cleanly.')
    process.exitCode = 1
    shutdown('crash loop detected')
    return
  }

  if (currentSession) {
    try { currentSession.shutdown() } catch (_e) { /* already going down, ignore */ }
  }
  scheduleReconnectOrExit(err.message)
})

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason)
  logger.error('Unhandled promise rejection', { error: message })

  if (shuttingDown) return

  if (isCrashLooping()) {
    logger.error('Too many unexpected errors in a short window; exiting for the host to restart the process cleanly.')
    process.exitCode = 1
    shutdown('crash loop detected')
    return
  }

  if (currentSession) {
    try { currentSession.shutdown() } catch (_e) { /* already going down, ignore */ }
  }
  scheduleReconnectOrExit(message)
})

health = startHealthServer(config.health, () => ({
  status: connectionState,
  uptimeSeconds: Math.floor((Date.now() - BOOT_TIME) / 1000),
  lastSpawnAt,
  reconnectAttempts: reconnectManager.attempt,
  host: config.bot.host,
  port: config.bot.port
}), logger)

printBanner()
startSession()
