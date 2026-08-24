# day1: CLI REPL minimum viable chat

This directory is `pi-agent-101`'s **day1** — the opening of Track 1.
See the root [README.md](../README.md) for the overall roadmap.

## Why

Goal: use the minimum amount of code to expose the SDK's core calls, so deeper learning and extension can build on a known baseline.

## Run

Requires Node ≥ 22.6 (Node 24 enables `--experimental-strip-types` by default; no tsx or build step needed).

```bash
cd day1
npm install   # install @earendil-works/pi-coding-agent
npm start     # node --experimental-strip-types agent.ts
```

After starting you'll see `[model] xxx/xxx`, then enter the REPL. Type a message to chat; type `exit` to quit.

## Core SDK calls at a glance

Six SDK calls appear in order in `agent.ts`:

| # | Call | Purpose |
| - | ---- | ---- |
| ① | `ModelRuntime.create()` | Load `~/.pi/agent/auth.json` and `models.json`; manage credentials and the model catalog |
| ② | `modelRuntime.getAvailable()` | List models with valid credentials |
| ③ | `createAgentSession({...})` | Create an `AgentSession` (conversation state + tools + LLM loop) |
| ④ | `session.subscribe(cb)` | Subscribe to the event stream (streaming text, tool calls, lifecycle) |
| ⑤ | `session.prompt(text)` | Send a user message and `await` until the turn ends |
| ⑥ | `session.dispose()` | Release event subscriptions and held resources |

## Code skeleton (line-by-line)

```
① ModelRuntime.create()        ←  Load credentials + model catalog
② getAvailable() / pick first  ←  Choose a model
③ createAgentSession()         ←  Assemble a session (tools + manager + model)
④ session.subscribe()          ←  Start listening to events (text / tools / lifecycle)
⑤ REPL loop + session.prompt() ←  Each input sends one message, awaits turn end
⑥ dispose in finally           ←  Release resources
```

## Three event types used in day1

