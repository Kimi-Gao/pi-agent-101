# day4：多会话管理（Electron + createAgentSessionRuntime）

本目录是 `pi-agent-101` 项目的 **day4** —— 初级Agent 第一站：把 day3 的单会话 Electron 应用扩展为多会话。
整体规划见仓库根目录的 [README.md](../README.md)；前一篇见 [day3](../day3/README.md)。

## 为什么

day3 整天只有一个 `createAgentSession` 实例，所有 prompt 都进同一个会话、共享同一份 history。
真实使用场景需要多个独立会话：这边调试一个、那边开一个全新话题聊别的；切会话不能丢历史。

day4 用 SDK 提供的 `AgentSessionRuntime` 接管 session 生命周期：

- `runtime.newSession()` — 新建会话（runtime 内部建一份新的 AgentSession）
- `runtime.switchSession(id)` — 切到指定 id 的会话
- `runtime.session` — 当前会话，所有 prompt / 事件订阅都走它

切会话后**事件订阅要重新挂**到新 session 上（订阅是 attached to a specific AgentSession 的），
所以 `subscribeCurrentSession()` 在 newSession / switchSession 之后都会重跑一遍。

## 运行

需要 Node ≥ 22.6 以及 **Electron ≥ 34**（本目录默认锁到 `^44.0.0`，即当前
latest stable）。Electron 34+ 内置 Node 22.11+，支持 `--experimental-strip-types`
标志——`electron-main.ts` / `preload.ts` 可以直接被 Electron 运行，无需 tsx
或编译。

`npm install` 会从 GitHub releases CDN 下载 Electron 二进制（~200 MB）。`electron`
包本身是懒加载的——二进制只在首次 `require('electron')` 时才下，**且那个下载走
的是 plain Node 子进程**，`npm_config_*` env var 不会传过去，`.npmrc` 在这个场景
下无效。为避免默认 CDN 在厺劣网络下 `socket hang up` 挂死，`package.json` 加了
一个项目级 `postinstall` 脚本（`scripts/ensure-electron-binary.cjs`），显式 export
`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 后再跑 Electron 自带的
下载逻辑——npmmirror 在中国大陆网络下稳定且镜像源是 bit-for-bit 的官方二进制。

```bash
cd day4
npm install     # 安装 electron + @earendil-works/pi-coding-agent
npm start       # electron --experimental-strip-types .
```

启动后弹出一个桌面窗口：

- 左侧：会话列表（点行切换，点 `+ 新建会话` 新建）
- 右侧：当前会话的 chat 区

每条消息都通过 IPC 送到主进程，主进程调 `runtime.session.prompt()`，session 事件再通过
`webContents.send` 推回渲染进程。

## 文件清单

```
| day4/
| ├── package.json
| ├── electron-main.ts   ← 主进程：createAgentSessionRuntime + 跟踪会话列表 + IPC
| ├── preload.ts          ← contextBridge：window.pi.* API（含多会话方法）
| ├── index.html          ← 侧边栏 + chat 区布局
| ├── chat.js             ← 渲染进程逻辑：列表渲染 / 会话切换 / chat 流
| └── README.md
```

## 跟 day3 的对照

| | day3（单会话） | day4（多会话） |
| --- | --- | --- |
| 会话管理 | `createAgentSession` | `createAgentSessionRuntime` + runtime |
| IPC `pi:prompt` | 调 `session.prompt(text)` | 调 `runtime.session.prompt(text)` |
| 会话列表 | （无） | `sessions` 数组（main 自维护）+ `pi:list-sessions` / `pi:new-session` / `pi:switch-session` |
| 事件订阅 | 启动时一次 | 每次切会话后重订阅 |
| 渲染端 UI | 单页 chat | 侧边栏 + chat 区 |

## 多会话 IPC 通道

| 通道 | 方向 | 用途 | 模式 |
| --- | --- | --- | --- |
| `pi:prompt` | renderer → main | 当前会话发 prompt | request/response |
| `pi:list-sessions` | renderer → main | 拿会话列表 | request/response |
| `pi:new-session` | renderer → main | 新建会话并切到它 | request/response |
| `pi:switch-session` | renderer → main | 切到指定 id | request/response |
| `pi:text_delta` / `pi:tool_start` / `pi:agent_end` | main → renderer | 当前 session 事件推送 | push |
| `pi:sessions-changed` | main → renderer | 会话列表变化（new-session 后） | push |
| `pi:current-session` | main → renderer | 当前会话切换 | push |

## 下一步

进入 **day5：工具调用可视化**。SDK 在 `session.subscribe()` 里除了 `text_delta` 还推 `tool_execution_update` /
`_end` 事件——把它们翻译成前端可折叠卡片（工具名 + 参数 + running… + 结果），让用户看到 agent 在"做事"。