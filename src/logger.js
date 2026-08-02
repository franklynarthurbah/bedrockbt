'use strict'

/**
 * Minimal structured logger. No dependencies, no colors (keeps output clean
 * in hosting panel consoles that don't render ANSI codes well).
 *
 * Text format:  2026-07-31T12:00:00.000Z [INFO ] message key=value key2=value2
 * JSON format:  {"time":"...","level":"info","msg":"...","key":"value"}
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }

function normalizeLevel (level) {
  const lower = String(level || 'info').toLowerCase()
  return Object.prototype.hasOwnProperty.call(LEVELS, lower) ? lower : 'info'
}

function formatMeta (meta) {
  const keys = Object.keys(meta)
  if (keys.length === 0) return ''
  return ' ' + keys.map((k) => `${k}=${formatValue(meta[k])}`).join(' ')
}

function formatValue (value) {
  if (value instanceof Error) return JSON.stringify(value.message)
  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value)
    } catch (_e) {
      return String(value)
    }
  }
  if (typeof value === 'string' && value.includes(' ')) return JSON.stringify(value)
  return String(value)
}

class Logger {
  constructor ({ level = 'info', format = 'text' } = {}) {
    this.level = normalizeLevel(level)
    this.format = format === 'json' ? 'json' : 'text'
  }

  _shouldLog (level) {
    return LEVELS[level] >= LEVELS[this.level]
  }

  _write (level, message, meta) {
    if (!this._shouldLog(level)) return
    const time = new Date().toISOString()

    if (this.format === 'json') {
      const line = { time, level, msg: message, ...meta }
      const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout
      stream.write(JSON.stringify(line) + '\n')
      return
    }

    const tag = level.toUpperCase().padEnd(5, ' ')
    const line = `${time} [${tag}] ${message}${formatMeta(meta)}`
    const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout
    stream.write(line + '\n')
  }

  debug (message, meta = {}) { this._write('debug', message, meta) }
  info (message, meta = {}) { this._write('info', message, meta) }
  warn (message, meta = {}) { this._write('warn', message, meta) }
  error (message, meta = {}) { this._write('error', message, meta) }

  /** Returns a child logger that prefixes every message with [scope]. */
  child (scope) {
    const parent = this
    return {
      debug: (m, meta) => parent.debug(`[${scope}] ${m}`, meta),
      info: (m, meta) => parent.info(`[${scope}] ${m}`, meta),
      warn: (m, meta) => parent.warn(`[${scope}] ${m}`, meta),
      error: (m, meta) => parent.error(`[${scope}] ${m}`, meta)
    }
  }
}

module.exports = { Logger, LEVELS }
