'use strict'

/**
 * Optional periodic chat message, off by default. Some server owners like a
 * visible sign the bot is alive; others consider bot chat noisy or against
 * their rules, so this only ever runs when explicitly enabled.
 */
function startChatHeartbeat (client, config, log) {
  if (!config.enabled) {
    return { stop () {} }
  }

  const timer = setInterval(() => {
    try {
      client.queue('text', {
        type: 'chat',
        needs_translation: false,
        source_name: client.username || 'AFKBot',
        xuid: '',
        platform_chat_id: '',
        filtered_message: '',
        message: config.message
      })
      log.debug('Sent chat heartbeat')
    } catch (err) {
      log.warn('Chat heartbeat failed to send', { error: err.message })
    }
  }, config.intervalMs)

  return {
    stop () {
      clearInterval(timer)
    }
  }
}

module.exports = { startChatHeartbeat }
