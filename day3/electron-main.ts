/**
 * day3: Desktop Agent kickoff (single session + IPC+preload)
 *
 * Goal: move from the browser Web UI (HTTP/SSE) to a native Electron architecture.
 *   - The main process owns the pi session directly (no HTTP detour)
 *   - The renderer talks to it through window.pi.* APIs exposed by preload.ts
 *     via contextBridge
 *   - prompt is request/response over ipcMain.handle; session events are pushed
 *     via webContents.send
 *
 * Key contrast with day2 (HTTP/SSE): the renderer is no longer "pretending to
 * be a network app". Main process is the main process; renderer is the renderer.
 *
 * Run: npm start
 */

import * as path from "node:path";
import * as url from "node:url";
import { app, BrowserWindow, ipcMain } from "electron";

import {
  createAgentSession,
  ModelRuntime,
} from "@earendil-works/pi-coding-agent";

// ① Prepare the pi session (same as day1/day2)
const modelRuntime = await ModelRuntime.create();
const available = await modelRuntime.getAvailable();
if (available.length === 0) {
  process.stderr.write(
    "No models available.\n" +
      "Configure ~/.pi/agent/auth.json or set ANTHROPIC_API_KEY etc.\n",
  );
  app.exit(1);
}
const model = available[0];
const { session } = await createAgentSession({ modelRuntime, model });

// ② IPC: renderer requests prompt
ipcMain.handle("pi:prompt", async (_event, text: string) => {
  await session.prompt(text);
});

// ③ Forward session events to the renderer (push)
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

// ④ Open the window and load the renderer UI
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