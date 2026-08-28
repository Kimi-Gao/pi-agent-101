/**
 * day4：preload 脚本
 *
 * 在 window 上挂 `pi`，让渲染进程只能调：
 *   - pi.prompt(text)        → 主进程调 runtime.session.prompt()
 *   - pi.listSessions()      → 拿会话列表
 *   - pi.newSession()        → 新建会话并切到它
 *   - pi.switchSession(id)   → 切到指定会话
 *   - pi.onTextDelta / onToolStart / onAgentEnd   → session 事件推送
 *   - pi.onSessionsChanged / onCurrentSession     → 会话列表 / 当前会话变化
 */

import { contextBridge, ipcRenderer } from "electron";

type SessionMeta = { id: string; name: string };

contextBridge.exposeInMainWorld("pi", {
  // request/response
  prompt: (text: string) => ipcRenderer.invoke("pi:prompt", text),
  listSessions: () => ipcRenderer.invoke("pi:list-sessions"),
  newSession: () => ipcRenderer.invoke("pi:new-session"),
  switchSession: (id: string) => ipcRenderer.invoke("pi:switch-session", id),

  // push: session 事件
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

  // push: 会话列表 / 当前会话变化
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