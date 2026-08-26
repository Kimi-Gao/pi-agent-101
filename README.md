# pi-agent-101

**[中文]** | [English](https://github.com/Kimi-Gao/pi-agent-101/blob/main/README.md)

基于 pi SDK 逐步构建一个 Electron 桌面版的 pi agent 聊天对话应用。

最终目标：一个可双击启动的 Electron 原生桌面聊天应用。day1-day2 保持纯 Web UI（浏览器里也能独立跑）；day3 起开始搬进 Electron 窗口——先以 `loadURL` 套壳，跟着 day4-day14 逐日叠加 Web UI + Claude Code 能力；day15+ 把 HTTP/SSE 全换成 IPC + preload（contextBridge），再叠加文件对话框、原生菜单、`protocol.handle` 自定义协议等只有 Electron 才能给的能力。

## 总体规划

### 第一篇：基础（从 0 到 Electron 里的 Web UI）

目标：从命令行起步，先做出能在浏览器里聊的 Web UI；day3 起搬进 Electron 窗口，逐日叠加能力。

| Day | 状态 | 目标 | 关键技能 |
| --- | --- | --- | --- |
| [**day1**](./day1/) | ✅ | 命令行 REPL 最小对话 | `createAgentSession`、`subscribe`、`prompt` |
| [**day2**](./day2/) | ✅ | Web UI 最小版（单会话 + SSE 流式推送） | Node `http` + `EventSource`；服务端把 `subscribe` 的事件转写成 SSE |
| day3 | ⬜ | **Electron 最小壳** — `npm start` 一键起 Electron 窗口，内嵌 day2 的 dev server；首次接触 Electron 主进程 / 渲染进程 / `BrowserWindow` 概念 | `electron` + `BrowserWindow({ loadURL })`；day15+ 才会换成 IPC + preload |
| day4 | ⬜ | 多会话管理（侧边栏 + 新建/切换/删除会话） | `createAgentSessionRuntime`、`runtime.newSession` / `switchSession` |
| day5 | ⬜ | 工具调用可视化（每次工具调用一张可折叠卡片） | `tool_execution_start` / `_update` / `_end` 三事件 |
| day6 | ⬜ | Skills 面板 + 自定义工具按钮 | `DefaultResourceLoader({ skillsOverride })` + `defineTool` |
| day7 | ⬜ | 思考过程可视化 + 工具人工审批 + 持久化 | `thinking_delta` 事件 + 事件拦截 + `SessionManager.create` |

### 第二篇：进阶（Claude Code 基础能力）

> Pi 官方明确声明**故意不内置** MCP、Sub-agent、权限弹窗、Plan Mode。这些能力需要通过扩展机制自己构建或安装第三方包。
> 引用：`docs/usage.md:304` — "It intentionally does not include built-in MCP, sub-agents, permission popups, plan mode..."

第二篇的每一个能力都对应"读 pi 官方示例扩展 → 理解实现原理 → 在我们的 Electron 应用中落地"。

| Day | 状态 | 目标 | 关键技能 / pi SDK 能力 |
| --- | --- | --- | --- |
| day8 | ⬜ | 工具权限审批系统（人类在环） | 拦截 `tool_execution_start`；前端弹确认框；服务端挂起等用户决策再放行。参考 `examples/extensions/permission-gate.ts` |
| day9 | ⬜ | MCP 集成（接入外部工具协议） | `extensionFactories` + MCP server；工具自动注册到 session。前端把 MCP 工具列在工具面板 |
| day10 | ⬜ | Sub-agent（Task 工具 + 嵌套 session） | 自定义 `task` 工具；内部 `createAgentSession` 起子会话；把子会话的事件流冒泡到父会话。参考 `examples/extensions/subagent/` |
| day11 | ⬜ | Hooks / 扩展机制全掌握 | `pi.on()` 监听所有事件；`ctx.ui.confirm/notify` 与用户交互；`ctx.sendUserMessage` 注入消息 |
| day12 | ⬜ | 会话持久化 + 恢复 + 分支 | `SessionManager.create/list/open/continueRecent` + `navigateTree` + `fork` |
| day13 | ⬜ | Compaction（长会话自动压缩） | `session.compact()` + `SettingsManager` 中的 `compaction.enabled` / 阈值；前端展示压缩事件 |
| day14 | ⬜ | Slash commands + 主题 + Plan Mode | `promptsOverride` 注入命令；主题文件；参考 `examples/extensions/plan-mode/` 自行实现 |

### 第三篇：收尾（Electron 原生桌面应用）

> 这一篇在 day3 引入 Electron 套壳的基础上，把交互模式从“浏览器走 HTTP/SSE”升级成“原生桌面 IPC”，做成**真正的原生桌面应用**。
> 主进程直接持有 pi session、能跑 Node、能调原生 API、能注册自定义协议；渲染进程通过 IPC + preload（contextBridge）跟主进程对话。HTTP/SSE 那种“假装是网络应用”的妥协可以全砍掉。

| Day | 状态 | 目标 | 关键技能 |
| --- | --- | --- | --- |
| day15 | ⬜ | Electron + IPC + preload——主进程直接持有 pi session，渲染进程通过 `contextBridge` 暴露的 `pi.prompt()` / `pi.on('text_delta', ...)` 跟主进程对话；HTTP/SSE 全删 | `ipcMain.handle` / `webContents.send` / `contextBridge.exposeInMainWorld` |
| day16 | ⬜ | 原生能力 + 自定义协议——文件对话框（导出 / 导入会话）、原生菜单栏、`Notification` 系统通知、`protocol.handle('pi-agent://')` 深链 / 本地资源加载 | `dialog.showOpenDialog` / `Menu.buildFromTemplate` / `Notification` / `protocol.handle` |

## 目录结构

```
pi-agent-101/
├── README.md                ← 本文件：总体规划
├── day1/                    ← CLI REPL 最小对话（[README](./day1/README.md)）
│   ├── agent.ts
│   ├── package.json
│   ├── node_modules/        （npm install 后本地依赖）
│   └── README.md
├── day2/ ... day16/         ← 后续每天一个独立目录，互不干扰
```

## 怎么跑

```bash
cd day1
npm install   # 一次性安装 @earendil-works/pi-coding-agent
npm start     # node --experimental-strip-types agent.ts
```

详见 [day1 的 README](./day1/README.md)。

## 一些设计约定

- 每个 day 自包含一份 `package.json` / `node_modules` / `README.md`，可以单独回看、单独运行
- 注释和文档全部中文，代码本身（变量名、import、字符串字面量）保持英文
- 单一职责：每个 day 只点亮 1-2 个新能力，不引入超前概念
- 不引入额外依赖：Node 24 默认开启 `--experimental-strip-types`，无需 tsx/bundler