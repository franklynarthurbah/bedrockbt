'use strict'

/**
 * Small, dependency-free validation helpers. Every function here is a pure
 * predicate or a parser that never throws - callers decide what to do with
 * invalid input (usually: collect an error message and keep validating).
 */

function isNonEmptyString (value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isValidHost (value) {
  if (!isNonEmptyString(value)) return false
  const trimmed = value.trim()
  if (/^[a-z]+:\/\//i.test(trimmed)) return false // "https://..." is not a host
  if (/\s/.test(trimmed)) return false
  return true
}

function isValidPort (value) {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 && n <= 65535
}

function isPositiveInteger (value) {
  const n = Number(value)
  return Number.isInteger(n) && n > 0
}

function isNonNegativeNumber (value) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0
}

function isOneOf (value, allowed) {
  return allowed.includes(value)
}

/** Parses common truthy/falsy string forms from env vars. Falls back if unparsable. */
function parseBoolean (value, fallback) {
  if (typeof value === 'boolean') return value
  if (value === undefined || value === null || value === '') return fallback
  const normalized = String(value).trim().toLowerCase()
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true
  if (['false', '0', 'no', 'off'].includes(normalized)) return false
  return fallback
}

/** Parses an integer from a string/number. Returns fallback if not a finite integer. */
function parseIntSafe (value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  const n = Number(value)
  return Number.isInteger(n) ? n : fallback
}

/** Parses a float from a string/number. Returns fallback if not finite. */
function parseFloatSafe (value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** Bedrock/Minecraft-style username sanity check. Bedrock usernames can include
 * spaces and are more permissive than Java's, so this only rejects control
 * characters and unreasonable lengths rather than enforcing a strict pattern. */
function isPlausibleUsername (value) {
  if (!isNonEmptyString(value)) return false
  const trimmed = value.trim()
  if (trimmed.length > 32) return false
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(trimmed)) return false
  return true
}

module.exports = {
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
}
