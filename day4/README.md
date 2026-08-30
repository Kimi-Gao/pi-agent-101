# day4: Multi-session management (Electron + createAgentSessionRuntime)

This directory is **day4** of the `pi-agent-101` project — Basic Agent's first stop: extend the day3 single-session Electron app to multi-session.
For the full roadmap see the root [README.md](../README.md); previous: [day3](../day3/README.md).

## Why

Day3 has a single `createAgentSession` instance for the whole day — all prompts go to the same session, sharing one history. Real usage needs multiple independent sessions: debug one over here, open a fresh thread over there; switching must not lose history.

Day4 uses the SDK's `AgentSessionRuntime` to take over session lifecycle:

- `runtime.newSession()` — create a new session (runtime creates a fresh AgentSession internally)
- `runtime.switchSession(id)` — switch to the session with the given id
- `runtime.session` — the current session; all prompts / event subscriptions go through it

**Subscriptions must be re-attached** to the new session after switching (subscriptions are tied to a specific AgentSession), so `subscribeCurrentSession()` runs again after every newSession / switchSession.

## Run

Requires Node ≥ 22.6 and **Electron ≥ 34** (this directory pins `^44.0.0`, the current stable). Electron 34+ bundles Node 22.11+, which supports the `--experimental-strip-types` flag — so `electron-main.ts` / `preload.ts` can be loaded directly by Electron without tsx or a build step.

`npm install` downloads the Electron binary (~200 MB) from GitHub's releases CDN. The `electron` package is lazy: the binary only downloads on the first `require('electron')`, **spawned as a plain Node child process** — `npm_config_*` env vars don't reach it, so `.npmrc` redirection is a no-op in this scenario. To avoid the default CDN hanging with `socket hang up` on flaky networks, `package.json` adds a project-level `postinstall` hook (`scripts/ensure-electron-binary.cjs`) that explicitly exports `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` before re-running Electron's install script. npmmirror serves bit-for-bit copies of the official binaries and is reliable on mainland-China networks.

```bash
cd day4
npm install     # install electron + @earendil-works/pi-coding-agent
npm start       # electron --experimental-strip-types .
```

A desktop window pops up:

- Left: session list (click a row to switch, click `+ New session` to create)
- Right: chat area for the current session

Every message goes over IPC to the main process, which calls `runtime.session.prompt()`; session events are pushed back via `webContents.send`.

## Files

```
day4/
├── package.json
├── electron-main.ts   ← Main process: createAgentSessionRuntime + session list + IPC
├── preload.ts          ← contextBridge: window.pi.* API (with multi-session methods)
├── index.html          ← Sidebar + chat area layout
├── chat.js             ← Renderer logic: list rendering / session switching / chat stream
└── README.md
```

## Compared with day3

| | day3 (single session) | day4 (multi-session) |
| --- | --- | --- |
| Session management | `createAgentSession` | `createAgentSessionRuntime` + runtime |
| IPC `pi:prompt` | calls `session.prompt(text)` | calls `runtime.session.prompt(text)` |
| Session list | (none) | `sessions` array (main-maintained) + `pi:list-sessions` / `pi:new-session` / `pi:switch-session` |
| Event subscriptions | Once at startup | Re-subscribed after every session switch |
| Renderer UI | Single chat page | Sidebar + chat area |

## Multi-session IPC channels

| Channel | Direction | Purpose | Mode |
| --- | --- | --- | --- |
| `pi:prompt` | renderer → main | Prompt the current session | request/response |
| `pi:list-sessions` | renderer → main | Get session list | request/response |
| `pi:new-session` | renderer → main | Create new session and switch to it | request/response |
| `pi:switch-session` | renderer → main | Switch to session by id | request/response |
| `pi:text_delta` / `pi:tool_start` / `pi:agent_end` | main → renderer | Current session event push | push |
| `pi:sessions-changed` | main → renderer | Session list changed (after new-session) | push |
| `pi:current-session` | main → renderer | Current session switched | push |

## Next

Move on to **day5: tool call visualization**. In addition to `text_delta`, the SDK pushes `tool_execution_update` / `_end` events from `session.subscribe()` — translate them into frontend collapsible cards (tool name + args + running... + result), so the user can watch the agent "doing" things.