/**
 * day3：preload 脚本
 *
 * 用 contextBridge 在 window 上挂一个受限的 `pi` 对象，让渲染进程只能
 * 调主进程暴露的几个 API（prompt）+ 订阅几个事件（text_delta / tool_start
 * / agent_end）。contextIsolation + nodeIntegration: false 保证渲染进程拿不到
 * 任何 Node API。
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("pi", {
  // request/response：渲染进程发起 prompt，主进程执行 session.prompt()
  prompt: (text: string) => ipcRenderer.invoke("pi:prompt", text),

  // push：主进程主动推送 session 事件
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