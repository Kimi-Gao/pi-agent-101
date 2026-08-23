/**
 * day2: minimal Web UI (single session + SSE streaming push)
 *
 * Teaching goal: replace the day1 REPL with an HTTP entry point —
 *   - GET  /             returns an HTML page with the chat UI embedded
 *   - GET  /api/events   SSE endpoint, rewrites session events as EventSource frames
 *   - POST /api/prompt   accepts a { text }, calls session.prompt(text)
 *
 * Key point: the server uses a single AgentSession, and events are broadcast to all
 *         currently-connected browser tabs via Set<ServerResponse>. Concurrent
 *         requests from multiple tabs are rejected with 409 (the minimal version
 *         does not handle queueing).
 *
 * Run:  node --experimental-strip-types server.ts
 *       or PORT=5174 npm start
 */

import * as http from "node:http";

// ① Import SDK (same as day1)
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

// ② Initialize ModelRuntime + AgentSession
//    Exactly the same as day1: single session, in-memory, no write tools.
const modelRuntime = await ModelRuntime.create();
const available = await modelRuntime.getAvailable();
if (available.length === 0) {
  process.stderr.write(
    "没有可用模型。\n" +
      "请配置 ~/.pi/agent/auth.json，或设置环境变量 ANTHROPIC_API_KEY 等。\n",
  );
  process.exit(1);
}
const model = available[0];
process.stderr.write(`[model] ${model.provider}/${model.id}\n`);

const { session } = await createAgentSession({
  modelRuntime,
  sessionManager: SessionManager.inMemory(),
  tools: ["read", "grep", "find", "ls"],
});

// ③ SSE broadcast: every connected browser tab shares one session
//    Each SDK event gets serialized into an SSE frame and written() to every res
//    in the Set. This is the server-side implementation of "EventSource streams
//    replies live in the browser".
type Frame = { event: string; data: unknown };
const subscribers = new Set<http.ServerResponse>();
let isProcessing = false; // Single-session version: reject concurrent prompts, hint "agent is busy"

const unsubscribe = session.subscribe((event) => {
  let frame: Frame | null = null;
  switch (event.type) {
    case "message_update": {
      const e = event.assistantMessageEvent;
      // assistantMessageEvent.type also has "thinking_delta" (used in day6).
      if (e.type === "text_delta") {
        frame = { event: "text_delta", data: { delta: e.delta } };
      }
      break;
    }
    case "tool_execution_start":
      frame = { event: "tool_start", data: { toolName: event.toolName } };
      break;
    case "agent_end":
      frame = { event: "agent_end", data: {} };
      break;
  }
  if (!frame) return;
  const payload = `event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`;
  for (const res of subscribers) {
    try { res.write(payload); } catch { /* connection closed, ignore */ }
  }
});

