# pi-agent-101

**[中文]** | [English](https://github.com/Kimi-Gao/pi-agent-101/blob/main/README.md)

基于 pi SDK 逐步构建一个 Electron 桌面版的 pi agent 聊天对话应用。

最终目标：一个可双击启动的 Electron 原生桌面聊天应用。整个课程分两块：**浏览器时代**（day1-day2，纯 Web UI in browser）和 **Desktop Agent 时代**（day3-day14，Electron 桌面应用）。day3 起以 Electron 重构起步，逐日叠加 Web UI + Claude Code 能力；期间通过 IPC+preload（day4）/ Notification（day8）/ dialog（day12）/ Menu + `protocol.handle`（day14）等 Electron 原生能力，把 day2 的浏览器 Web UI 真正转换为桌面应用。

## 总体规划

### 浏览器时代：Web UI in browser（day1-day2）

> 这两个 day 把"在浏览器里跟 agent 聊天"打通。所有协议都是标准 Web 技术（HTTP / SSE），打开浏览器就能跑。

| Day | 状态 | 目标 | 关键技能 / pi SDK 能力 |
| --- | --- | --- | --- |
| [**day1**](./day1/) | ✅ | 命令行 REPL 最小对话 | `createAgentSession`、`subscribe`、`prompt` |
| [**day2**](./day2/) | ✅ | Web UI 最小版（单会话 + SSE 流式推送） | Node `http` + `EventSource`；服务端把 `subscribe` 的事件转写成 SSE |

### Desktop Agent 时代：Electron-based（day3-day14）

> day3 起全部跑在 Electron 桌面应用里。内部再分两个子阶段：**A. 用 Electron 重构起步**（day3-day7）、**B. Claude Code 能力补齐**（day8-day14）。
>
> 跟浏览器时代的最大差别：day3 起全程在 Electron 主进程 / 渲染进程的架构下开发；chat transport 在 day4 由 HTTP/SSE 升级到 IPC+preload；Notification / dialog / Menu / `protocol.handle` 等 Electron 原生能力按各自 day 的需要落地。

#### 阶段 A：用 Electron 重构起步（day3-day7）

用 Electron 重构 day2 的 Web UI，逐日叠加会话/工具/Skills/思考能力。day3 还是 loadURL 套壳，day4 完成 transport 升级后就是真正的原生 Electron 应用。

| Day | 状态 | 目标 | 关键技能 |
| --- | --- | --- | --- |
| day3 | ⬜ | **Electron 最小壳** — `npm start` 一键起 Electron 窗口，内嵌 day2 的 dev server；首次接触 Electron 主进程 / 渲染进程 / `BrowserWindow` 概念 | `electron` + `BrowserWindow({ loadURL })`；day4 升级到 IPC+preload |
| day4 | ⬜ | 多会话管理 + **transport 升级** — 侧边栏 + 新建/切换/删除会话；HTTP/SSE 全砍，主进程直接持有 pi session，渲染进程通过 `contextBridge` 暴露的 `pi.prompt()` / `pi.on('text_delta', ...)` 跟主进程对话 | `createAgentSessionRuntime`、`runtime.newSession` / `switchSession` + `ipcMain.handle` / `webContents.send` / `contextBridge.exposeInMainWorld` |
| day5 | ⬜ | 工具调用可视化（每次工具调用一张可折叠卡片） | `tool_execution_start` / `_update` / `_end` 三事件 |
| day6 | ⬜ | Skills 面板 + 自定义工具按钮 | `DefaultResourceLoader({ skillsOverride })` + `defineTool` |
| day7 | ⬜ | 思考过程可视化 + 工具人工审批 + 持久化 | `thinking_delta` 事件 + 事件拦截 + `SessionManager.create` |

#### 阶段 B：Claude Code 能力补齐（day8-day14）

> Pi 官方明确声明**故意不内置** MCP、Sub-agent、权限弹窗、Plan Mode。这些能力需要通过扩展机制自己构建或安装第三方包。
> 引用：`docs/usage.md:304` — "It intentionally does not include built-in MCP, sub-agents, permission popups, plan mode..."

每个能力对应"读 pi 官方示例扩展 → 理解实现原理 → 落地到 Electron 应用"。每个 day 按需引入 Electron 原生能力。

| Day | 状态 | 目标 | 关键技能 / pi SDK 能力 |
| --- | --- | --- | --- |
| day8 | ⬜ | 工具权限审批系统（人类在环）+ **Notification** 系统通知 | 拦截 `tool_execution_start`；前端弹确认框；服务端挂起等用户决策再放行。参考 `examples/extensions/permission-gate.ts` + `Notification` |
| day9 | ⬜ | MCP 集成（接入外部工具协议） | `extensionFactories` + MCP server；工具自动注册到 session。前端把 MCP 工具列在工具面板 |
| day10 | ⬜ | Sub-agent（Task 工具 + 嵌套 session） | 自定义 `task` 工具；内部 `createAgentSession` 起子会话；把子会话的事件流冒泡到父会话。参考 `examples/extensions/subagent/` |
| day11 | ⬜ | Hooks / 扩展机制全掌握 | `pi.on()` 监听所有事件；`ctx.ui.confirm/notify` 与用户交互；`ctx.sendUserMessage` 注入消息 |
| day12 | ⬜ | 会话持久化 + 恢复 + 分支 + **dialog 文件对话框**（导入 / 导出） | `SessionManager.create/list/open/continueRecent` + `navigateTree` + `fork` + `dialog.showOpenDialog` / `showSaveDialog` |
| day13 | ⬜ | Compaction（长会话自动压缩） | `session.compact()` + `SettingsManager` 中的 `compaction.enabled` / 阈值；前端展示压缩事件 |
| day14 | ⬜ | Slash commands + 主题 + Plan Mode + **原生菜单** + **`protocol.handle('pi-agent://')` 深链** | `promptsOverride` 注入命令；主题文件；`Menu.buildFromTemplate` + `protocol.handle` |

## 目录结构

```
pi-agent-101/
├── README.md                ← 本文件：总体规划
├── day1/                    ← CLI REPL 最小对话（[README](./day1/README.md)）
│   ├── agent.ts
│   ├── package.json
│   ├── node_modules/        （npm install 后本地依赖）
│   └── README.md
├── day2/ ... day14/         ← 后续每天一个独立目录，互不干扰
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