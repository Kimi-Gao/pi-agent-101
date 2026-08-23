/**
 * day2：Web UI 最小版（单会话 + SSE 流式推送）
 *
 * 教学目标：把 day1 的 REPL 替换成 HTTP 入口——
 *   - GET  /             返回一个内嵌 chat UI 的 HTML 页面
 *   - GET  /api/events   SSE 端点，把 session 事件转写成 EventSource 帧
 *   - POST /api/prompt   收一条 { text }，调 session.prompt(text)
 *
 * 关键点：服务端用同一个 AgentSession，事件用 Set<ServerResponse> 广播给所有
 *         当前连上的浏览器标签页。多端并发会被 409 拒绝（最小版不处理排队）。
 *
 * 运行：node --experimental-strip-types server.ts
 *      或 PORT=5174 npm start
 */

import * as http from "node:http";

// ① 导入 SDK（同 day1）
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

// ② 初始化 ModelRuntime + AgentSession
//    和 day1 完全相同：单会话、内存、不带写工具。
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

// ③ SSE 广播：所有连接进来的浏览器标签页共享一个 session
//    每来一个 SDK 事件，就序列化成 SSE 帧，write() 给 Set 里的所有 res。
//    这就是 "EventSource 在浏览器里实时看到流式回复" 的服务端实现。
type Frame = { event: string; data: unknown };
const subscribers = new Set<http.ServerResponse>();
let isProcessing = false; // 单会话版：拒绝并发 prompt，提示"agent 正在忙"

const unsubscribe = session.subscribe((event) => {
  let frame: Frame | null = null;
  switch (event.type) {
    case "message_update": {
      const e = event.assistantMessageEvent;
      // assistantMessageEvent.type 还有 "thinking_delta"（day6 才用）。
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
    try { res.write(payload); } catch { /* 连接已断开，忽略 */ }
  }
});

// ④ 内嵌的 chat UI（HTML + CSS + JS）
//    故意保留最小：一份样式表 + EventSource 监听三个事件 + form 提交。
//    没有 build pipeline，纯浏览器原生 DOM API。
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
    // 同一轮 assistant 文本追加到最后一个 assistant div，保持流式连续
    const last = log.lastElementChild;
    if (last && last.dataset.role === "assistant") {
      last.textContent += delta;
    } else {
      append("assistant", delta);
    }
    log.scrollTop = log.scrollHeight;
  }

  // EventSource：浏览器原生 SSE 客户端，断开会自动重连
  const es = new EventSource("/api/events");
  es.addEventListener("text_delta", (ev) => {
    appendDelta(JSON.parse(ev.data).delta);
  });
  es.addEventListener("tool_start", (ev) => {
    append("tool", "[tool] " + JSON.parse(ev.data).toolName);
  });
  es.addEventListener("agent_end", () => {
    append("assistant", "");   // 收尾空行，便于视觉断句
    t.disabled = false;
    t.focus();
  });
  es.onerror = () => { /* 浏览器会自动重连；这里什么都不做 */ };

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

// ⑤ HTTP server：三个路由
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
  // GET /：返回 chat UI
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(HTML);
    return;
  }

  // GET /api/events：SSE 订阅
  if (req.method === "GET" && req.url === "/api/events") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // 关闭 Nginx 之类的缓冲（如果有反代）
      "x-accel-buffering": "no",
    });
    // 先发一行 SSE 注释，立刻 flush 响应头，避免浏览器等首事件才显示已连接
    res.write(`: connected ${Date.now()}\n\n`);
    subscribers.add(res);
    req.on("close", () => {
      subscribers.delete(res);
      try { res.end(); } catch { /* 已关闭 */ }
    });
    return;
  }

  // POST /api/prompt：发一条用户消息给 session
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
      await session.prompt(text); // ★ SDK 核心调用：触发一轮 agent 循环
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

// ⑥ 优雅退出：关 SSE → 释放 session → 关 http server
function shutdown() {
  process.stderr.write("\n[http] shutting down\n");
  for (const res of subscribers) {
    try { res.end(); } catch { /* */ }
  }
  subscribers.clear();
  unsubscribe();
  session.dispose();
  server.close(() => process.exit(0));
  // 兜底：3s 内没关掉就直接退
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);