// ④ Embedded chat UI (HTML + CSS + JS)
//    Intentionally minimal: one stylesheet + EventSource listening for three
//    events + form submission. No build pipeline, pure browser-native DOM API.
const HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>agent-mini · day2</title>
<style>
  body { font: 14px ui-monospace, SFMono-Regular, Menlo, monospace;
         max-width: 720px; margin: 2rem auto; padding: 0 1rem; color: #222; }
  h1 { font-size: 1rem; font-weight: 600; margin: 0 0 0.5rem; }
  h1 small { color: #888; font-weight: 400; margin-left: 0.5rem; }
  #log { border: 1px solid #ddd; border-radius: 4px; padding: 0.5rem 0.75rem;
         min-height: 14rem; max-height: 60vh; overflow-y: auto;
         background: #fafafa; }
  #log div { margin: 0.1rem 0; white-space: pre-wrap; word-break: break-word; }
  #log div[data-role="user"] { color: #06c; }
  #log div[data-role="tool"]  { color: #888; }
  #log div[data-role="error"] { color: #c30; }
  form { margin-top: 0.5rem; display: flex; gap: 0.5rem; }
  input { flex: 1; padding: 0.45rem 0.6rem; font: inherit; border: 1px solid #ccc;
          border-radius: 4px; }
  input:disabled { background: #f4f4f4; color: #888; }
  button { padding: 0.45rem 1rem; font: inherit; cursor: pointer; }
  button:disabled { cursor: not-allowed; color: #888; }
</style>
</head>
<body>
<h1>agent-mini <small>day2 · 单会话 + SSE</small></h1>
<div id="log"></div>
<form id="f">
  <input id="t" autocomplete="off" placeholder="说点什么…  Enter 发送">
  <button>发送</button>
</form>
<script>
  const log = document.getElementById("log");
  const t   = document.getElementById("t");
  const f   = document.getElementById("f");

  function append(role, text) {
    const div = document.createElement("div");
    div.dataset.role = role;
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }
  function appendDelta(delta) {
    // Append the same-turn assistant text onto the last assistant div to keep
    // streaming continuity.
    const last = log.lastElementChild;
    if (last && last.dataset.role === "assistant") {
      last.textContent += delta;
    } else {
      append("assistant", delta);
    }
    log.scrollTop = log.scrollHeight;
  }

  // EventSource: the browser's native SSE client, auto-reconnects on disconnect.
  const es = new EventSource("/api/events");
  es.addEventListener("text_delta", (ev) => {
    appendDelta(JSON.parse(ev.data).delta);
  });
  es.addEventListener("tool_start", (ev) => {
    append("tool", "[tool] " + JSON.parse(ev.data).toolName);
  });
  es.addEventListener("agent_end", () => {
    append("assistant", "");   // Trailing blank line for visual separation
    t.disabled = false;
    t.focus();
  });
  es.onerror = () => { /* The browser auto-reconnects; do nothing here. */ };

  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = t.value.trim();
    if (!text) return;
    t.value = "";
    t.disabled = true;
    append("user", "you> " + text);
    const r = await fetch("/api/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) {
      const msg = r.status === 409
        ? "agent 正在忙，请等上一轮结束"
        : (await r.text());
      append("error", "[error] " + r.status + " " + msg);
      t.disabled = false;
      t.focus();
    }
  });
  t.focus();
</script>
</body>
</html>`;

// ⑤ HTTP server: three routes
const PORT = Number(process.env.PORT ?? 5173);

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  // GET /: return the chat UI
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(HTML);
    return;
  }

  // GET /api/events: SSE subscribe
  if (req.method === "GET" && req.url === "/api/events") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Disable buffering by Nginx or similar reverse proxies (if any).
      "x-accel-buffering": "no",
    });
    // Send one SSE comment line first to immediately flush response headers,
    // so the browser sees the connection as established without waiting for
    // the first event.
    res.write(`: connected ${Date.now()}\n\n`);
    subscribers.add(res);
    req.on("close", () => {
      subscribers.delete(res);
      try { res.end(); } catch { /* already closed */ }
    });
    return;
  }

  // POST /api/prompt: send one user message to the session
  if (req.method === "POST" && req.url === "/api/prompt") {
    if (isProcessing) {
      res.writeHead(409, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "agent is busy" }));
      return;
    }
    let body: any;
    try {
      body = await readJsonBody(req);
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid json" }));
      return;
    }
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "text is required" }));
      return;
    }
    isProcessing = true;
    try {
      await session.prompt(text); // ★ Core SDK call: triggers one agent loop turn
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: (err as Error).message }));
    } finally {
      isProcessing = false;
    }
    return;
  }

  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
});

server.listen(PORT, () => {
  process.stderr.write(`[http] listening on http://localhost:${PORT}\n`);
  process.stderr.write("[http] open the URL above in a browser to start chatting\n");
});

// ⑥ Graceful shutdown: close SSE → release session → close http server
function shutdown() {
  process.stderr.write("\n[http] shutting down\n");
  for (const res of subscribers) {
    try { res.end(); } catch { /* */ }
  }
  subscribers.clear();
  unsubscribe();
  session.dispose();
  server.close(() => process.exit(0));
  // Fallback: exit unconditionally if shutdown takes longer than 3s.
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);