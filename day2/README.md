# day2: minimal Web UI (single session + SSE streaming push)

This directory is **day2** of the `pi-agent-101` project — the second stop of the first arc.
See the overall plan in the repo-root [README.md](../README.md); the previous arc is [day1](../day1/README.md).

## Why

The day1 REPL only runs locally and cannot be shared. Swap day1's `process.stdout` for an
HTTP response, and swap readline for a browser form, and you have the most basic Web UI:
you type messages in the browser, and the browser sees the LLM's streaming replies in
real time over **SSE (Server-Sent Events)**.

Day2 has exactly one goal: **light up the "server → browser" streaming channel**. Multi-session
management (day3), tool visualization (day4), and the skills panel (day5) are not yet in scope.

## Run

Requires Node ≥ 22.6 (Node 24 enables `--experimental-strip-types` by default, no tsx or build step needed).

```bash
cd day2
npm install        # install @earendil-works/pi-coding-agent
npm start          # listens on http://localhost:5173 by default
PORT=5174 npm start # custom port
```

Watch stderr on startup:

```
[model] xxx/xxx
[http] listening on http://localhost:5173
[http] open the URL above in a browser to start chatting
```

Open the URL in a browser. Type a message and hit Enter to send; the backend forwards your input
to `session.prompt()`. The LLM's streaming text / tool calls / end-of-turn are all pushed over
SSE to every connected tab.

## Three HTTP routes

`server.ts` spins up a minimal service using Node's native `http` module, with three routes:

| Route | Method | Purpose |
| --- | --- | --- |
| `/` | `GET` | Returns the chat UI (HTML embedded in `server.ts`'s `HTML` template literal) |
| `/api/events` | `GET` | SSE endpoint. Subscribes to session events on connect and writes each one as an SSE frame |
| `/api/prompt` | `POST` | Accepts JSON `{ "text": "..." }`, calls `session.prompt(text)` |

`/api/prompt` returns `409 agent is busy` when the agent's previous turn hasn't finished — day2 is
a single-session version that intentionally does not queue, to keep two requests from scrambling
the same session's event stream.

## Three SDK events → three SSE frames

The SDK events received from `session.subscribe()` are translated into only three SSE frames in day2:

| SDK event | SSE frame | Browser-side handling |
| --- | --- | --- |
| `message_update` with `assistantMessageEvent.type === "text_delta"` | `event: text_delta`<br>`data: {"delta":"…"}` | Append to the last assistant message |
| `tool_execution_start` | `event: tool_start`<br>`data: {"toolName":"…"}` | Create a new gray `[tool] xxx` line |
| `agent_end` | `event: agent_end`<br>`data: {}` | Re-enable the input box, focus it |

SSE frame format (every frame must end with a blank line `\n\n` for the browser to treat it as a complete event):

```
event: text_delta
data: {"delta":"Hello"}

event: agent_end
data: {}

```

Later days will add more: `tool_execution_update` / `tool_execution_end` (day4),
`thinking_delta` (day6), `compaction_*` (day12).

## Code skeleton (line-by-line at a glance)

```
① ModelRuntime.create()              ←  load credentials + model catalog (same as day1)
② getAvailable() / take first model  ←  pick a model (same as day1)
③ createAgentSession()               ←  assemble a single session (same as day1)
④ session.subscribe()                ←  translate events to SSE frames + broadcast to all res
⑤ HTML template literal              ←  chat UI (CSS + EventSource + fetch)
⑥ http.createServer()                ←  three routes: /, /api/events, /api/prompt
⑦ SIGINT/SIGTERM graceful shutdown   ←  end all SSE → unsubscribe → dispose → exit
```

## Three links: server ↔ browser

```
Browser (EventSource)
        │
        │  GET /api/events          ← establish long connection
        ▼
  ┌─────────────┐                ┌──────────────────────┐
  │  http server │  SSE frame      │  session.subscribe() │
  │  subscribers │ ◄──────────── │  (text_delta / tool_ │
  │    (Set)     │   serialize ev.  │   start / agent_end) │
  └─────────────┘                └──────────────────────┘
        ▲                                ▲
        │  res.write(payload)            │
        │                                │ events triggered by LLM loop
        │                                │
        │  fetch POST /api/prompt        │
        │ ───────────────────────────►   │
        │  body: { text: "..." }          │
        │                                │
        │           session.prompt(text) ─┘
```

## Term glossary

Explained in the order they appear in day2 code, plus a few terms you'll meet in later days:

| Term | Explanation |
| --- | --- |
| **SSE** | Server-Sent Events, server push. HTTP long connection + `text/event-stream` response header; the browser uses `EventSource` and auto-reconnects. Simpler than WebSocket: unidirectional, plain HTTP, proxy-friendly. |
| **EventSource** | The browser's native SSE client API. `new EventSource("/api/events")` opens a connection; `addEventListener("event_name", cb)` receives named events; auto-reconnects on disconnect. |
| **CORS** | Cross-Origin Resource Sharing. Same-origin access doesn't need it; if you deploy the chat UI to another domain, you need `Access-Control-Allow-Origin` and friends in `server.ts`. Day2 is same-origin, so no CORS. |
| **Single session** | The whole process shares one `AgentSession`. Every browser tab sees the same conversation history. Multi-session splits apart in day3. |
| **isProcessing** | A mutex. Parallel `session.prompt()` calls would interrupt each other's message streams; day2 uses this boolean to reject concurrency (returns 409) — "at any moment only one user message is in flight" is the minimal correctness guarantee. |
| **SSE comment frame** | A line starting with `:` (e.g. `: connected 1700000000000`). The browser ignores it but it flushes the response headers immediately, so the connection doesn't look "stuck" before the first event. |

## Common extension points

Only listing a few line-level changes you can make directly in day2's code and see the effect immediately:

- **Multi-tab queueing**: swap `isProcessing` for a `Promise` queue, so concurrent tabs get served in order.
- **Persistence**: same as day1 — swap `SessionManager.inMemory()` for `SessionManager.create(process.cwd())`, and the conversation survives a restart.
- **Write tools**: change `tools: [...]` to `["read", "bash", "edit", "write"]`, and the agent can modify your files (mind the safety implications).
- **More events**: add `tool_execution_update` / `_end` / `thinking_delta` in the switch inside `subscribe()`, and add matching `addEventListener` calls on the frontend — this is the entry point for day4 and day6.

## Next

Move on to **day3: multi-session management**. List sessions in the sidebar, click to switch,
create / delete sessions; each session has its own history and LLM loop. In the SDK this is
`createAgentSessionRuntime` + `runtime.newSession` / `switchSession`.