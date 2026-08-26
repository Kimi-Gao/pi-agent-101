/**
 * day3：多会话管理 Web UI
 *
 * 教学目标：在 day2 的单会话 Web UI 基础上，引入多会话——
 *   - 侧边栏列出所有会话，点行切换，× 删除
 *   - 每个会话是独立的 AgentSession（有独立 history + 独立 LLM 循环）
 *   - SSE 流按 session 分组：每个 tab 只看到自己当前 session 的事件
 *   - 后端用 Map<id, Entry> 管理所有 session，自己实现切换/删除逻辑
 *
 * 运行：node --experimental-strip-types server.ts
 */

import * as http from "node:http";
import * as fs from "node:fs";

// ① 导入 SDK（同 day2，但只用 createAgentSession，不走 runtime）
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

// ② ModelRuntime 初始化（同 day1/day2）
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

// ③ 每个会话 = 一个独立的 AgentSession + 自己的 SSE 订阅者集合
//    sessionId 用 crypto.randomUUID() 生成，浏览器 localStorage 记住当前 id。
type Frame = { event: string; data: unknown };
type Entry = {
  id: string;
  session: Awaited<ReturnType<typeof createAgentSession>>["session"];
  subscribers: Set<http.ServerResponse>;
  isProcessing: boolean;
  unsubscribe: () => void;
};

const sessions = new Map<string, Entry>();

// 把 SDK 事件翻译成 SSE 帧，只写给该会话的订阅者
function broadcast(id: string, event: unknown): void {
  const entry = sessions.get(id);
  if (!entry) return;
  let frame: Frame | null = null;
  const ev = event as { type: string; [k: string]: unknown };
  switch (ev.type) {
    case "message_update": {
      const e = ev.assistantMessageEvent as { type: string; delta?: string };
      if (e.type === "text_delta") {
        frame = { event: "text_delta", data: { delta: e.delta } };
      }
      break;
    }
    case "tool_execution_start":
      frame = { event: "tool_start", data: { toolName: ev.toolName } };
      break;
    case "agent_end":
      frame = { event: "agent_end", data: {} };
      break;
  }
  if (!frame) return;
  const payload = `event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`;
  for (const res of entry.subscribers) {
    try { res.write(payload); } catch { /* 连接已断，忽略 */ }
  }
}

// 创建一个全新的会话（entry + 订阅转发）
async function createEntry(): Promise<Entry> {
  const { session } = await createAgentSession({
    modelRuntime,
    sessionManager: SessionManager.inMemory(),
    tools: ["read", "grep", "find", "ls"],
  });
  const entry: Entry = {
    id: crypto.randomUUID(),
    session,
    subscribers: new Set(),
    isProcessing: false,
    unsubscribe: () => {},
  };
  entry.unsubscribe = session.subscribe((event) => broadcast(entry.id, event));
  sessions.set(entry.id, entry);
  return entry;
}

// 释放会话：关 SSE → 退订 → dispose → 从 map 删除
async function disposeEntry(id: string): Promise<void> {
  const entry = sessions.get(id);
  if (!entry) return;
  for (const res of entry.subscribers) {
    try { res.end(); } catch { /* */ }
  }
  entry.subscribers.clear();
  entry.unsubscribe();
  entry.session.dispose();
  sessions.delete(id);
}

// ④ chat UI HTML 启动时一次性读入（保持在 .ts 外便于 review）
const HTML = fs.readFileSync(new URL("./chat-ui.html", import.meta.url), "utf8");

// ⑤ HTTP server：五个路由
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
  try {
    // GET /：chat UI
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(HTML);
      return;
    }

    // GET /api/sessions：列出所有会话
    if (req.method === "GET" && req.url === "/api/sessions") {
      const items = [...sessions.values()].map((e) => ({
        id: e.id,
        busy: e.isProcessing,
      }));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ sessions: items }));
      return;
    }

    // POST /api/sessions：新建一个会话
    if (req.method === "POST" && req.url === "/api/sessions") {
      const entry = await createEntry();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: entry.id }));
      return;
    }

    // DELETE /api/sessions/:id
    const delMatch = req.url?.match(/^\/api\/sessions\/([^/]+)$/);
    if (req.method === "DELETE" && delMatch) {
      const id = decodeURIComponent(delMatch[1]);
      await disposeEntry(id);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // GET /api/events?session=:id：SSE 订阅指定会话
    if (req.method === "GET" && req.url?.startsWith("/api/events")) {
      const u = new URL(req.url, "http://localhost");
      const id = u.searchParams.get("session");
      const entry = id ? sessions.get(id) : null;
      if (!entry) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "session not found" }));
        return;
      }
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      res.write(`: connected ${Date.now()}\n\n`);
      entry.subscribers.add(res);
      req.on("close", () => {
        entry.subscribers.delete(res);
        try { res.end(); } catch { /* */ }
      });
      return;
    }

    // POST /api/prompt：发一条消息给指定会话
    if (req.method === "POST" && req.url === "/api/prompt") {
      const body = (await readJsonBody(req)) as { sessionId?: unknown; text?: unknown };
      const id = typeof body.sessionId === "string" ? body.sessionId : "";
      const text = typeof body.text === "string" ? body.text.trim() : "";
      const entry = sessions.get(id);
      if (!entry) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "session not found" }));
        return;
      }
      if (!text) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "text is required" }));
        return;
      }
      if (entry.isProcessing) {
        res.writeHead(409, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "agent is busy" }));
        return;
      }
      entry.isProcessing = true;
      try {
        await entry.session.prompt(text);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: (err as Error).message }));
      } finally {
        entry.isProcessing = false;
      }
      return;
    }

    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  } catch (err) {
    process.stderr.write(`[err] ${(err as Error).message}\n`);
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "application/json" });
    }
    res.end(JSON.stringify({ error: (err as Error).message }));
  }
});

server.listen(PORT, () => {
  process.stderr.write(`[model] ${model.provider}/${model.id}\n`);
  process.stderr.write(`[http] listening on http://localhost:${PORT}\n`);
});

// ⑥ 优雅退出
async function shutdown() {
  process.stderr.write("\n[http] shutting down\n");
  for (const id of [...sessions.keys()]) await disposeEntry(id);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);