# Bedrock AFK Bot

A production-ready **Minecraft Bedrock / MCPE** keep-alive bot. It connects to a
Bedrock server, stays connected through disconnects and restarts, performs
light, configurable anti-AFK behavior, and is built to run unattended on
low-cost Node.js hosting such as [Wispbyte](https://wispbyte.com).

This is a full rebuild of the original project, which was a Java Edition
([Mineflayer](https://github.com/PrismarineJS/mineflayer)) bot. Mineflayer
speaks the **Java Edition** protocol and cannot connect to Bedrock/MCPE
servers at all — the two editions use completely different network
protocols. This rebuild uses
[`bedrock-protocol`](https://github.com/PrismarineJS/bedrock-protocol), the
Bedrock-native equivalent, and adds the reconnect handling, config
validation, structured logging, and graceful shutdown the original script
didn't have.

## What this bot does

- Connects to a Bedrock/MCPE server and stays connected as a normal player.
- Automatically reconnects after disconnects, with exponential backoff and
  jitter so it doesn't hammer the server or your host.
- Sends small, configurable "I'm still here" movement/rotation packets so
  the server's own AFK-idle detection doesn't kick it.
- Optionally sends a periodic chat message (off by default).
- Logs everything as structured, timestamped lines.
- Shuts down cleanly on `SIGINT`/`SIGTERM` instead of leaving a dangling
  connection.
- Validates its own configuration before it ever tries to connect.

## What this bot does *not* do

- It does not bypass Xbox Live / Microsoft authentication, whitelists, bans,
  or any other server security. If a server requires a real Microsoft
  sign-in, this bot needs a real Microsoft sign-in too (see
  [Authentication modes](#authentication-modes)).
- It does not fight, mine, build, or interact with the world. Movement is
  limited to small, safe rotation/position nudges purely to avoid being
  marked idle.
- It cannot guarantee a server host won't consider AFK bots against its
  terms of service. See [Safety and ToS notes](#safety-and-tos-notes).

## Supported Minecraft version range

Built on `bedrock-protocol`, which currently supports Bedrock/MCPE
**1.16.201 through 1.26.30** (auto-generated from Mojang's own protocol
schemas per version). The bot defaults to **1.26.30**. If your server runs a
different version, set `BEDROCK_VERSION` to match — see
[Troubleshooting](#troubleshooting).

## Platform support notes

- **Node.js 18+**, any OS. No native build tools required (see
  [A note on `raknet-native`](#a-note-on-raknet-native) below).
- Designed for headless/unattended hosting: no GUI, no interactive prompts
  in the default (offline) auth mode.
- Memory-light: no world/chunk model is built or cached, dependencies are
  kept minimal, and the server is asked to stream a small chunk radius
  (`VIEW_DISTANCE`) to keep bandwidth and memory use down.

---

## Installation

```bash
# 1. Extract/clone the project, then from the project folder:
npm install

# 2. Configure (pick one):
cp .env.example .env        # then edit .env
# or
cp config.example.json config.json   # then edit config.json

# 3. Run
npm start
```

`npm install` needs internet access to `registry.npmjs.org` (or your
configured registry) the first time.

### A note on `raknet-native`

`bedrock-protocol` defaults to a native (C++) RakNet implementation for
speed. Compiling it requires a C/C++ toolchain, and on many shared or
free-tier Node hosts (including some container images used by low-cost
hosts) that toolchain isn't available, which makes `npm install` fail
outright before the bot ever runs.

This project's `package.json` fixes that with a standard npm `overrides`
entry that points `raknet-native` at
[`jsp-raknet`](https://www.npmjs.com/package/jsp-raknet) — a pure-JavaScript
RakNet implementation with no native compilation step:

```json
"overrides": {
  "raknet-native": "npm:jsp-raknet@^2.1.3"
}
```

The bot also explicitly sets `raknetBackend: "jsp-raknet"` when connecting.
This was verified end-to-end (install, connect attempt, reconnect cycles)
during development. If you're deploying somewhere you know has a working
C++ build toolchain and want the native backend's extra performance, you
can remove the `overrides` block and set `RAKNET_BACKEND=raknet-native`
instead — just know that `npm install` will then need to compile it.

---

## Configuration

Configuration is layered, in this order (later wins):

1. Built-in defaults
2. `config.json` (optional — copy from `config.example.json`)
3. Environment variables (optional — copy `.env.example` to `.env`, or set
   real environment variables in your host's panel)

**Environment variables always win.** This is deliberate: on hosting panels
like Wispbyte, you'll typically set environment variables in the panel UI,
and those should always take effect regardless of what's in a checked-in
`config.json`.

The bot **validates the fully merged config before connecting**. If
anything is missing or invalid, it prints every problem it found and exits
without attempting a connection — it will not try to run with bad settings.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `SERVER_HOST` | *(required)* | Bedrock server hostname or IP, e.g. `example.aternos.me`. No `http://`, no port. |
| `BOT_USERNAME` | `AFKBot` | Display name the bot connects as. |
| `SERVER_PORT` | `19132` | Bedrock's default port (not Java's 25565). Aternos shows the correct port on your server's dashboard. |
| `BEDROCK_VERSION` | `1.26.30` | Protocol version to speak. See [Troubleshooting](#troubleshooting) if you get a version-mismatch disconnect. |
| `AUTH_OFFLINE` | `true` | `true` = offline-style connection (no Microsoft sign-in). `false` = real Xbox Live/Microsoft login. See [Authentication modes](#authentication-modes). |
| `CONNECT_TIMEOUT_MS` | `9000` | How long to wait for a connection attempt before giving up. |
| `VIEW_DISTANCE` | `4` | Chunk radius requested from the server. Lower = less memory/bandwidth. |
| `RAKNET_BACKEND` | `jsp-raknet` | `jsp-raknet` (pure JS, portable) / `raknet-native` (faster, needs a build toolchain) / `raknet-node`. |
| `RECONNECT_ENABLED` | `true` | Set `false` to exit instead of reconnecting after a disconnect. |
| `RECONNECT_BASE_DELAY_MS` | `5000` | Starting reconnect delay. |
| `RECONNECT_MAX_DELAY_MS` | `300000` | Reconnect delay cap (5 minutes). |
| `RECONNECT_MAX_ATTEMPTS` | `0` | `0` = retry forever. A number = give up and exit after that many failed attempts. |
| `RECONNECT_JITTER_MS` | `1000` | Random extra delay (0 to this value) added to every retry. |
| `ANTI_AFK_ENABLED` | `true` | Master on/off switch for anti-AFK behavior. |
| `ANTI_AFK_MODE` | `rotate` | `rotate` (look-direction only, safest), `walk` (small position nudges too), `none`. |
| `ANTI_AFK_INTERVAL_MS` | `15000` | How often to send an anti-AFK pulse. Minimum 2000. |
| `ANTI_AFK_WALK_RADIUS` | `0.5` | Max blocks from spawn point in `walk` mode. |
| `CHAT_HEARTBEAT_ENABLED` | `false` | Send a periodic chat message. Off by default. |
| `CHAT_HEARTBEAT_INTERVAL_MS` | `600000` | How often, if enabled. Minimum 30000. |
| `CHAT_HEARTBEAT_MESSAGE` | `AFK bot keep-alive active.` | The message text. |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error`. |
| `LOG_FORMAT` | `text` | `text` (human-readable) or `json` (one JSON object per line). |
| `HEALTH_CHECK_ENABLED` | `false` | Expose a small HTTP status endpoint. |
| `HEALTH_CHECK_PORT` | `3000` | Port for the health endpoint. |
| `HEALTH_CHECK_PATH` | `/health` | Path for the health endpoint. |
| `CONFIG_PATH` | `./config.json` | Where to look for the optional JSON config file. |

Full example: [`.env.example`](./.env.example).

### config.json

Same structure, grouped into sections. See
[`config.example.json`](./config.example.json) for a complete example. Only
values you want to override need to be present — anything missing falls
back to the built-in default.

---

## Authentication modes

Bedrock servers authenticate in one of two ways, and the bot needs to match
whichever one your server actually uses:

- **Offline (`AUTH_OFFLINE=true`, default):** No Microsoft/Xbox Live
  sign-in. This is what most self-hosted and "cracked"-mode Aternos setups
  use for bots, since it doesn't require attaching a real Microsoft account.
  The server must be configured to accept these connections — see
  [Aternos setup](#using-it-with-aternos-bedrockmcpe) below.
- **Online (`AUTH_OFFLINE=false`):** A real Microsoft account sign-in via
  device code. `bedrock-protocol` will print a URL and a short code to the
  log the first time; you visit the URL, enter the code, and sign in from a
  browser. This is interactive and not well suited to a fully unattended
  restart cycle, but tokens are cached to disk between runs so you generally
  only do this once per host. Use this mode only if your server genuinely
  requires Xbox Live authentication and offline mode isn't an option.

This bot cannot make either mode work against a server that isn't
configured to accept it — that's a server-side setting, not something the
bot can negotiate around.

---

## How anti-AFK works

Two independent things keep a bot "useful" against server shutdowns, and
this project handles them differently on purpose:

1. **Keeping the server from shutting down because it's empty.** Aternos
   (and similar free hosts) stop the server process after some minutes with
   zero connected players. Simply staying connected already solves this —
   no movement required. This is the bot's main job, and it happens
   automatically just by maintaining a healthy connection.

2. **Keeping Minecraft's own in-game idle/AFK detection from kicking the
   bot** while it's connected. This is what `ANTI_AFK_MODE` is for. Every
   `ANTI_AFK_INTERVAL_MS`, the bot sends a small `move_player` packet:
   - **`rotate` (default):** only look direction (yaw) changes, oscillating
     back and forth through a small arc. Position never changes. This is
     the safest option — the bot has no awareness of its surroundings (no
     world/chunk model), so it cannot tell if there's lava, a drop, or a
     mob nearby. Since it never moves, it can't walk into any of them.
   - **`walk`:** does everything `rotate` does, plus small position nudges
     within `ANTI_AFK_WALK_RADIUS` blocks of wherever the bot spawned. Only
     enable this if you know the bot's spawn point is enclosed/safe — the
     original project's advice still applies: pen the bot in so nothing can
     reach it and it can't wander into anything.
   - **`none`:** disables simulated movement entirely; the bot just stays
     connected. Combine with `CHAT_HEARTBEAT_ENABLED=true` if you also want
     some visible sign of life in chat.

Bedrock's packet layouts are generated per protocol version and can shift
between game versions. Every anti-AFK send is wrapped in error handling: if
a server/version combination rejects the packet shape, the bot logs a clear
warning, and after 3 consecutive failures it **disables movement for that
session and keeps the connection alive without it**, rather than crashing
or retrying forever. You'll see this in the logs if it happens.

---

## How reconnect works

On any disconnect (kicked, connection error, or a network hiccup), the bot:

1. Classifies the disconnect reason (network problem, likely auth failure,
   likely version mismatch, or access denied) and logs a plain-English hint
   alongside it.
2. Waits before retrying, starting at `RECONNECT_BASE_DELAY_MS` and doubling
   on each consecutive failure, capped at `RECONNECT_MAX_DELAY_MS`.
3. Adds a random jitter (0 to `RECONNECT_JITTER_MS`) on top, so if you're
   running several bots on one host they don't all retry in lockstep.
4. If the *same* category of problem (e.g. an auth failure) keeps
   repeating three times in a row, it stops climbing gradually and jumps
   straight to the max delay — rapid retries against a config problem (as
   opposed to a flaky network) don't help anyone.
5. Resets all of the above back to the starting point as soon as the bot
   successfully spawns into the world again.

If `RECONNECT_MAX_ATTEMPTS` is set above `0` and that many attempts fail in
a row, the bot logs a clear fatal message and exits instead of retrying
forever — useful if you'd rather your host's own restart/alerting take over
at that point. Some low-level network failures (like an unresolvable
hostname) surface outside the normal per-connection error events; the bot
catches these too and routes them through the same reconnect logic, with a
last-resort safety exit if too many happen in a very short window.

Timers for anti-AFK and chat heartbeat are always torn down before a
reconnect attempt starts, so you never end up with duplicate intervals
piling up across reconnects.

---

## Deploying on Wispbyte

1. Create a server on Wispbyte and choose the **Node.js** image/egg.
2. Upload the project files (or connect a git repo, if your plan supports
   it) so `package.json` and `src/` end up in the server's root directory.
3. In the panel's **Startup** tab, set the startup command to:
   ```
   npm install && npm start
   ```
   (or use the panel's install/build step if it has one, and just
   `npm start` as the run command).
4. In the panel's **Variables/Environment** tab, set at minimum
   `SERVER_HOST` and `BOT_USERNAME`, plus any others from the table above
   you want to change from their defaults.
5. Start the server and watch the console — you should see the startup
   banner, then a connection attempt, then either `Bot has spawned` or a
   clear error with a hint.

Notes specific to this kind of low-cost/shared hosting:

- Free tiers are typically memory-capped (e.g. 512 MB). This bot's
  dependency footprint is intentionally small and it builds no world model,
  so idle memory use should stay well under that, but avoid setting
  `VIEW_DISTANCE` very high or running many bots in one process.
- If the process crashes from something truly unexpected, it exits rather
  than trying to limp along — make sure your host's crash/auto-restart
  behavior is enabled (most Pterodactyl-panel hosts, including Wispbyte,
  restart a crashed Node process automatically).
- If your panel doesn't let you set environment variables directly, use
  `config.json` instead — copy `config.example.json`, edit it, and upload
  it alongside the bot.

---

## Using it with Aternos Bedrock/MCPE

1. When creating your Aternos server, choose **Bedrock Edition** (or set up
   Java + GeyserMC/Floodgate if you specifically want a Java world reachable
   by Bedrock clients — that's a different setup and outside the scope of
   this bot, which speaks native Bedrock protocol).
2. Note the exact **host** and **port** shown on your Aternos dashboard once
   the server is running — Aternos assigns a specific port per server, and
   it's rarely the default `19132`. Put these in `SERVER_HOST` /
   `SERVER_PORT`.
3. **Authentication:** by default, Aternos's Bedrock servers require a real
   Xbox Live/Microsoft sign-in for every connecting player, the same as
   connecting from a real console or the Bedrock launcher — this bot cannot
   bypass that. If you want the bot to connect without a Microsoft account
   (`AUTH_OFFLINE=true`, the default here), check your Aternos server's
   options for an offline/"Cracked" mode setting and enable it. Aternos's
   exact wording can change over time, so check your dashboard directly. If
   you'd rather keep the server in normal Xbox Live mode, set
   `AUTH_OFFLINE=false` instead and complete the one-time device sign-in
   described in [Authentication modes](#authentication-modes).
4. Start the Aternos server first, then start the bot — connecting before
   the world has finished starting will just time out and retry, which is
   harmless but pointless.
5. Aternos stops a server after a few minutes with no players connected at
   all, and Minecraft's own idle-kick timer (Aternos commonly leaves this
   at the default ~10 minutes) can disconnect a player who never moves.
   This bot's default settings (reconnect enabled, anti-AFK in `rotate`
   mode every 15s) comfortably clear both of those with room to spare.

---

## Troubleshooting

**Connection refused / connection timeout**
Bedrock runs over UDP, which doesn't have a Java-style instant "connection
refused" — an unreachable server almost always shows up as a **timeout**
after `CONNECT_TIMEOUT_MS`, logged with category `NETWORK`. Check:
- `SERVER_PORT` matches exactly what Aternos shows (not the default 19132
  unless that's genuinely what's listed).
- The server is actually started (not just the Aternos *panel* being open).
- No firewall between the bot's host and the server is blocking outbound
  UDP.

**Version mismatch**
If the server disconnects the bot with a message mentioning an outdated or
incompatible client, set `BEDROCK_VERSION` to the version your server
actually runs. The bot supports 1.16.201 through 1.26.30; if your server is
outside that range, this bot's protocol library doesn't support it yet.

**Auth failure**
If `AUTH_OFFLINE=true` and the server still rejects the connection citing
authentication, the server most likely isn't in offline/cracked mode — see
[Aternos setup](#using-it-with-aternos-bedrockmcpe). If `AUTH_OFFLINE=false`,
make sure you completed the device sign-in flow shown in the logs.

**`npm install` fails while building `raknet-native`**
This project's `package.json` already routes around this (see
[A note on `raknet-native`](#a-note-on-raknet-native)). If you've modified
the `overrides` block and hit a native build failure, either restore it or
run `npm install --ignore-scripts` and keep `RAKNET_BACKEND=jsp-raknet`.

**Bot connects but keeps getting kicked for being idle anyway**
Increase `ANTI_AFK_INTERVAL_MS`'s frequency (lower the number) or switch
`ANTI_AFK_MODE` to `walk`. Some servers run their own AFK-detection plugins
with different rules than vanilla Minecraft; check the server's own
plugin/config list if `walk` mode doesn't help.

**Nothing happens / process exits immediately**
That's almost always a config validation failure — the bot prints every
problem it found and exits before connecting. Read the printed list; it
names the exact environment variable or config field to fix.

---

## Limitations

- **No world awareness.** The bot doesn't build a chunk/world model, so it
  can't perceive terrain, mobs, or hazards. This is why `rotate` is the
  default anti-AFK mode and `walk` mode's radius is intentionally tiny —
  positional movement is always a blind guess and should only be enabled
  somewhere you've confirmed is safe.
- **Offline-mode spawn position can be unreliable on some servers.** A few
  servers report a placeholder/incorrect spawn Y-coordinate over an offline
  connection. The bot falls back to a safe default position if the
  reported one looks unusable, but this is inherently best-effort.
- **Movement packet fields can shift between Bedrock protocol versions.**
  The bot degrades gracefully (see [How anti-AFK works](#how-anti-afk-works))
  rather than crashing, but that means anti-AFK movement itself isn't
  guaranteed on every server/version combination — presence (just staying
  connected) always still works.
- **This bot cannot bypass authentication, whitelists, or bans**, and
  doesn't attempt to. If a server is locked down, the bot will simply fail
  to connect, the same as any other unauthorized client would.
- **No combat, building, or world interaction of any kind.** This is
  intentional scope, not a missing feature.

## Safety and ToS notes

- Running any AFK/keep-alive bot may be against the terms of service of
  some server hosts. Aternos in particular treats detected AFK-evasion
  tools as against their rules and reserves the right to act on it (up to
  and including removing the server). Review your host's current terms
  before running this continuously, and use it at your own risk.
- Use a bot account/username that's clearly identifiable as a bot if you're
  running it on a server you don't fully control yourself, and get
  permission from the server owner first if that's not you.
- If you enable `walk` mode, place the bot somewhere fully enclosed (a
  small sealed room with no mobs or hazards) — the bot has no ability to
  perceive or avoid danger.
- This project makes no guarantee that any particular hosting provider or
  Minecraft server will remain reachable, compatible, or within that
  provider's usage policies over time.

## Project structure

```
src/
  index.js            Entry point: config, logging, lifecycle, signals
  config.js            Loads + merges + validates config (defaults/json/env)
  logger.js             Structured, timestamped logger
  bot.js                 bedrock-protocol client lifecycle and event wiring
  reconnect.js            Backoff/jitter + disconnect-reason classification
  health.js                Optional minimal HTTP status endpoint
  actions/
    antiAfk.js              Movement/rotation anti-idle loop
    chatHeartbeat.js         Optional periodic chat message
  utils/
    validation.js             Config validation helpers
config.example.json     Example JSON config
.env.example            Example environment variables
package.json
LICENSE
```

## License

MIT — see [`LICENSE`](./LICENSE). Rebuilt from the original
`nuekkis/Minecraft-AFK-Bot` project under the same license.
