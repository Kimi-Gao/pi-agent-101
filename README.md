# pi-agent-101

**[中文]** | [English](https://github.com/Kimi-Gao/pi-agent-101/blob/main/README.md)

基于 pi SDK 逐步构建一个 Electron 桌面版的 pi agent 聊天对话应用。

最终目标：一个可双击启动的 Electron 原生桌面聊天应用。整个课程按 Agent 的能力阶段分三段：**Agent原理**——弄清 Agent 的三种呈现形态：CLI / Web / Desktop；**初级Agent**——逐日点亮基础能力，含多会话；**高级Agent**——达到 Claude Code 同等能力 + Electron 原生能力补齐。day3 起全程在 Electron 主进程 / 渲染进程的架构下开发：chat transport 直接走 IPC+preload（无 loadURL 壳阶段）；Notification / dialog / Menu / `protocol.handle` 等 Electron 原生能力按各自 day 的需要落地。

## 总体规划

### Agent原理

> 弄清楚 Agent 是什么、怎么跑、有几种基本呈现形式：CLI / Web UI / Desktop Agent（单会话形态）。

| Day | 状态 | 目标 | 关键技能 / pi SDK 能力 |
| --- | --- | --- | --- |
| [**day1**](./day1/) | ✅ | CLI REPL 最小对话 | `createAgentSession`、`subscribe`、`prompt` |
| [**day2**](./day2/) | ✅ | Web UI 最小版（单会话 + SSE 流式推送） | Node `http` + `EventSource`；服务端把 `subscribe` 的事件转写成 SSE |
| day3 | ⬜ | **Desktop Agent 起步**（单会话形态） — 第一次接触 Electron：单会话（跟 day2 对齐）+ **transport 用 native IPC**：HTTP/SSE 全砍，主进程直接持有 pi session，渲染进程通过 `contextBridge` 暴露的 `pi.prompt()` / `pi.on('text_delta', ...)` 跟主进程对话 | `electron` + `ipcMain.handle` / `webContents.send` / `contextBridge.exposeInMainWorld` + `createAgentSession` |

### 初级Agent

> 在 day3 的单会话 Electron 应用之上，逐日点亮基础能力：多会话、工具可视化、Skills、思考过程、持久化。

| Day | 状态 | 目标 | 关键技能 / pi SDK 能力 |
| --- | --- | --- | --- |
| day4 | ⬜ | **多会话管理**（侧边栏 + 新建/切换/删除会话）— 在 day3 单会话之上接入 `createAgentSessionRuntime` | `createAgentSessionRuntime` + `runtime.newSession` / `switchSession` |
| day5 | ⬜ | 工具调用可视化（每次工具调用一张可折叠卡片） | `tool_execution_start` / `_update` / `_end` 三事件 |
| day6 | ⬜ | Skills 面板 + 自定义工具按钮 | `DefaultResourceLoader({ skillsOverride })` + `defineTool` |
| day7 | ⬜ | 思考过程可视化 + 工具人工审批（基础版） | `thinking_delta` 事件 + 事件拦截 |
| day8 | ⬜ | 持久化（基础） — SessionManager 把会话落盘，重启可恢复 | `SessionManager.create` |

### 高级Agent

> 达到 Claude Code 同等能力：MCP、Sub-agent、Hooks、Compaction、Slash + Plan Mode；以及 Electron 原生能力补齐（Notification / dialog / Menu / `protocol.handle`）。

| Day | 状态 | 目标 | 关键技能 / pi SDK 能力 |
| --- | --- | --- | --- |
| day9 | ⬜ | 工具权限审批系统（人类在环）+ **Notification** 系统通知 | 拦截 `tool_execution_start`；前端弹确认框；服务端挂起等用户决策再放行。参考 `examples/extensions/permission-gate.ts` + `Notification` |
| day10 | ⬜ | MCP 集成（接入外部工具协议） | `extensionFactories` + MCP server；工具自动注册到 session。前端把 MCP 工具列在工具面板 |
| day11 | ⬜ | Sub-agent（Task 工具 + 嵌套 session） | 自定义 `task` 工具；内部 `createAgentSession` 起子会话；把子会话的事件流冒泡到父会话。参考 `examples/extensions/subagent/` |
| day12 | ⬜ | Hooks / 扩展机制全掌握 | `pi.on()` 监听所有事件；`ctx.ui.confirm/notify` 与用户交互；`ctx.sendUserMessage` 注入消息 |
| day13 | ⬜ | 会话恢复 + 分支 + **dialog 文件对话框**（导入 / 导出） | `SessionManager.list/open/continueRecent` + `navigateTree` + `fork` + `dialog.showOpenDialog` / `showSaveDialog` |
| day14 | ⬜ | Compaction（长会话自动压缩） | `session.compact()` + `SettingsManager` 中的 `compaction.enabled` / 阈值；前端展示压缩事件 |
| day15 | ⬜ | Slash commands + 主题 + Plan Mode + **原生菜单** + **`protocol.handle('pi-agent://')` 深链** | `promptsOverride` 注入命令；主题文件；`Menu.buildFromTemplate` + `protocol.handle` |

## 目录结构

```
pi-agent-101/
├── README.md                ← 本文件：总体规划
├── day1/                    ← CLI REPL 最小对话（[README](./day1/README.md)）
│   ├── agent.ts
│   ├── package.json
│   ├── node_modules/        （npm install 后本地依赖）
│   └── README.md
├── day2/ ... day15/         ← 后续每天一个独立目录，互不干扰
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