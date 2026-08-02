'use strict'

const bedrock = require('bedrock-protocol')
const { startAntiAfk } = require('./actions/antiAfk')
const { startChatHeartbeat } = require('./actions/chatHeartbeat')

// Bedrock offline-mode sessions can report a placeholder spawn position
// (observed as an out-of-world Y value on some servers) rather than the
// real coordinates. This fallback keeps movement math sane if that happens.
const FALLBACK_POSITION = { x: 0, y: 100, z: 0 }

function stringifyReason (reason) {
  if (reason === undefined || reason === null) return 'unknown reason'
  if (typeof reason === 'string') return reason
  try {
    return JSON.stringify(reason)
  } catch (_e) {
    return String(reason)
  }
}

/**
 * Creates and wires up a single Bedrock connection attempt/session.
 *
 * @param {object} config - full app config (see config.js)
 * @param {import('./logger').Logger} rootLogger
 * @param {{ onSpawn: () => void, onEnded: (reasonText: string) => void }} callbacks
 *   onSpawn fires once per successful spawn (used to reset reconnect backoff).
 *   onEnded fires exactly once per session, however it ended, with a
 *   human-readable reason (used to schedule the next reconnect attempt).
 * @returns {{ shutdown: () => void }}
 */
function createBotSession (config, rootLogger, { onSpawn, onEnded }) {
  const log = rootLogger.child('bot')
  const { bot: botConfig } = config

  const state = {
    runtimeEntityId: null,
    position: { ...FALLBACK_POSITION }
  }

  let antiAfkHandle = { stop () {} }
  let chatHeartbeatHandle = { stop () {} }
  let ended = false

  log.info('Connecting to Bedrock server', {
    host: botConfig.host,
    port: botConfig.port,
    username: botConfig.username,
    version: botConfig.version,
    offline: botConfig.offline,
    raknetBackend: botConfig.raknetBackend
  })

  const client = bedrock.createClient({
    host: botConfig.host,
    port: botConfig.port,
    username: botConfig.username,
    offline: botConfig.offline,
    version: botConfig.version,
    connectTimeout: botConfig.connectTimeoutMs,
    raknetBackend: botConfig.raknetBackend,
    // Auto version-detection relies on an internal ping helper whose
    // native-backend wrapper does not speak the pure-JS raknet fallback's
    // event shape - skipping it and pinning `version` explicitly avoids
    // that mismatch entirely rather than working around it after the fact.
    skipPing: true,
    conLog: (msg) => log.debug(String(msg))
  })

  // Picked up by the library's own internal handshake flow, ~500ms after
  // resource pack negotiation completes (see bedrock-protocol/createClient).
  client.viewDistance = botConfig.viewDistance

  function stopAllActions () {
    antiAfkHandle.stop()
    chatHeartbeatHandle.stop()
  }

  /** Ensures onEnded fires exactly once, no matter which event(s) triggered it. */
  function endSession (reasonText) {
    if (ended) return
    ended = true
    stopAllActions()
    onEnded(reasonText)
  }

  client.on('start_game', (packet) => {
    try {
      if (packet && packet.runtime_entity_id !== undefined) {
        state.runtimeEntityId = BigInt(packet.runtime_entity_id)
      }
      if (packet && packet.player_position &&
          Number.isFinite(packet.player_position.x) &&
          Number.isFinite(packet.player_position.y) &&
          Number.isFinite(packet.player_position.z)) {
        state.position = {
          x: packet.player_position.x,
          y: packet.player_position.y,
          z: packet.player_position.z
        }
      }
    } catch (err) {
      log.debug('Could not parse start_game position/runtime id, using fallback', { error: err.message })
    }
  })

  client.on('join', () => {
    log.info('Authenticated and joining world...')
  })

  client.on('spawn', () => {
    log.info('Bot has spawned and is now active', {
      position: state.position,
      antiAfkMode: config.antiAfk.mode
    })

    antiAfkHandle = startAntiAfk(
      client,
      { getRuntimeId: () => state.runtimeEntityId, getPosition: () => state.position },
      config.antiAfk,
      log
    )
    chatHeartbeatHandle = startChatHeartbeat(client, config.chatHeartbeat, log)

    onSpawn()
  })

  client.on('kick', (reason) => {
    const reasonText = stringifyReason(reason)
    log.warn('Server kicked the bot', { reason: reasonText })
    endSession(reasonText)
  })

  client.on('close', () => {
    log.info('Connection closed')
    endSession('connection closed')
  })

  client.on('error', (err) => {
    const message = (err && err.message) || stringifyReason(err)
    log.error('Connection error', { error: message })
    endSession(message)
  })

  return {
    shutdown () {
      stopAllActions()
      try {
        client.close()
      } catch (err) {
        log.debug('Error while closing client (safe to ignore during shutdown)', { error: err.message })
      }
    }
  }
}

module.exports = { createBotSession }