- `message_update`: when `assistantMessageEvent.type === "text_delta"`, this is the LLM's incremental text output — writing it directly to stdout gives a streaming effect
- `tool_execution_start`: fires before a tool is called (day1 tools are all read-only so you won't see side effects, but it shows up in logs)
- `agent_end`: end of a turn (LLM reply + all tool calls + retries complete), used for a newline

Later days use more events: `tool_execution_update` / `tool_execution_end` (day4), `thinking_delta` (day6), `compaction_*` (day12), etc.

## Message stream ordering

In `agent.ts`, `session.prompt(text)` causes the SDK to internally emit a stream of events (multiple `message_update` / `text_delta`s, possibly interleaved with `tool_execution_start`, ending with `agent_end`), and the `subscribe()` callback writes them to the terminal one at a time.

On the surface, the risks look plentiful: events arrive asynchronously, the callback fires repeatedly, and stdout can be written to again after any character is already out. How do we guarantee that streaming text lands on the terminal character by character in the order the LLM emits it — never overwritten, never reordered?

`agent.ts` does no "sorting" of its own. Instead it leans on four mechanisms stacking together so **the ordering problem never gets a chance to arise**.

### ① Single subscribe callback + JS event loop (the key)

```ts
const unsubscribe = session.subscribe((event) => {  // ← only one callback registered
  switch (event.type) {
    case "message_update": {
      const e = event.assistantMessageEvent;
      if (e.type === "text_delta") process.stdout.write(e.delta);
      break;
    }
    // ...
  }
});
```

JavaScript is single-threaded, so the entire `switch` is a **non-interruptible critical section**. Once we enter the `text_delta` branch and run `process.stdout.write(e.delta)`, the callback runs **synchronously to completion**, with no second event callback able to jump in mid-stream. The next `text_delta` can only be dequeued and executed after the current callback returns. Therefore **the order events reach stdout = the order they're consumed = the order the SDK fires them**.

### ② `prompt()` as an `await` barrier — serializing each turn

```ts
process.stdout.write("assistant> ");
await session.prompt(text); // ★ blocks until this turn's agent_end
process.stdout.write("\n");
```

`prompt()` blocks until the turn ends (LLM reply + tool calls + retries) before resolving. The next turn's user input cannot reach `prompt()` before the previous turn's `agent_end` — if the previous turn hasn't finished streaming, it can't be clobbered by the new one.

### ③ stdout / stderr physical isolation

| Source | Sink | Line |
| --- | --- | --- |
| LLM `text_delta` | `process.stdout.write` | 60 |
| Tool log `[tool] xxx` | `process.stderr.write` | 64 |
| Turn-end newline | `process.stderr.write` | 67 |
| Error message | `process.stderr.write` | 89 |
| User prompt `assistant> ` | `process.stdout.write` | 84 |

`text_delta` is the **only** code path that writes to stdout; everything else goes to stderr. Node's stdout and stderr are separated at the fd level, so writes don't block each other and reads don't interleave. Even if `process.stderr.write` jumps in at any moment, it cannot flush out the streaming text on stdout.

> Side note: day1 unified all `console.error` calls into `process.stderr.write(..., "\n")` to standardize newline behavior (whether `console.error` auto-appends a newline in an interactive terminal depends on TTY detection; with a raw stream that ambiguity goes away).

### ④ SDK upstream events are already ordered

`agent.ts` is purely a consumer — it does no sorting. The ordering guarantee actually comes from two things upstream of the SDK:

1. **Streaming token order**: the LLM server pushes tokens in order; the SDK maps each SSE chunk into a `text_delta` event, **preserving arrival order**.
2. **Event-type order**: the SDK's internal event protocol is well-ordered by construction — within one message, no other message's `text_delta` can interleave between its `text_delta`s; `tool_execution_start` only appears between text segments; and finally `agent_end` closes the turn.

The downstream just needs to "consume in arrival order" and is naturally ordered.

### TL;DR

**`agent.ts` doesn't sort. It relies on the combined effect of "a single `subscribe` callback + JS single-threadedness + `await prompt()` serialization + stdout/stderr separation" to make the ordering problem impossible to arise.** The moment someone refactors it to "one callback per event type" or "await another async operation inside `text_delta`", the ordering guarantee breaks right away — a textbook case of "leaning on the language runtime, not on code logic, to maintain an invariant".

## Glossary

Terms in the order they appear in day1 code; a few words from later days are also listed:

| Term | Explanation |
| --- | --- |
| **REPL** | Read-Eval-Print Loop. Reads one line of input, evaluates (executes), prints result, loops. day1's command-line main loop is a classic REPL pattern. |
| **ModelRuntime** | pi SDK's "credential hub + model catalog". Reads `~/.pi/agent/auth.json` and `models.json`, exposes `getAvailable()` / `setRuntimeApiKey()` / `refresh()` etc. |
| **AgentSession** | One complete agent session instance. Contains conversation state, callable tools, current model, and the LLM loop (receive → call tools → return to LLM → repeat → end). |
| **SessionManager** | Session manager. Owns session lifecycle — create / persist / restore / list / delete. day1 uses `SessionManager.inMemory()` to mean no disk, lost on restart. |
| **prompt (verb)** | In LLM context, `session.prompt(text)` means "send this user message to the agent and await the complete turn (including all tool calls and retries)". Not the same as a CLI input prompt. |
| **subscribe** | Subscribe to the session's internal event stream. Streaming output, tool calls, and lifecycle events are all emitted as events; subscribe is the only channel to receive them. |
| **dispose** | Release resources held by the session (event subscriptions, internal state, etc.). Must be called before process exit, or resources may leak. |
| **RPC** | Remote Procedure Call. Not used in day1, but pi SDK ships an RPC mode (`runRpcMode`) that lets other processes talk to the agent over JSON-RPC. May appear in later days. |
| **SSE** | Server-Sent Events, server push. day2 uses Node's built-in `http` with the `text/event-stream` response header to push session events to the browser; the frontend uses `EventSource` to receive. |

## pi monorepo package layout

pi is a layered monorepo; `@earendil-works/pi-coding-agent` is just the top-level "product shell".
Once you understand the split, you'll know "which repo to read / which package to import" for each need.

Repo: <https://github.com/earendil-works/pi/tree/main/packages>

### Dependency graph

```
┌─────────────────────────────────────────────────────────────┐
│  pi-coding-agent   ← CLI / SDK entry, what this repo uses    │
│       │                                                       │
│       ├──► pi-agent-core    Stateful agent (tool exec + event stream) │
│       │         │                                            │
│       │         └──► pi-ai    Unified LLM API (multi-provider adapter)│
│       │                                                        │
│       ├──► pi-protocol   Runtime-neutral protocol schema + CBOR encoding │
│       │       ▲                                              │
│       │       │                                              │
│       └──► pi-client     Remote session client (over pi-protocol) │
│                                                                │
│  pi-tui            Terminal UI framework (differential rendering, no-flicker)│
│  pi-telemetry      Vendor-neutral telemetry contracts + typed schema │
└─────────────────────────────────────────────────────────────┘
```

### Package responsibilities

| Package | Responsibility | When to read it |
| --- | --- | --- |
| **[pi-ai](https://github.com/earendil-works/pi/tree/main/packages/ai)** | Unified LLM API: multi-provider adapter (Anthropic / OpenAI / Gemini / custom…), automatic auth resolution, token & cost tracking, mid-session model switching. Only models that support tool calling are included. | When you want to call an LLM directly (no agent loop) or add a custom provider. |
| **[pi-agent-core](https://github.com/earendil-works/pi/tree/main/packages/agent-core)** | Stateful agent: the `Agent` class handles tool execution + event stream. Built on `pi-ai`; doesn't depend on TUI/CLI. SQLite session backend lives in a separate package `pi-session-backend-sqlite-node`. | When you want to build your own agent framework / directly manipulate `state.messages` / `.tools`. |
| **[pi-protocol](https://github.com/earendil-works/pi/tree/main/packages/protocol)** | Runtime-neutral protocol: message schema, CBOR encoding, length-prefixed byte stream framing. Protocol version 1: 4-byte big-endian length + one CBOR message. | When you implement custom transports (WebSocket / Unix socket / IPC) to run pi remotely. |
| **[pi-tui](https://github.com/earendil-works/pi/tree/main/packages/tui)** | Minimal terminal UI framework: differential rendering, CSI 2026 synchronized output (no-flicker), components like Markdown / Editor / SelectList, Kitty / iTerm2 inline images. | When you build a custom TUI for pi, or reuse its components for another CLI. |
| **[pi-client](https://github.com/earendil-works/pi/tree/main/packages/client)** | Transport-neutral client for remote pi sessions: `PiClient` exchanges length-prefixed CBOR via the `ByteTransport` interface. No Node-specific dependencies. | When your frontend / server needs to connect to a remote pi process. |
| **[pi-telemetry](https://github.com/earendil-works/pi/tree/main/packages/telemetry)** | Vendor-neutral telemetry contracts: `TelemetryContext` / `TelemetrySpan`, serializable schemas, in-memory reference implementation. No exporter; not bound to OpenTelemetry. | When you wire pi into your own observability platform (OpenTelemetry / Sentry / logs). |
| **[pi-coding-agent](https://github.com/earendil-works/pi/tree/main/packages/coding-agent)** | The CLI + SDK that wires the above together: built-in `read` / `bash` / `edit` / `write` tools, session management, extension mechanism, 3 run modes (interactive / print / RPC). | **Default starting point.** This is what `agent.ts` imports. |

### What this tutorial imports

`agent.ts` has only one import line, and it comes entirely from **`pi-coding-agent`**:

```ts
import { createAgentSession, ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";
```

This means:
- `createAgentSession()` internally wires `pi-agent-core` + `pi-ai` + various tools.
- `ModelRuntime` is a thin wrapper over `pi-ai`'s auth resolution + model catalog, plus diagnostic info from the SDK layer.
- `SessionManager` is the SDK-layer session tree manager (fork / branch / persist).

If you only build an "embedded agent", `pi-coding-agent` is enough.
When you need "custom transport / custom UI / your own model catalog", dive into the sub-packages.

## Further reading

Only resources directly relevant to day1 (other capabilities appear in their respective days):

- [docs/sdk.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md) — pi SDK full reference. Reading "Quick Start" and "Core Concepts" is enough to understand all of day1's calls.
- [examples/sdk/01-minimal.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/sdk/01-minimal.ts) — pi's official minimal example, same skeleton as day1 — read them side by side.
- [examples/sdk/05-tools.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/sdk/05-tools.ts) — Tool whitelist and custom tools (`defineTool`). day1 uses the built-in tool portion.
- [examples/sdk/11-sessions.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/sdk/11-sessions.ts) — Session management and persistence. day1 uses `SessionManager.inMemory()`.

## Common extension points

Only changes you can make directly in day1 code that produce an immediate effect:

- **Add bash / edit / write tools**: change `tools: [...]` in `agent.ts` to `["read", "bash", "edit", "write"]` — the agent can then write files and run commands (mind safety).
- **Persist conversations**: change `SessionManager.inMemory()` to `SessionManager.create(process.cwd())` — sessions will be written under `~/.pi/agent/sessions/` and survive restarts.

## Next step

Proceed to **day2: Web UI minimum viable version**. Replace day1's REPL with an HTTP handler; the frontend uses `EventSource` to receive the SSE stream.

See the full roadmap for day2-day6 in the "Track 1" table of the root README.
