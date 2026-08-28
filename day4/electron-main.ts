/**
 * day4：多会话管理（Electron + createAgentSessionRuntime）
 *
 * 与 day3 的区别：day3 是单个 `createAgentSession`，整天只有一个 session；
 * day4 改用 SDK 提供的 `AgentSessionRuntime` —— 主进程持有 runtime，
 * 侧边栏 new / switch 会话时由 runtime 接管（runtime.newSession /
 * runtime.switchSession），session 替换后事件订阅要重新挂到新 session 上。
 *
 * 关键设计：会话列表是 main 进程自己维护的（runtime 不暴露 listSessions），
 * 每次 newSession 之后把 sessionId 推入 sessions 数组，再 broadcast 给渲染进程。
 *
 * 运行：npm start
 */

import * as path from "node:path";
import * as url from "node:url";
import { app, BrowserWindow, ipcMain } from "electron";

import {
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

// ① model 初始化（同 day3）
const modelRuntime = await ModelRuntime.create();
const available = await modelRuntime.getAvailable();
if (available.length === 0) {
  process.stderr.write(
    "没有可用模型。\n" +
      "请配置 ~/.pi/agent/auth.json，或设置环境变量 ANTHROPIC_API_KEY 等。\n",
  );
  app.exit(1);
}
const model = available[0];

// ② 自维护的会话列表 —— runtime 不暴露 listSessions，只能自己跟踪
type SessionMeta = { id: string; name: string };
let sessions: SessionMeta[] = [];

// ③ runtime factory：每个 cwd-bound 会话都重新建一份 services
const factory = async ({
  cwd,
  agentDir,
  sessionManager,
  sessionStartEvent,
}: {
  cwd: string;
  agentDir: string;
  sessionManager: SessionManager;
  sessionStartEvent?: unknown;
}) => {
  const services = await createAgentSessionServices({
    cwd,
    agentDir,
    modelRuntime,
  });
  const result = await createAgentSessionFromServices({
    services,
    sessionManager,
    sessionStartEvent: sessionStartEvent as never,
    model,
  });
  return {
    ...result,
    services,
    diagnostics: services.diagnostics,
  };
};

const sessionManager = SessionManager.inMemory();
const runtime = await createAgentSessionRuntime(factory, {
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  sessionManager,
});

// 注册初始会话
sessions.push({ id: runtime.session.sessionId, name: "会话 1" });

// ④ 广播给渲染进程
let mainWindow: BrowserWindow | null = null;
function broadcast(channel: string, payload: unknown) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}
function broadcastSessions() {
  broadcast("pi:sessions-changed", sessions);
}
function broadcastCurrent() {
  broadcast("pi:current-session", { id: runtime.session.sessionId });
}

// ⑤ 把当前 session 的事件转发给渲染进程
function subscribeCurrentSession() {
  runtime.session.subscribe((event) => {
    switch (event.type) {
      case "message_update": {
        const e = event.assistantMessageEvent as { type: string; delta?: string };
        if (e.type === "text_delta") {
          broadcast("pi:text_delta", { delta: e.delta });
        }
        break;
      }
      case "tool_execution_start":
        broadcast("pi:tool_start", { toolName: event.toolName });
        break;
      case "agent_end":
        broadcast("pi:agent_end", {});
        break;
    }
  });
}
subscribeCurrentSession();

// ⑥ IPC handlers
ipcMain.handle("pi:list-sessions", () => sessions);

ipcMain.handle("pi:new-session", async () => {
  await runtime.newSession();
  const id = runtime.session.sessionId;
  sessions.push({ id, name: `会话 ${sessions.length + 1}` });
  subscribeCurrentSession();
  broadcastCurrent();
  broadcastSessions();
  return { id };
});

ipcMain.handle("pi:switch-session", async (_event, id: string) => {
  await runtime.switchSession(id);
  subscribeCurrentSession();
  broadcastCurrent();
  return { id };
});

ipcMain.handle("pi:prompt", async (_event, text: string) => {
  await runtime.session.prompt(text);
});

// ⑦ 窗口
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.ts"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "index.html"));
});

app.on("window-all-closed", async () => {
  await runtime.dispose();
  app.quit();
});