/**
 * day4: preload script
 *
 * Exposes `pi` on window with the methods the renderer needs:
 *   - pi.prompt(text)        → main calls runtime.session.prompt()
 *   - pi.listSessions()      → returns session list
 *   - pi.newSession()        → create new session and switch to it
 *   - pi.switchSession(id)   → switch to session by id
 *   - pi.onTextDelta / onToolStart / onAgentEnd   → session event push
 *   - pi.onSessionsChanged / onCurrentSession     → list / current-session changes
 */

import { contextBridge, ipcRenderer } from "electron";

type SessionMeta = { id: string; name: string };

contextBridge.exposeInMainWorld("pi", {
  // request/response
  prompt: (text: string) => ipcRenderer.invoke("pi:prompt", text),
  listSessions: () => ipcRenderer.invoke("pi:list-sessions"),
  newSession: () => ipcRenderer.invoke("pi:new-session"),
  switchSession: (id: string) => ipcRenderer.invoke("pi:switch-session", id),

  // push: session events
  onTextDelta: (cb: (delta: string) => void) => {
    const listener = (_e: unknown, p: { delta: string }) => cb(p.delta);
    ipcRenderer.on("pi:text_delta", listener);
    return () => ipcRenderer.removeListener("pi:text_delta", listener);
  },
  onToolStart: (cb: (toolName: string) => void) => {
    const listener = (_e: unknown, p: { toolName: string }) => cb(p.toolName);
    ipcRenderer.on("pi:tool_start", listener);
    return () => ipcRenderer.removeListener("pi:tool_start", listener);
  },
  onAgentEnd: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on("pi:agent_end", listener);
    return () => ipcRenderer.removeListener("pi:agent_end", listener);
  },

  // push: list / current session changes
  onSessionsChanged: (cb: (s: SessionMeta[]) => void) => {
    const listener = (_e: unknown, s: SessionMeta[]) => cb(s);
    ipcRenderer.on("pi:sessions-changed", listener);
    return () => ipcRenderer.removeListener("pi:sessions-changed", listener);
  },
  onCurrentSession: (cb: (p: { id: string }) => void) => {
    const listener = (_e: unknown, p: { id: string }) => cb(p);
    ipcRenderer.on("pi:current-session", listener);
    return () => ipcRenderer.removeListener("pi:current-session", listener);
  },
});