# pi-agent-101

**[English]** | [中文](https://github.com/Kimi-Gao/pi-agent-101/blob/cn/README.md)

An incremental tutorial project for building a Web UI Agent chat box on top of the pi SDK.

Final goal: a Web UI where you can chat with an agent in the browser, trigger skills, visualize tool calls, and gain Claude Code-equivalent features (permission approvals / MCP / Sub-agent).

## Roadmap

### Track 1: Basics (from zero to a working Web UI)

Goal: start from the command line, incrementally evolve into a Web UI you can chat with in the browser.

| Day | Status | Goal | Key skill / pi SDK capability |
| --- | --- | --- | --- |
| [**day1**](./day1/) | ✅ | CLI REPL minimum viable chat | `createAgentSession`, `subscribe`, `prompt` |
| day2 | ✅ | Web UI minimum viable version (single session + SSE streaming) | Node `http` + `EventSource`; server translates `subscribe` events into SSE |
| day3 | ✅ | Multi-session management (sidebar + new/switch/delete sessions) | `createAgentSessionRuntime`, `runtime.newSession` / `switchSession` |
| day4 | ⬜ | Tool call visualization (one collapsible card per tool call) | `tool_execution_start` / `_update` / `_end` events |
| day5 | ⬜ | Skills panel + custom tool buttons | `DefaultResourceLoader({ skillsOverride })` + `defineTool` |
| day6 | ⬜ | Thinking visualization + tool human-in-the-loop + persistence | `thinking_delta` event + event interception + `SessionManager.create` |

### Track 2: Advanced (Claude Code-equivalent features)

> Pi's official docs explicitly state it **intentionally does not include** built-in MCP, Sub-agent, permission popups, or Plan Mode. These capabilities must be built via the extension mechanism or installed from third-party packages.
> Quote: `docs/usage.md:304` — "It intentionally does not include built-in MCP, sub-agents, permission popups, plan mode..."

Each capability in Track 2 follows: read the official pi extension example → understand how it works → land it in our Web UI.

| Day | Status | Goal | Key skill / pi SDK capability |
| --- | --- | --- | --- |
| day7 | ⬜ | Tool permission approval system (human-in-the-loop) | Intercept `tool_execution_start`; frontend pops a confirmation dialog; server suspends until the user decides. See `examples/extensions/permission-gate.ts` |
| day8 | ⬜ | MCP integration (external tool protocol) | `extensionFactories` + MCP server; tools auto-register into session. Frontend lists MCP tools in the tools panel |
| day9 | ⬜ | Sub-agent (Task tool + nested session) | Custom `task` tool; internally calls `createAgentSession` to spawn a child session; bubble child events up to parent. See `examples/extensions/subagent/` |
| day10 | ⬜ | Hooks / extension mechanism full mastery | Listen to all events via `pi.on()`; interact with users via `ctx.ui.confirm/notify`; inject messages via `ctx.sendUserMessage` |
| day11 | ⬜ | Session persistence + restore + branching | `SessionManager.create/list/open/continueRecent` + `navigateTree` + `fork` |
| day12 | ⬜ | Compaction (auto-compress long sessions) | `session.compact()` + `SettingsManager`'s `compaction.enabled` / threshold; show compaction events on the frontend |
| day13 | ⬜ | Slash commands + themes + Plan Mode | `promptsOverride` to inject commands; theme files; see `examples/extensions/plan-mode/` for self-implementation |

## Directory layout

```
pi-agent-101/
├── README.md                ← This file: roadmap
├── day1/                    ← CLI REPL minimum viable chat ([README](./day1/README.md))
│   ├── agent.ts
│   ├── package.json
│   ├── node_modules/        (local dependencies after npm install)
│   └── README.md
├── day2/ ... day13/         ← Each day is an independent directory
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