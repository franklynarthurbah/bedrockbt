'use strict'

const http = require('http')

/**
 * Minimal, dependency-free health endpoint. Off by default since most
 * bot-style hosting (including Wispbyte/Pterodactyl) supervises the process
 * directly and doesn't need an HTTP port - this exists for people who want
 * to point an external uptime monitor at the bot.
 *
 * `getStatus` is called fresh on every request so the response always
 * reflects current state instead of a snapshot taken at startup.
 *
 * @param {object} healthConfig - the `health` slice of the app config
 * @param {() => object} getStatus
 * @param {import('./logger').Logger} log
 * @returns {{ close: () => void }}
 */
function startHealthServer (healthConfig, getStatus, log) {
  if (!healthConfig.enabled) {
    return { close () {} }
  }

  const server = http.createServer((req, res) => {
    if (req.url !== healthConfig.path) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'not found' }))
      return
    }
    const status = getStatus()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(status))
  })

  // Binding a port is a nice-to-have, not core function - if it fails
  // (port in use, not permitted on this host, etc.) log and move on rather
  // than taking down the bot over it.
  server.on('error', (err) => {
    log.warn('Health check server could not start; continuing without it', { error: err.message })
  })

  server.listen(healthConfig.port, () => {
    log.info('Health check server listening', { port: healthConfig.port, path: healthConfig.path })
  })

  return {
    close () {
      server.close()
    }
  }
}

module.exports = { startHealthServer }
