/**
 * day4: Multi-session management (Electron + createAgentSessionRuntime)
 *
 * Difference from day3: day3 used a single `createAgentSession` for the whole
 * day; day4 switches to the SDK's `AgentSessionRuntime` — the main process
 * owns the runtime, and sidebar new / switch actions go through
 * runtime.newSession() / runtime.switchSession().
 *
 * After session replacement, event subscriptions must be re-attached to the
 * new session (subscriptions are tied to a specific AgentSession).
 *
 * Session list is maintained by the main process itself — runtime does not
 * expose listSessions. Each newSession() pushes a sessionId into our local
 * `sessions` array, which we then broadcast to the renderer.
 *
 * Run: npm start
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

// ① model init (same as day3)
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

// ② session list, maintained by main (runtime has no listSessions)
type SessionMeta = { id: string; name: string };
let sessions: SessionMeta[] = [];

// ③ factory: each cwd-bound session recreates services
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

// register initial session
sessions.push({ id: runtime.session.sessionId, name: "Session 1" });

// ④ broadcast to renderer
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

// ⑤ forward current session events to the renderer
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
  sessions.push({ id, name: `Session ${sessions.length + 1}` });
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

// ⑦ window
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