# day3: Desktop Agent kickoff (single session + IPC+preload)

This directory is **day3** of `pi-agent-101` — the starting point of the Desktop Agent form.
For the full roadmap see the root [README.md](../README.md); previous: [day2](../day2/README.md).

## Why

The day2 Web UI runs in a browser: browser → HTTP request → server → SSE push back to browser. It looks like a "web app", but it's making compromises — the main process is right there on the same machine, yet it goes through HTTP.

Day3 throws out those compromises: the Electron main process **owns** the pi session directly; the renderer talks to it through **IPC + preload (contextBridge)**. No HTTP, no SSE, no EventSource — main process is the main process, renderer is the renderer, each with its proper role.

Day3 only lights up "single session + IPC+preload". Sidebar, new/switch/delete sessions are left for day4.

## Run

Requires Node ≥ 22.6 (Node 24 enables `--experimental-strip-types` by default, no tsx or build step).

```bash
cd day3
npm install     # install electron + @earendil-works/pi-coding-agent
npm start       # electron .
```

A desktop window pops up with the title `pi-agent-101 · day3`. Type a message in it — the main process owns the pi session, and all prompt / text_delta / tool_start / agent_end traffic flows over IPC+preload.

## Files

```
day3/
├── package.json
├── electron-main.ts   ← Electron main: owns pi session + exposes IPC
├── preload.ts          ← contextBridge: the window.pi.* API for the renderer
├── index.html          ← renderer UI (chat window)
├── chat.js             ← renderer logic: talks to the main process via window.pi.*
└── README.md
```

## Three IPC channels

| Channel | Direction | Purpose | Mode |
| --- | --- | --- | --- |
| `pi:prompt` | renderer → main | User sends a message | `ipcMain.handle` / `ipcRenderer.invoke` (request/response) |
| `pi:text_delta` | main → renderer | LLM streaming text fragment | `webContents.send` / `ipcRenderer.on` (push) |
| `pi:tool_start` | main → renderer | Tool call started | same (push) |
| `pi:agent_end` | main → renderer | One agent turn ended | same (push) |

Compared with day2's HTTP/SSE:

| day2 (HTTP/SSE) | day3 (IPC) |
| --- | --- |
| `fetch("/api/prompt", {body: text})` | `window.pi.prompt(text)` |
| `new EventSource("/api/events")` + `addEventListener("text_delta", cb)` | `window.pi.onTextDelta(cb)` |
| Multiple browser tabs share one session | Renderer = Electron window, 1:1 |

## Security settings

`BrowserWindow`'s `webPreferences` deliberately disables `nodeIntegration` and enables `contextIsolation`, so the renderer can only talk to the main process through the `window.pi` injected by preload — no `require`, no `process`, no Node APIs. This is the modern Electron security baseline.

## Next

Move on to **day4: multi-session management**. Add a sidebar, new / switch / delete sessions; each session is an independent `AgentSession`.