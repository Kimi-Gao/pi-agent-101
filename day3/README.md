# day3: Multi-session Web UI

This directory is **day3** of the `agent-mini` project — the third stop in the first arc.
See the repo root [README.md](../README.md) for the full plan; the previous entry is [day2](../day2/README.md).

## Why

day2 is single-session — every browser tab shares one history, and concurrent prompts get a 409.
Real-world usage needs multiple independent sessions: debug something here, open a fresh topic there; switching sessions must not lose history.

day3 has exactly one goal: **turn on multi-session**. Each session is an independent `AgentSession` instance with its own history, its own SSE subscriber set, and its own `isProcessing` mutex. Switching = frontend closes the EventSource + backend swaps sessionId, with no history loss and no collisions.

## Run

Requires Node ≥ 22.6 (Node 24 has `--experimental-strip-types` on by default; no tsx or compile step needed).

```bash
cd day3
npm install        # install @earendil-works/pi-coding-agent
npm start          # listens on http://localhost:5173 by default
```

After start:

```
[model] xxx/xxx
[http] listening on http://localhost:5173
```

Open the browser — you'll see the left sidebar (empty for now) + right chat area. Click **+ New session** to create one, click a list entry to switch, click **×** to delete.

## Five HTTP routes

`server.ts` uses Node's built-in `http` to serve the app, with five routes:

| Route | Method | Purpose |
| --- | --- | --- |
| `/` | `GET` | Returns the chat UI (HTML lives in `chat-ui.html`) |
| `/api/sessions` | `GET` | List all sessions as `{ sessions: [{id, busy}] }` |
| `/api/sessions` | `POST` | Create a new session, returns `{ id }` (backend calls `createAgentSession` once) |
| `/api/sessions/:id` | `DELETE` | Release all SSE for that session → `unsubscribe()` → `dispose()` → drop from map |
| `/api/events?session=:id` | `GET` | SSE endpoint, broadcasts **only** that session's SDK events |
| `/api/prompt` | `POST` | `{ sessionId, text }`, runs `await session.prompt(text)` on the given session |

When a session is busy, `/api/prompt` returns `409 agent is busy`; the per-session mutex does not affect other sessions.

## Data structure: one Entry = one complete session

```ts
type Entry = {
  id: string;                                  // crypto.randomUUID()
  session: AgentSession;                       // SDK session (own history + own LLM loop)
  subscribers: Set<http.ServerResponse>;       // browser tabs currently subscribed to this session's SSE
  isProcessing: boolean;                       // this session's concurrency mutex
  unsubscribe: () => void;                     // unsubscribe handle returned by session.subscribe()
};
const sessions = new Map<string, Entry>();
```

Each Entry independently creates an `AgentSession`, independently subscribes once to the SDK event stream, and on broadcast only writes to its own `subscribers` Set. On delete: `end()` every SSE → `unsubscribe()` → `session.dispose()`.

## Three SDK events → three SSE frames (same as day2)

`session.subscribe()` in day3 still translates only three events:

| SDK event | SSE frame |
| --- | --- |
| `message_update` with `text_delta` | `event: text_delta` `data: {"delta":"…"}` |
| `tool_execution_start` | `event: tool_start` `data: {"toolName":"…"}` |
| `agent_end` | `event: agent_end` `data: {}` |

The only difference from day2: **each session calls `subscribe()` independently**, each maintaining its own `subscribers` Set. Switching sessions = the frontend closes the old `EventSource` and opens a new one. The old session's event stream is still subscribed on the backend, but the frontend no longer receives it (because it closed); the new session's event stream is independently pushed to the current subscriber.

## Frontend remembers the current session

After a page refresh, the frontend uses `localStorage.getItem("currentId")` to remember the last viewed sessionId and automatically reconnects its SSE stream. If that id has been deleted, the frontend picks another session from the sidebar as the current one.

This is the minimum persistence for client state (a few lines of localStorage) and does not involve the SDK's SessionManager persistence — that's day11's content.

## Code skeleton (line-by-line)

```
① ModelRuntime.create()           ←  load credentials + model catalog
② createAgentSession() factory   ←  returns a new AgentSession (each call is independent)
③ Map<id, Entry> + subscribers   ←  each session's independent event broadcast channel
④ fs.readFileSync(chat-ui.html)  ←  read HTML once at startup
⑤ http.createServer()              ←  5 routes: /, /api/sessions (GET/POST/DELETE),
                                    /api/events, /api/prompt
⑥ SIGINT/SIGTERM graceful exit    ←  iterate sessions → disposeEntry → exit
```

## Glossary

Explained in the order they appear in day3's code:

| Term | Explanation |
| --- | --- |
| **Multi-session** | Multiple independent `AgentSession` instances coexisting in one process, each maintaining its own messages array and LLM loop. **Do not** confuse this with `AgentSessionRuntime` — that's a "single current session + switch" UX model (used in day11). |
| **Entry** | A composite type day3 defines itself, bundling `AgentSession` + SSE subscriber Set + mutex + unsubscribe handle. The map's value is Entry; all CRUD goes through it. |
| **subscribers (per-session)** | Each Entry holds its own `Set<http.ServerResponse>`. When an event arrives: `for (const res of entry.subscribers) res.write(...)`. The same session can be subscribed by multiple tabs; each receives the stream independently. |
| **sessionId** | A string produced by `crypto.randomUUID()`. It is the map key on the backend, the SSE URL's query param, and the localStorage key that remembers the current session. |
| **localStorage** | The browser's native persistent KV (day3 uses it to store currentId). After a process restart / browser reopen, the session can "revive" — but only the current one, not the entire sidebar list (that needs SessionManager persistence). |
| **crypto.randomUUID()** | A UUID v4 generator built into Node 24 + modern browsers. No import, no dependency. |

## Common extension points

- **Per-session queue**: Each Entry's `isProcessing` is a boolean. Change it to a `Promise` queue and multiple clients can line up on the same session without hitting 409.
- **Persistence**: Swap `SessionManager.inMemory()` for `SessionManager.create(process.cwd())`; after a process restart `createAgentSession` will automatically restore session history — but day3's Map is still cleared, so the sidebar list will be empty (day11 solves this).
- **History replay**: When switching to an old session, the frontend currently does `clearLog` then waits for new events. Reading `session.state.messages` and rendering history at once gives a more complete experience. day11 will do this.
- **Rename**: Right now the sidebar only shows `session xxxxxxxx` (short id). Add a `PATCH /api/sessions/:id { name }` + an `name` field on Entry to enable renaming.

## Next

Enter **day4: tool-call visualization**. On top of `tool_execution_start`, also handle `tool_execution_update` / `tool_execution_end`. The frontend renders a collapsible card for each tool call (tool name + arguments + executing... + result), so the user can watch the agent "doing" things.
