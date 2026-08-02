'use strict'

/**
 * Anti-AFK loop. Sends periodic `move_player` packets so the server's own
 * idle/AFK detection sees activity. Two safety choices worth calling out:
 *
 * 1. Default mode is "rotate": position never changes, only look direction
 *    does. The bot has no awareness of what's around it (no chunk/world
 *    model), so any positional movement is a blind guess - rotation-only
 *    carries zero risk of walking into lava, off a ledge, or into a mob.
 *    "walk" mode is opt-in for people who want visible movement and have
 *    placed the bot somewhere enclosed/safe.
 *
 * 2. Every send is wrapped in try/catch. Bedrock's packet field layouts are
 *    generated per-protocol-version and can shift between game versions, so
 *    this treats a failed send as "this server/version rejected our packet
 *    shape" rather than a fatal error - after a few consecutive failures it
 *    disables itself and falls back to presence-only keep-alive instead of
 *    crashing the process or retrying forever.
 */

const MAX_CONSECUTIVE_FAILURES = 3

function toRadians (degrees) {
  return (degrees * Math.PI) / 180
}

/**
 * @param {import('bedrock-protocol').Client} client
 * @param {{ getRuntimeId: () => bigint|null, getPosition: () => {x:number,y:number,z:number} }} sessionState
 * @param {object} config - the `antiAfk` slice of the app config
 * @param {ReturnType<import('../logger').Logger['child']>} log
 * @returns {{ stop: () => void }}
 */
function startAntiAfk (client, sessionState, config, log) {
  if (config.mode === 'none' || !config.enabled) {
    return { stop () {} }
  }

  let yaw = 0
  let tick = 0n
  let direction = 1
  let walkOffset = 0
  let consecutiveFailures = 0
  let stopped = false

  const timer = setInterval(() => {
    if (stopped) return

    try {
      const runtimeId = sessionState.getRuntimeId()
      const basePosition = sessionState.getPosition()

      // Oscillate yaw back and forth through a modest +/-60 degree arc
      // rather than spinning continuously - looks less like a bot and is
      // cheaper to reason about for the "did input happen recently" check
      // the server's AFK timer performs. Clamp-then-reverse (rather than
      // reverse-after-overshoot) keeps the arc exactly bounded.
      yaw += direction * 20
      if (yaw >= 60) {
        yaw = 60
        direction = -1
      } else if (yaw <= -60) {
        yaw = -60
        direction = 1
      }

      const position = { ...basePosition }
      if (config.mode === 'walk' && config.walkRadius > 0) {
        walkOffset += direction * 0.1
        const clamped = Math.max(-config.walkRadius, Math.min(config.walkRadius, walkOffset))
        walkOffset = clamped
        const yawRad = toRadians(yaw)
        position.x = basePosition.x + Math.sin(yawRad) * clamped
        position.z = basePosition.z + Math.cos(yawRad) * clamped
      }

      client.queue('move_player', {
        runtime_id: runtimeId ?? 0n,
        position,
        pitch: 0,
        yaw,
        head_yaw: yaw,
        mode: 'normal',
        on_ground: true,
        ridden_runtime_id: 0n,
        tick
      })

      tick += 1n
      consecutiveFailures = 0
    } catch (err) {
      consecutiveFailures += 1
      log.warn('Anti-AFK movement packet failed to send', {
        attempt: consecutiveFailures,
        error: err.message
      })

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        log.warn(
          'Disabling movement-based anti-AFK for this session after repeated failures; ' +
          'staying connected without simulated movement. This can happen if the server ' +
          'negotiated a protocol version with a different packet layout than expected.'
        )
        stopped = true
        clearInterval(timer)
      }
    }
  }, config.intervalMs)

  return {
    stop () {
      stopped = true
      clearInterval(timer)
    }
  }
}

module.exports = { startAntiAfk }
