# pi-agent-101

**[English]** | [中文](https://github.com/Kimi-Gao/pi-agent-101/blob/cn/README.md)

An incremental tutorial project for building an Electron desktop pi agent chat application on top of the pi SDK.

Final goal: a double-clickable, native Electron desktop chat application. The curriculum is split into two blocks: **Browser Era** (day1-day2, pure Web UI in browser) and **Desktop Agent Era** (day3-day16, Electron desktop app). The final product is a native Electron app — Stage C (day15+) replaces HTTP/SSE with IPC + preload (contextBridge) and adds dialogs / native menu / `protocol.handle` custom schemes — capabilities only Electron can give you.

## Roadmap

### Browser Era: Web UI in browser (day1-day2)

> These two days build the "chat with the agent in a browser" path. All protocols are standard web tech (HTTP / SSE); just open a browser and it runs.

| Day | Status | Goal | Key skill / pi SDK capability |
| --- | --- | --- | --- |
| [**day1**](./day1/) | ✅ | CLI REPL minimum viable chat | `createAgentSession`, `subscribe`, `prompt` |
| [**day2**](./day2/) | ✅ | Web UI minimum viable version (single session + SSE streaming) | Node `http` + `EventSource`; server translates `subscribe` events into SSE |

### Desktop Agent Era: Electron-based (day3-day16)

> From day3 onward everything runs inside an Electron desktop app. Internally split into three sub-stages: **A. Refactor with Electron** (day3-day7), **B. Claude Code capability fill-in** (day8-day14), **C. Electron native** (day15-day16).

#### Stage A: Refactor with Electron (day3-day7)

Refactor the day2 Web UI with Electron; layer on sessions / tools / skills / thinking day by day. This stage still uses HTTP/SSE on the protocol layer, but the app shape has shifted from Web UI to Electron desktop app.

| Day | Status | Goal | Key skill |
| --- | --- | --- | --- |
| day3 | ⬜ | **Electron minimal shell** — `npm start` launches an Electron window that hosts the day2 dev server; first contact with Electron main process / renderer process / `BrowserWindow` | `electron` + `BrowserWindow({ loadURL })`; IPC + preload arrives in Stage C |
| day4 | ⬜ | Multi-session management (sidebar + new/switch/delete sessions) | `createAgentSessionRuntime`, `runtime.newSession` / `switchSession` |
| day5 | ⬜ | Tool call visualization (one collapsible card per tool call) | `tool_execution_start` / `_update` / `_end` events |
| day6 | ⬜ | Skills panel + custom tool buttons | `DefaultResourceLoader({ skillsOverride })` + `defineTool` |
| day7 | ⬜ | Thinking visualization + tool human-in-the-loop + persistence | `thinking_delta` event + event interception + `SessionManager.create` |

#### Stage B: Claude Code capability fill-in (day8-day14)

> Pi's official docs explicitly state it **intentionally does not include** built-in MCP, Sub-agent, permission popups, or Plan Mode. These capabilities must be built via the extension mechanism or installed from third-party packages.
> Quote: `docs/usage.md:304` — "It intentionally does not include built-in MCP, sub-agents, permission popups, plan mode..."

Each capability follows: read the official pi extension example → understand how it works → land it in our Electron app.

| Day | Status | Goal | Key skill / pi SDK capability |
| --- | --- | --- | --- |
| day8 | ⬜ | Tool permission approval system (human-in-the-loop) | Intercept `tool_execution_start`; frontend pops a confirmation dialog; server suspends until the user decides. See `examples/extensions/permission-gate.ts` |
| day9 | ⬜ | MCP integration (external tool protocol) | `extensionFactories` + MCP server; tools auto-register into session. Frontend lists MCP tools in the tools panel |
| day10 | ⬜ | Sub-agent (Task tool + nested session) | Custom `task` tool; internally calls `createAgentSession` to spawn a child session; bubble child events up to parent. See `examples/extensions/subagent/` |
| day11 | ⬜ | Hooks / extension mechanism full mastery | Listen to all events via `pi.on()`; interact with users via `ctx.ui.confirm/notify`; inject messages via `ctx.sendUserMessage` |
| day12 | ⬜ | Session persistence + restore + branching | `SessionManager.create/list/open/continueRecent` + `navigateTree` + `fork` |
| day13 | ⬜ | Compaction (auto-compress long sessions) | `session.compact()` + `SettingsManager`'s `compaction.enabled` / threshold; show compaction events on the frontend |
| day14 | ⬜ | Slash commands + themes + Plan Mode | `promptsOverride` to inject commands; theme files; see `examples/extensions/plan-mode/` for self-implementation |

#### Stage C: Electron native (day15-day16)

> Cut the HTTP/SSE "pretend it's a web app" compromises used in Stages A/B; let Electron actually leverage its desktop-app advantages.
> The main process owns the pi session directly, runs Node, calls native APIs, and registers custom protocols; the renderer talks to the main process via IPC + preload (contextBridge).

| Day | Status | Goal | Key skill |
| --- | --- | --- | --- |
| day15 | ⬜ | Electron + IPC + preload — main process owns the pi session; renderer talks to it via `contextBridge`-exposed `pi.prompt()` / `pi.on('text_delta', ...)`; HTTP/SSE deleted | `ipcMain.handle` / `webContents.send` / `contextBridge.exposeInMainWorld` |
| day16 | ⬜ | Native capabilities + custom protocol — file dialogs (export / import sessions), native menu bar, `Notification` system notifications, `protocol.handle('pi-agent://')` for deep links / local resource loading | `dialog.showOpenDialog` / `Menu.buildFromTemplate` / `Notification` / `protocol.handle` |

## Directory layout

```
pi-agent-101/
├── README.md                ← This file: roadmap
├── day1/                    ← CLI REPL minimum viable chat ([README](./day1/README.md))
│   ├── agent.ts
│   ├── package.json
│   ├── node_modules/        (local dependencies after npm install)
│   └── README.md
├── day2/ ... day16/         ← Each day is an independent directory
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