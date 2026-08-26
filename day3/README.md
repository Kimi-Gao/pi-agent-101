# day3：Desktop Agent 起步（单会话 + IPC+preload）

本目录是 `pi-agent-101` 项目的 **day3** —— Desktop Agent 形态的起点。
整体规划见仓库根目录的 [README.md](../README.md)；前一篇见 [day2](../day2/README.md)。

## 为什么

day2 的 Web UI 跑在浏览器里：浏览器 → HTTP 请求 → 服务端 → SSE 推送回浏览器。
看起来是个"网页应用"，但其实是在做"假装是网络应用"的妥协——主进程就在那台机器上，
却要绕一圈 HTTP。

day3 把这种妥协扔掉：Electron 主进程**直接持有** pi session，渲染进程通过
**IPC + preload（contextBridge）**跟主进程对话。不再有 HTTP、不再有 SSE、不再有
EventSource——主进程就是主进程，渲染进程就是渲染进程，各司其职。

day3 只点亮"单会话 + IPC+preload"。侧边栏、新建/切换/删除等留给 day4。

## 运行

需要 Node ≥ 22.6（Node 24 默认开启 `--experimental-strip-types`，无需 tsx 或编译）。

```bash
cd day3
npm install     # 安装 electron + @earendil-works/pi-coding-agent
npm start       # electron .
```

启动后会弹出一个桌面窗口，标题 `pi-agent-101 · day3`。在里面输入消息即可，
主进程持有 pi session，所有 prompt / text_delta / tool_start / agent_end 都走
IPC+preload。

## 文件清单

```
| day3/
| ├── package.json
| ├── electron-main.ts   ← Electron 主进程：持有 pi session + 暴露 IPC
| ├── preload.ts          ← contextBridge：渲染进程拿到的 window.pi.* API
| ├── index.html          ← 渲染进程 UI（chat 窗口）
| ├── chat.js             ← 渲染进程逻辑：通过 window.pi.* 跟主进程对话
| └── README.md
```

## 三条 IPC 通道

| 通道 | 方向 | 用途 | 模式 |
| --- | --- | --- | --- |
| `pi:prompt` | renderer → main | 用户发送消息 | `ipcMain.handle` / `ipcRenderer.invoke`（request/response） |
| `pi:text_delta` | main → renderer | LLM 流式文本片段 | `webContents.send` / `ipcRenderer.on`（push） |
| `pi:tool_start` | main → renderer | 工具调用开始 | 同上（push） |
| `pi:agent_end` | main → renderer | 一轮 agent 结束 | 同上（push） |

跟 day2 的 HTTP/SSE 对照：

| day2（HTTP/SSE） | day3（IPC） |
| --- | --- |
| `fetch("/api/prompt", {body: text})` | `window.pi.prompt(text)` |
| `new EventSource("/api/events")` + `addEventListener("text_delta", cb)` | `window.pi.onTextDelta(cb)` |
| 多浏览器标签页共享一个 session | 渲染进程 = Electron 窗口，1:1 |

## 安全配置

`BrowserWindow` 的 `webPreferences` 故意关掉 `nodeIntegration`、开启 `contextIsolation`，
让渲染进程只通过 preload 注入的 `window.pi` 跟主进程通信——拿不到 `require`、拿不到
`process`、拿不到任何 Node API。这是 Electron 现代安全实践的默认配置。

## 下一步

进入 **day4：多会话管理**。Electron 应用里加侧边栏、新建 / 切换 / 删除会话，每个会话
独立的 `AgentSession`。