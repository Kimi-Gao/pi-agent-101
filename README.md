# pi-agent-101

**[English]** | [中文](https://github.com/Kimi-Gao/pi-agent-101/blob/cn/README.md)

An incremental tutorial project for building an Electron desktop pi agent chat application on top of the pi SDK.

Final goal: a double-clickable, native Electron desktop chat application. The curriculum is split into two blocks: **Browser Era** (day1-day2, pure Web UI in browser) and **Desktop Agent Era** (day3-day14, Electron desktop app). From day3 onward we refactor with Electron, progressively layering Web UI + Claude Code features; Electron-native capabilities — IPC+preload (day4) / Notification (day8) / dialog (day12) / Menu + `protocol.handle` (day14) — land on the day that needs them, turning the day2 browser Web UI into a real desktop app.

## Roadmap

### Browser Era: Web UI in browser (day1-day2)

> These two days build the "chat with the agent in a browser" path. All protocols are standard web tech (HTTP / SSE); just open a browser and it runs.

| Day | Status | Goal | Key skill / pi SDK capability |
| --- | --- | --- | --- |
| [**day1**](./day1/) | ✅ | CLI REPL minimum viable chat | `createAgentSession`, `subscribe`, `prompt` |
| [**day2**](./day2/) | ✅ | Web UI minimum viable version (single session + SSE streaming) | Node `http` + `EventSource`; server translates `subscribe` events into SSE |

### Desktop Agent Era: Electron-based (day3-day14)

> From day3 onward everything runs inside an Electron desktop app. Internally split into two sub-stages: **A. Refactor with Electron** (day3-day7), **B. Claude Code capability fill-in** (day8-day14).
>
> The big shift from the Browser Era: from day3 we develop entirely under the Electron main / renderer architecture; chat transport gets upgraded from HTTP/SSE to IPC+preload on day4; Notification / dialog / Menu / `protocol.handle` land on whichever day needs them.

#### Stage A: Refactor with Electron (day3-day7)

Refactor the day2 Web UI with Electron; layer on sessions / tools / skills / thinking day by day. day3 is still a `loadURL` shell; once day4's transport upgrade lands, we're running a real native Electron app.

| Day | Status | Goal | Key skill |
| --- | --- | --- | --- |
| day3 | ⬜ | **Electron minimal shell** — `npm start` launches an Electron window that hosts the day2 dev server; first contact with Electron main process / renderer process / `BrowserWindow` | `electron` + `BrowserWindow({ loadURL })`; transport upgrade lands on day4 |
| day4 | ⬜ | Multi-session management + **transport upgrade** — sidebar + new/switch/delete sessions; HTTP/SSE deleted, main process owns the pi session directly, renderer talks to it via `contextBridge`-exposed `pi.prompt()` / `pi.on('text_delta', ...)` | `createAgentSessionRuntime`, `runtime.newSession` / `switchSession` + `ipcMain.handle` / `webContents.send` / `contextBridge.exposeInMainWorld` |
| day5 | ⬜ | Tool call visualization (one collapsible card per tool call) | `tool_execution_start` / `_update` / `_end` events |
| day6 | ⬜ | Skills panel + custom tool buttons | `DefaultResourceLoader({ skillsOverride })` + `defineTool` |
| day7 | ⬜ | Thinking visualization + tool human-in-the-loop + persistence | `thinking_delta` event + event interception + `SessionManager.create` |

#### Stage B: Claude Code capability fill-in (day8-day14)

> Pi's official docs explicitly state it **intentionally does not include** built-in MCP, Sub-agent, permission popups, or Plan Mode. These capabilities must be built via the extension mechanism or installed from third-party packages.
> Quote: `docs/usage.md:304` — "It intentionally does not include built-in MCP, sub-agents, permission popups, plan mode..."

Each capability follows: read the official pi extension example → understand how it works → land it in our Electron app. Each day also lands whatever Electron-native capability it needs.

| Day | Status | Goal | Key skill / pi SDK capability |
| --- | --- | --- | --- |
| day8 | ⬜ | Tool permission approval system (human-in-the-loop) + **Notification** system notifications | Intercept `tool_execution_start`; frontend pops a confirmation dialog; server suspends until the user decides. See `examples/extensions/permission-gate.ts` + `Notification` |
| day9 | ⬜ | MCP integration (external tool protocol) | `extensionFactories` + MCP server; tools auto-register into session. Frontend lists MCP tools in the tools panel |
| day10 | ⬜ | Sub-agent (Task tool + nested session) | Custom `task` tool; internally calls `createAgentSession` to spawn a child session; bubble child events up to parent. See `examples/extensions/subagent/` |
| day11 | ⬜ | Hooks / extension mechanism full mastery | Listen to all events via `pi.on()`; interact with users via `ctx.ui.confirm/notify`; inject messages via `ctx.sendUserMessage` |
| day12 | ⬜ | Session persistence + restore + branching + **dialog file pickers** (import / export) | `SessionManager.create/list/open/continueRecent` + `navigateTree` + `fork` + `dialog.showOpenDialog` / `showSaveDialog` |
| day13 | ⬜ | Compaction (auto-compress long sessions) | `session.compact()` + `SettingsManager`'s `compaction.enabled` / threshold; show compaction events on the frontend |
| day14 | ⬜ | Slash commands + themes + Plan Mode + **native menu bar** + **`protocol.handle('pi-agent://')` deep links** | `promptsOverride` to inject commands; theme files; `Menu.buildFromTemplate` + `protocol.handle` |

## Directory layout

```
pi-agent-101/
├── README.md                ← This file: roadmap
├── day1/                    ← CLI REPL minimum viable chat ([README](./day1/README.md))
│   ├── agent.ts
│   ├── package.json
│   ├── node_modules/        (local dependencies after npm install)
│   └── README.md
├── day2/ ... day14/         ← Each day is an independent directory
```

## How to run

```bash
cd day1
npm install   # one-time install of @earendil-works/pi-coding-agent
npm start     # node --experimental-strip-types agent.ts
```

See [day1 README](./day1/README.md) for details.

## Conventions

- Each day is self-contained with its own `package.json` / `node_modules` / `README.md`, runnable and reviewable in isolation
- All comments and documentation are in English; code itself (variable names, imports, string literals) stays in English
- Single responsibility: each day lights up 1-2 new capabilities without introducing ahead-of-time concepts
- No extra dependencies: Node 24 enables `--experimental-strip-types` by default, no tsx/bundler needed