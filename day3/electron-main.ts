/**
 * day3：Desktop Agent 起步（单会话 + IPC+preload）
 *
 * 教学目标：从浏览器 Web UI（SSE）切换到 Electron 原生架构。
 *   - 主进程持有 pi session（直接 await createAgentSession()，不靠 HTTP）
 *   - 渲染进程通过 preload.ts 的 contextBridge 拿到 window.pi.* API
 *   - prompt 用 ipcMain.handle（request/response），session 事件用
 *     webContents.send（push）
 *
 * 与 day2（HTTP+SSE）的关键区别：不再有"假装是网络应用"的妥协——
 * 渲染进程就是直接跟主进程对话。
 *
 * 运行：npm start
 */

import * as path from "node:path";
import * as url from "node:url";
import { app, BrowserWindow, ipcMain } from "electron";

import {
  createAgentSession,
  ModelRuntime,
} from "@earendil-works/pi-coding-agent";

// ① 准备 pi session（同 day1/day2 的初始化）
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
const { session } = await createAgentSession({ modelRuntime, model });

// ② IPC：渲染进程请求 prompt
ipcMain.handle("pi:prompt", async (_event, text: string) => {
  await session.prompt(text);
});

// ③ 把 session 事件转发给渲染进程（push）
let mainWindow: BrowserWindow | null = null;
function broadcastToRenderer(channel: string, payload: unknown) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

session.subscribe((event) => {
  switch (event.type) {
    case "message_update": {
      const e = event.assistantMessageEvent as { type: string; delta?: string };
      if (e.type === "text_delta") {
        broadcastToRenderer("pi:text_delta", { delta: e.delta });
      }
      break;
    }
    case "tool_execution_start":
      broadcastToRenderer("pi:tool_start", { toolName: event.toolName });
      break;
    case "agent_end":
      broadcastToRenderer("pi:agent_end", {});
      break;
  }
});

// ④ 打开窗口 + 加载渲染进程 UI
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 720,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.ts"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "index.html"));
});

app.on("window-all-closed", () => {
  session.dispose();
  app.quit();
});