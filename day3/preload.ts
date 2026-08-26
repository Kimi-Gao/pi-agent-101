/**
 * day3: preload script
 *
 * Uses contextBridge to expose a limited `pi` object on window. The renderer
 * can only call the few APIs the main process exposes (prompt) and subscribe
 * to a few events (text_delta / tool_start / agent_end). contextIsolation +
 * nodeIntegration: false keeps the renderer from accessing any Node API.
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("pi", {
  // request/response: renderer initiates prompt, main process runs session.prompt()
  prompt: (text: string) => ipcRenderer.invoke("pi:prompt", text),

  // push: main process pushes session events
  onTextDelta: (cb: (delta: string) => void) => {
    const listener = (_event: unknown, payload: { delta: string }) =>
      cb(payload.delta);
    ipcRenderer.on("pi:text_delta", listener);
    return () => ipcRenderer.removeListener("pi:text_delta", listener);
  },
  onToolStart: (cb: (toolName: string) => void) => {
    const listener = (_event: unknown, payload: { toolName: string }) =>
      cb(payload.toolName);
    ipcRenderer.on("pi:tool_start", listener);
    return () => ipcRenderer.removeListener("pi:tool_start", listener);
  },
  onAgentEnd: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on("pi:agent_end", listener);
    return () => ipcRenderer.removeListener("pi:agent_end", listener);
  },
});