# pi-agent-101

**[English]** | [中文](https://github.com/Kimi-Gao/pi-agent-101/blob/cn/README.md)

An incremental tutorial project for building an Electron desktop pi agent chat application on top of the pi SDK.

Final goal: a double-clickable, native Electron desktop chat application. The curriculum is split into three stages by agent capability: **Agent fundamentals** — three forms of an agent: CLI / Web / Desktop; **Basic Agent** — one foundational capability per day, including multi-session; **Advanced Agent** — Claude Code parity plus Electron-native capability fill-in. From day3 onward we develop entirely under the Electron main / renderer architecture; chat transport goes straight to native IPC+preload (no `loadURL` shell phase); Notification / dialog / Menu / `protocol.handle` land on whichever day needs them.

## Roadmap

### Agent fundamentals

> Understand what an agent is, how it runs, and its three basic forms: CLI / Web UI / Desktop Agent.

| Day | Status | Goal | Key skill / pi SDK capability |
| --- | --- | --- | --- |
| [**day1**](./day1/) | ✅ | CLI REPL minimum viable chat | `createAgentSession`, `subscribe`, `prompt` |
| [**day2**](./day2/) | ✅ | Web UI minimum viable version (single session + SSE streaming) | Node `http` + `EventSource`; server translates `subscribe` events into SSE |
| [**day3**](./day3/) | ⬜ | **Desktop Agent kickoff** (single-session shape) — first contact with Electron: single session (mirrors day2) + **native IPC transport**: HTTP/SSE deleted, main process owns the pi session directly, renderer talks to it via `contextBridge`-exposed `pi.prompt()` / `pi.on('text_delta', ...)` | `electron` + `ipcMain.handle` / `webContents.send` / `contextBridge.exposeInMainWorld` + `createAgentSession` |

### Basic Agent

> On top of day3's single-session Electron app, light up foundational capabilities one day at a time.

| Day | Status | Goal | Key skill / pi SDK capability |
| --- | --- | --- | --- |
| [**day4**](./day4/) | ⬜ | **Multi-session management** — plug `createAgentSessionRuntime` into day3's single-session Electron app; sidebar + new / switch sessions, each with its own history; re-attach event subscriptions after switching | `createAgentSessionRuntime` + `runtime.newSession` / `switchSession` |
| day5 | ⬜ | Tool call visualization (one collapsible card per tool call) | `tool_execution_start` / `_update` / `_end` events |
| day6 | ⬜ | Skills panel + custom tool buttons | `DefaultResourceLoader({ skillsOverride })` + `defineTool` |
| day7 | ⬜ | Thinking visualization + basic tool human-in-the-loop approval | `thinking_delta` event + event interception |
| day8 | ⬜ | Persistence (basic) — SessionManager persists sessions to disk; resumption after restart | `SessionManager.create` |

### Advanced Agent

> Reach Claude Code parity: MCP, Sub-agent, Hooks, Compaction, Slash + Plan Mode; plus Electron-native capability fill-in (Notification / dialog / Menu / `protocol.handle`).

| Day | Status | Goal | Key skill / pi SDK capability |
| --- | --- | --- | --- |
| day9 | ⬜ | Tool permission approval system (human-in-the-loop) + **Notification** system notifications | Intercept `tool_execution_start`; frontend pops a confirmation dialog; server suspends until the user decides. See `examples/extensions/permission-gate.ts` + `Notification` |
| day10 | ⬜ | MCP integration (external tool protocol) | `extensionFactories` + MCP server; tools auto-register into session. Frontend lists MCP tools in the tools panel |
| day11 | ⬜ | Sub-agent (Task tool + nested session) | Custom `task` tool; internally calls `createAgentSession` to spawn a child session; bubble child events up to parent. See `examples/extensions/subagent/` |
| day12 | ⬜ | Hooks / extension mechanism full mastery | Listen to all events via `pi.on()`; interact with users via `ctx.ui.confirm/notify`; inject messages via `ctx.sendUserMessage` |
| day13 | ⬜ | Session restore + branching + **dialog file pickers** (import / export) | `SessionManager.list/open/continueRecent` + `navigateTree` + `fork` + `dialog.showOpenDialog` / `showSaveDialog` |
| day14 | ⬜ | Compaction (auto-compress long sessions) | `session.compact()` + `SettingsManager`'s `compaction.enabled` / threshold; show compaction events on the frontend |
| day15 | ⬜ | Slash commands + themes + Plan Mode + **native menu bar** + **`protocol.handle('pi-agent://')` deep links** | `promptsOverride` to inject commands; theme files; `Menu.buildFromTemplate` + `protocol.handle` |

## Directory layout

```
pi-agent-101/
├── README.md                ← This file: roadmap
├── day1/                    ← CLI REPL minimum viable chat ([README](./day1/README.md))
│   ├── agent.ts
│   ├── package.json
│   ├── node_modules/        (local dependencies after npm install)
│   └── README.md
├── day2/ ... day15/         ← Each day is an independent directory
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