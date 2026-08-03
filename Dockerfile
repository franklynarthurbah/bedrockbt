# syntax=docker/dockerfile:1.7
#
# Bedrock AFK Bot - container image
#
# Why this file exists: "npm: command not found" means the previous runtime
# had no Node.js installation in it at all - that is an environment problem,
# not a bug in this project's code. Every official `node:*` image bundles a
# matching `npm` on PATH, so anywhere this image runs, both `node` and `npm`
# exist by definition. This file is the fix, made explicit and reproducible.
#
# Where this fits with Wispbyte specifically: Wispbyte's free/standard flow
# has you pick a "Node.js" Docker image from its own panel rather than
# building a Dockerfile yourself (see README.md > "Deploying on Wispbyte").
# This file is still useful there as the precise, verifiable definition of
# that same runtime - and it's the primary path on any host that *does*
# build custom images (a VPS, Railway, Fly.io, Render, plain `docker run`,
# CI, or local testing).

# ---- base ------------------------------------------------------------------
# Node 22 is current Maintenance LTS (supported into April 2027) - the same
# major version this project was verified against. "bookworm-slim" is
# Debian-based (glibc, not musl), which avoids the native-module surprises
# Alpine sometimes causes, while staying much smaller than the full image.
FROM node:22-bookworm-slim AS base
WORKDIR /app

# ---- deps -------------------------------------------------------------------
# Isolated in its own stage/layer so it only reruns when package.json or
# package-lock.json actually change, not on every source edit.
FROM base AS deps
COPY package.json package-lock.json ./
# npm ci = reproducible install driven entirely by package-lock.json (see
# README > "Reproducible installs"). It fails loudly if package.json and the
# lockfile ever disagree, instead of silently installing something slightly
# different than what was tested. --omit=dev keeps the image minimal (this
# project currently has no devDependencies at all).
RUN npm ci --omit=dev --no-audit --no-fund

# ---- runtime ------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
# --chown up front rather than relying on default root-owned permissions,
# so this keeps working even on a base image with a stricter umask.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node src ./src

# Official node images ship a non-root "node" user - use it. Not required by
# Wispbyte specifically, but good practice on any host that runs this image.
USER node

# Metadata only - does not itself publish the port. Only relevant at all if
# HEALTH_CHECK_ENABLED=true (off by default; see .env.example).
EXPOSE 3000

# Run node directly rather than "npm start": as container PID 1 this means
# SIGINT/SIGTERM are delivered straight to the process, so the graceful-
# shutdown handling in src/index.js actually receives the signal instead of
# it being absorbed by an intermediate npm process. (If you enable the
# health endpoint and your platform supports Docker HEALTHCHECK / liveness
# probes, point it at GET http://localhost:$HEALTH_CHECK_PORT$HEALTH_CHECK_PATH.)
CMD ["node", "src/index.js"]
