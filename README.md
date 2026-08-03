# Bedrock AFK Bot

A production-ready **Minecraft Bedrock / MCPE** keep-alive bot. It connects
to a Bedrock server, stays connected through disconnects and restarts,
performs light, configurable anti-AFK behavior, and is built to run
unattended on low-cost Node.js hosting such as
[Wispbyte](https://wispbyte.com).

This is a full rebuild of the original project, which was a Java Edition
([Mineflayer](https://github.com/PrismarineJS/mineflayer)) bot. Mineflayer
speaks the **Java Edition** protocol and cannot connect to Bedrock/MCPE
servers at all — the two editions use completely different network
protocols. This rebuild uses
[`bedrock-protocol`](https://github.com/PrismarineJS/bedrock-protocol), the
Bedrock-native equivalent, and adds the reconnect handling, config
validation, structured logging, graceful shutdown, and a real container/host
deployment story the original script didn't have.

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
- Validates its own configuration before it ever tries to connect, and
  reports exactly which value was invalid.

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

Built on `bedrock-protocol` (currently v3.57.0 on npm), which supports
Bedrock/MCPE **1.16.201 through 1.26.30** — this list comes directly from
the published package, not a guess:

```
1.16.201, 1.16.210, 1.16.220, 1.17.0, 1.17.10, 1.17.30, 1.17.40, 1.18.0,
1.18.11, 1.18.30, 1.19.1, 1.19.10, 1.19.20, 1.19.21, 1.19.30, 1.19.40,
1.19.41, 1.19.50, 1.19.60, 1.19.62, 1.19.63, 1.19.70, 1.19.80, 1.20.0,
1.20.10, 1.20.30, 1.20.40, 1.20.50, 1.20.61, 1.20.71, 1.20.80, 1.21.0,
1.21.2, 1.21.21, 1.21.30, 1.21.42, 1.21.50, 1.21.60, 1.21.70, 1.21.80,
1.21.90, 1.21.93, 1.21.100, 1.21.111, 1.21.120, 1.21.124, 1.21.130,
1.26.0, 1.26.10, 1.26.20, 1.26.30
```

The bot defaults to **1.26.30**, the newest version in that list. If your
server runs a different version, set `BEDROCK_VERSION` to match — see
[Troubleshooting](#troubleshooting).

## Platform support notes

- **Node.js 20+** (see [How this was verified](#how-this-was-verified) for
  why the floor moved up from 18), any OS. No native build tools required
  by default — see [A note on raknet-native](#a-note-on-raknet-native).
  Node 18 and Node 20 have both reached end-of-life (no more security
  patches); **Node 22 or 24** is recommended for any new deployment.
- Designed for headless/unattended hosting: no GUI, no interactive prompts
  in the default (offline) auth mode.
- Memory-light: no world/chunk model is built or cached, dependencies are
  kept minimal, and the server is asked to stream a small chunk radius
  (`VIEW_DISTANCE`) to keep bandwidth and memory use down.

---

## How this was verified

Being upfront about exactly what "verified" means here, per the standard
this project was reviewed against — no claim below is made without having
actually done it in this environment:

**Actually run and checked:**
- `npm ci` in a clean Node 22.22.2 / npm 10.9.7 environment — installs all
  60 packages successfully, with the `raknet-native → jsp-raknet` override
  confirmed working (no C/C++ compiler invoked, no `.node` native binaries
  produced for that path).
- `node --check` against every file in `src/` — no syntax errors.
- Every module `require()`d in-process, including `bedrock-protocol`
  itself — no load-time crashes.
- The bot run against a deliberately unreachable hostname to observe real
  behavior: the DNS failure surfaces as an `uncaughtException` (not a
  client `error` event — confirmed by reading `bedrock-protocol`'s own
  source, not just observed), gets classified as `NETWORK`, and schedules a
  correctly doubling reconnect delay each attempt.
- `SIGTERM` sent to a running instance mid-reconnect-wait — it cancelled
  the pending timer and exited promptly with no dangling process.
- Config validation exercised both ways: missing/invalid values are
  rejected with a specific, per-field message and a non-zero exit code;
  valid config passes and the process proceeds to connect.
- `bedrock-protocol`'s actual published README/source (not training
  knowledge) checked directly for the supported-version list and the
  `offline` / `raknetBackend` / `connectTimeout` / `skipPing` /
  `viewDistance` client options this project relies on — all confirmed
  accurate as of v3.57.0.
- Wispbyte's own current knowledge-base documentation and independent
  reviews checked directly for its actual server-creation flow and free-tier
  limits, rather than assumed.
- Current Node.js LTS/EOL status checked directly (this is why the
  `engines` floor and the Docker base image changed from the previous
  version of this project).

**Not done, and not claimed:**
- No connection to a real Aternos server or any other live Bedrock/MCPE
  server. This project was reviewed in a sandboxed environment whose
  network access is limited to a small package-registry allowlist (npm,
  GitHub) and does not reach Minecraft or Aternos infrastructure. Nothing
  in this README should be read as "confirmed working against a live
  server" — the reconnect/backoff/shutdown *mechanics* are verified; a real
  handshake with your specific server is not, and can't be, from here.
- The `Dockerfile` was not built or run — there is no Docker daemon in this
  environment. It was hand-verified line by line against the real, tested
  project structure (every `COPY` source path, the entry point, the base
  image tag) instead.
- No Wispbyte server was actually created or deployed to.

If you hit something this project claims should work and it doesn't on
your actual server, that gap is exactly what the sandbox above couldn't
catch — please treat the [Troubleshooting](#troubleshooting) section as the
starting point, not a guarantee.

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
configured registry) the first time, **and needs a working Node.js/npm
installation on whatever machine or container you run it in** — if you're
seeing `npm: command not found`, that's what's missing; jump to
[Troubleshooting](#npm-command-not-found) or
[Running with Docker](#running-with-docker).

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
This was confirmed by actually running `npm ci` and inspecting the result:
no compiler is invoked and no native `.node` binary is produced for this
path (see [How this was verified](#how-this-was-verified) — this is a
statement about the *install*, not about a completed connection to a live
server). If you're deploying somewhere you know has a working C++ build
toolchain and want the native backend's extra performance, you can remove
the `overrides` block and set `RAKNET_BACKEND=raknet-native` instead — just
know that `npm install` will then need to compile it.

---

## Running with Docker

A [`Dockerfile`](./Dockerfile) is included so this project can run anywhere
that accepts a container image — a VPS, Railway, Fly.io, Render, your own
machine for local testing, or a hosting panel that accepts a custom image
rather than picking from preset stacks. (For Wispbyte's own free/standard
flow specifically, see [Deploying on Wispbyte](#deploying-on-wispbyte) —
Wispbyte has you pick a pre-built Node.js image from its panel rather than
building this file yourself, but this `Dockerfile` still defines exactly
what that image needs to contain.)

```bash
# Build
docker build -t bedrock-afk-bot .

# Configure
cp .env.example .env   # then edit .env

# Run
docker run --rm --env-file .env bedrock-afk-bot

# Only needed if you set HEALTH_CHECK_ENABLED=true and want to reach the
# health endpoint from outside the container:
docker run --rm --env-file .env -p 3000:3000 bedrock-afk-bot
```

`docker stop` sends `SIGTERM` by default. The image runs `node
src/index.js` directly as the container's PID 1 (not `npm start`)
specifically so that signal reaches the process straight away, and this
project's graceful-shutdown handling (see [How reconnect
works](#how-reconnect-works)) gets a clean chance to run instead of the
container being killed outright after Docker's grace period.

The image is a multi-stage build: dependencies are installed with `npm ci`
(driven entirely by `package-lock.json`, for a reproducible install — see
[Verification requirements](#how-this-was-verified)) in one stage, then only
`node_modules` and the application source are copied into the final image,
running as the non-root `node` user. It was **not** built or run in this
environment (no Docker daemon here) — see [How this was
verified](#how-this-was-verified) for exactly what was and wasn't checked.

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
anything is missing or invalid, it prints every problem it found —
including the actual value it received, not just the rule that was broken
— and exits without attempting a connection.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `SERVER_HOST` | *(required)* | Bedrock server hostname or IP, e.g. `example.aternos.me`. No `http://`, no port. |
| `BOT_USERNAME` | `AFKBot` | Display name the bot connects as. |
| `SERVER_PORT` | `19132` | Bedrock's default port (not Java's 25565). Aternos shows the correct port on your server's dashboard. |
| `BEDROCK_VERSION` | `1.26.30` | Protocol version to speak. See [Troubleshooting](#version-mismatch) if you get a version-mismatch disconnect. |
| `AUTH_OFFLINE` | `true` | `true` = offline-style connection (no Microsoft sign-in). `false` = real Xbox Live/Microsoft login. See [Authentication modes](#authentication-modes). |
| `CONNECT_TIMEOUT_MS` | `9000` | How long to wait for a connection attempt before giving up. |
| `VIEW_DISTANCE` | `4` | Chunk radius requested from the server. Lower = less memory/bandwidth. |
| `RAKNET_BACKEND` | `jsp-raknet` | `jsp-raknet` (pure JS, portable) / `raknet-native` (faster, needs a build toolchain) / `raknet-node` (prebuilt native binary, no compiler needed, but platform-specific). |
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
  [Aternos setup](#using-it-with-aternos-bedrockmcpe) below. Under the
  hood, a Bedrock Dedicated Server's equivalent of Java's `online-mode` is
  an `xbox-auth` setting — different property name, same idea.
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
at that point.

**Crash-loop guard.** Some low-level network failures (like an unresolvable
hostname) surface outside the normal per-connection error events, as
uncaught exceptions rather than a client `error`/`kick`/`close` event (see
[Limitations](#limitations), and [How this was verified](#how-this-was-verified)
for how this was confirmed against the library's actual source). The bot
catches these too and routes them through the same reconnect logic — but
also counts them separately: if 8 of them happen within a 60-second sliding
window, that's treated as something more seriously broken than a flaky
connection, and the bot exits for the host's process supervisor to restart
it cleanly rather than looping forever in a possibly-bad state. This
threshold was checked against the reconnect math specifically so that a
merely fast (but legitimate) `RECONNECT_BASE_DELAY_MS` doesn't trip it by
accident — only much tighter loops (near-zero delay between failures) do.

Timers for anti-AFK and chat heartbeat are always torn down before a
reconnect attempt starts, so you never end up with duplicate intervals
piling up across reconnects.

---

## Deploying on Wispbyte

Wispbyte runs every server in its own Docker container and has you pick
which container image to use per server — Node.js, Bun, Python, Java, C#,
Rust, Lua, or a database image (this is documented directly in Wispbyte's
own knowledge base; see [How this was verified](#how-this-was-verified)).
**`npm: command not found` means the container currently backing your
server has no Node.js/npm in it at all** — almost always because a
non-Node.js image, or a "Predefined Project" template meant for something
else, was selected. No amount of editing this project's files can fix that
by itself; it has to be corrected in the panel. Here's the full flow:

### 1. Use a Node.js image

- **New server:** when creating it, under *Choose a Docker image for your
  stack*, pick **Node.js** — not Bun, Python, Java, C#, Rust, Lua, or a
  database image, and not a Predefined Project template unless you're sure
  it's Node.js-based.
- **Existing server showing `npm: command not found`:** open it in the
  client panel and find where the Docker image/stack is set (check the
  server's *Startup* tab and general settings). Switch it to **Node.js**.
  If a version is offered, prefer **Node 22 or newer** — Node 18 and 20
  have both reached end-of-life. If there's no way to change an existing
  server's image from the panel, recreate the server with the correct image
  chosen from the start.

### 2. Upload the project

Server → **Files**, and upload this project so `package.json` and `src/`
land in the server's root directory (SFTP is available on premium plans).

### 3. Set the startup command

Server → **Startup**:

```
npm ci --omit=dev && npm start
```

This installs dependencies from `package-lock.json` — reproducible, see
[A note on raknet-native](#a-note-on-raknet-native) — every time the server
starts, then runs the bot. If `npm ci` ever fails because `package.json`
was hand-edited without updating the lockfile, use `npm install --omit=dev
&& npm start` instead as a fallback, then regenerate a matching lockfile
with a local `npm install` afterward. If your panel has a separate
install/packages field apart from the startup command, put the install half
there instead and leave the startup command as `npm start` — either layout
works, as long as install happens before start in a container that actually
has npm.

### 4. Set environment variables

Server → **Variables**: set at minimum `SERVER_HOST` and `BOT_USERNAME`,
plus anything else from the [environment variable
table](#environment-variables) you want to change.

### 5. Start it and read the console

You should see the startup banner, then a connection attempt, then either
`Bot has spawned` or a specific, categorized error — see
[Troubleshooting](#troubleshooting). If you see `npm: command not found`
again, the image still isn't Node.js; go back to step 1.

### Free-tier notes

From Wispbyte's own current documentation and independent reviews (check
your dashboard — specifics can change):

- The free tier is commonly around **512 MB RAM / 1 GB storage / 1 vCPU**.
  This bot's footprint is small and it builds no world/chunk model, so idle
  memory use should stay well under that — avoid a high `VIEW_DISTANCE` or
  running several instances in one container.
- Free servers reportedly need a client-panel login periodically (Wispbyte
  states at least monthly) to avoid being archived. That's about your
  Wispbyte *account* staying active, separate from the bot's own uptime
  once it's running.
- If the process crashes from something genuinely unexpected it exits
  rather than limping along (see [How reconnect works](#how-reconnect-works))
  — make sure the panel's auto-restart-on-crash behavior is left on.
- Prefer a **custom Docker image** on Wispbyte or elsewhere? See [Running
  with Docker](#running-with-docker) — this project ships a `Dockerfile`
  that defines the exact same runtime explicitly.

---

## Using it with Aternos Bedrock/MCPE

1. When creating your Aternos server, choose **Bedrock Edition** (or set up
   Java + GeyserMC/Floodgate if you specifically want a Java world reachable
   by Bedrock clients — that's a different setup and outside the scope of
   this bot, which speaks native Bedrock protocol).
2. Note the exact **host** and **port** shown on your Aternos dashboard once
   the server is running — Aternos assigns a specific port per server, and
   it's rarely the default `19132`. Put these in `SERVER_HOST` /
   `SERVER_PORT`. See [Aternos address/port
   mistakes](#aternos-bedrock-addressport-mistakes) for the most common
   ways this goes wrong.
3. **Authentication:** by default, Aternos's Bedrock servers require a real
   Xbox Live/Microsoft sign-in for every connecting player, the same as
   connecting from a real console or the Bedrock launcher — this bot cannot
   bypass that. Aternos exposes a **Cracked** toggle on the server's
   Options page that switches this off (the same toggle Aternos uses for
   Java's `online-mode`; on the Bedrock side it maps to the server's
   `xbox-auth` setting). If you want the bot to connect without a Microsoft
   account (`AUTH_OFFLINE=true`, the default here), enable **Cracked**.
   Aternos's exact wording can change over time, so check your dashboard
   directly. If you'd rather keep the server in normal Xbox Live mode, set
   `AUTH_OFFLINE=false` instead and complete the one-time device sign-in
   described in [Authentication modes](#authentication-modes). Note: if
   you're using premium/authenticated accounts and Cracked is enabled
   anyway, that mismatch itself can cause auth errors — disable Cracked in
   that case.
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

### `npm: command not found`

This is an environment problem, not something in this project's code — it
means whatever is trying to run `npm install`/`npm start` has no Node.js
runtime in it at all. Node.js always ships `npm` together with `node`; you
cannot have one without the other from an official install, so if `npm` is
missing, `node` almost certainly is too.

- **On Wispbyte:** see [Deploying on Wispbyte](#deploying-on-wispbyte) in
  full — the fix is selecting the **Node.js** Docker image for the server,
  not a code change.
- **On any other host:** confirm the runtime actually has Node.js — run
  `node -v && npm -v` in the same shell/container context your startup
  command runs in. If that fails too, you're not in a Node.js environment
  and need to switch to one (a Node.js buildpack/preset, a Node.js Docker
  image, or this project's own [`Dockerfile`](#running-with-docker)).
- **Never** work around this by removing `npm install`/`npm ci` from the
  startup sequence — that doesn't fix the missing runtime, it just fails
  later and less clearly, at `require('bedrock-protocol')` or
  `require('dotenv')` instead, with `Cannot find module`.

### Version mismatch

If the server disconnects the bot with a message mentioning an outdated or
incompatible client, set `BEDROCK_VERSION` to the version your server
actually runs. The bot supports 1.16.201 through 1.26.30 (see [Supported
Minecraft version range](#supported-minecraft-version-range) for the full
list); if your server is outside that range, this bot's protocol library
doesn't support it yet.

### Connection refused / timeout

Bedrock runs over UDP, which doesn't have a Java-style instant "connection
refused" — an unreachable server almost always shows up as a **timeout**
after `CONNECT_TIMEOUT_MS`, logged with category `NETWORK`. Check:
- `SERVER_PORT` matches exactly what Aternos shows (not the default 19132
  unless that's genuinely what's listed).
- The server is actually started (not just the Aternos *panel* being open).
- No firewall between the bot's host and the server is blocking outbound
  UDP.

### Auth failure

If `AUTH_OFFLINE=true` and the server still rejects the connection citing
authentication, the server most likely isn't in offline/Cracked mode — see
[Using it with Aternos Bedrock/MCPE](#using-it-with-aternos-bedrockmcpe). If
`AUTH_OFFLINE=false`, make sure you completed the device sign-in flow shown
in the logs.

### Aternos Bedrock address/port mistakes

The most common ways this specifically goes wrong on Aternos:
- **Pasting the whole "Connect" string into `SERVER_HOST`.** Aternos shows
  something like `myserver.aternos.me:34567` on the dashboard — that's
  host **and** port together. `SERVER_HOST` must be just
  `myserver.aternos.me`; the number after the colon goes in `SERVER_PORT`
  (`34567` in this example), not left attached to the host.
- **Reusing the Java port.** If you (or a previous setup) also runs a Java
  Edition server on the same Aternos account, its port is unrelated —
  Bedrock gets its own separate port. Always read the port from the
  Bedrock server's own dashboard page.
- **Assuming the port is always `19132`.** That's Bedrock's *default*
  port, but Aternos assigns a specific port per server on its shared
  infrastructure, and it's rarely the default. Re-check the dashboard each
  time the server restarts if you're not on a plan with a fixed port.
- **A leading/trailing space or stray quote** pasted from the dashboard
  into a panel's env-var field. This project strips one layer of matching
  quotes automatically, but stray spaces in the *host* itself will make
  `SERVER_HOST` fail validation — the error message now shows exactly what
  value it received, so compare it character-for-character against the
  dashboard.

### `npm install` fails while building `raknet-native`

This project's `package.json` already routes around this (see
[A note on `raknet-native`](#a-note-on-raknet-native)). If you've modified
the `overrides` block and hit a native build failure, either restore it or
run `npm install --ignore-scripts` and keep `RAKNET_BACKEND=jsp-raknet`.

### Bot connects but keeps getting kicked for being idle anyway

Lower `ANTI_AFK_INTERVAL_MS` (send pulses more often) or switch
`ANTI_AFK_MODE` to `walk`. Some servers run their own AFK-detection plugins
with different rules than vanilla Minecraft; check the server's own
plugin/config list if `walk` mode doesn't help.

### Nothing happens / process exits immediately

That's almost always a config validation failure — the bot prints every
problem it found, including the actual value it received for each one, and
exits before connecting. Read the printed list; it names the exact
environment variable or config field to fix.

### A `DeprecationWarning` about `punycode` shows up in the logs

This comes from a dependency several layers down inside `bedrock-protocol`
(via `prismarine-realms` → `node-fetch@2` → `whatwg-url`), not from this
project's own code, and was confirmed present even on a clean, correct
install during review. It's a Node.js platform warning, not an error — the
bot runs normally either way. It'll go away on its own once that part of
the dependency chain is updated upstream.

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
- **Some low-level errors (like a bad hostname) surface as uncaught
  exceptions**, not the normal client `error`/`kick`/`close` events. The
  bot catches these at the process level and routes them through the same
  reconnect logic (see [How reconnect works](#how-reconnect-works)), with a
  crash-loop safety net underneath that.
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
  index.js                 Entry point: config, logging, lifecycle, signals
  config.js                Loads + merges + validates config (defaults/json/env)
  logger.js                Structured, timestamped logger
  bot.js                   bedrock-protocol client lifecycle and event wiring
  reconnect.js             Backoff/jitter + disconnect-reason classification
  health.js                Optional minimal HTTP status endpoint
  actions/
    antiAfk.js              Movement/rotation anti-idle loop
    chatHeartbeat.js         Optional periodic chat message
  utils/
    validation.js             Config validation helpers
Dockerfile               Multi-stage Node 22 image (see Running with Docker)
.dockerignore            Keeps secrets/node_modules out of the build context
config.example.json      Example JSON config
.env.example             Example environment variables
package.json
package-lock.json
LICENSE
```

## License

MIT — see [`LICENSE`](./LICENSE). Rebuilt from the original
`nuekkis/Minecraft-AFK-Bot` project under the same license.
