# pi-agent-101

**[中文]** | [English](https://github.com/Kimi-Gao/pi-agent-101/blob/main/README.md)

基于 pi SDK 构建 Web UI Agent 对话框的渐进式教学项目。

最终目标：一个能在浏览器里跟 agent 对话、可触发 skill、可视化工具调用、并拥有 Claude Code 同等基础能力（权限审批 / MCP / Sub-agent）的 Web UI。

## 总体规划

### 第一篇：基础（从 0 到能用的 Web UI）

目标：从命令行起步，逐步演进到一个能在浏览器里聊天的 Web UI。

| Day | 状态 | 目标 | 关键技能 / pi SDK 能力 |
| --- | --- | --- | --- |
| [**day1**](./day1/) | ✅ | 命令行 REPL 最小对话 | `createAgentSession`、`subscribe`、`prompt` |
| [**day2**](./day2/) | ✅ | Web UI 最小版（单会话 + SSE 流式推送） | Node `http` + `EventSource`；服务端把 `subscribe` 的事件转写成 SSE |
| [**day3**](./day3/) | ✅ | 多会话管理（侧边栏 + 新建/切换/删除会话） | `createAgentSessionRuntime`、`runtime.newSession` / `switchSession` |
| day4 | ⬜ | 工具调用可视化（每次工具调用一张可折叠卡片） | `tool_execution_start` / `_update` / `_end` 三事件 |
| day5 | ⬜ | Skills 面板 + 自定义工具按钮 | `DefaultResourceLoader({ skillsOverride })` + `defineTool` |
| day6 | ⬜ | 思考过程可视化 + 工具人工审批 + 持久化 | `thinking_delta` 事件 + 事件拦截 + `SessionManager.create` |

### 第二篇：进阶（Claude Code 基础能力）

> Pi 官方明确声明**故意不内置** MCP、Sub-agent、权限弹窗、Plan Mode。这些能力需要通过扩展机制自己构建或安装第三方包。
> 引用：`docs/usage.md:304` — "It intentionally does not include built-in MCP, sub-agents, permission popups, plan mode..."

第二篇的每一个能力都对应"读 pi 官方示例扩展 → 理解实现原理 → 在我们的 Web UI 中落地"。

| Day | 状态 | 目标 | 关键技能 / pi SDK 能力 |
| --- | --- | --- | --- |
| day7 | ⬜ | 工具权限审批系统（人类在环） | 拦截 `tool_execution_start`；前端弹确认框；服务端挂起等用户决策再放行。参考 `examples/extensions/permission-gate.ts` |
| day8 | ⬜ | MCP 集成（接入外部工具协议） | `extensionFactories` + MCP server；工具自动注册到 session。前端把 MCP 工具列在工具面板 |
| day9 | ⬜ | Sub-agent（Task 工具 + 嵌套 session） | 自定义 `task` 工具；内部 `createAgentSession` 起子会话；把子会话的事件流冒泡到父会话。参考 `examples/extensions/subagent/` |
| day10 | ⬜ | Hooks / 扩展机制全掌握 | `pi.on()` 监听所有事件；`ctx.ui.confirm/notify` 与用户交互；`ctx.sendUserMessage` 注入消息 |
| day11 | ⬜ | 会话持久化 + 恢复 + 分支 | `SessionManager.create/list/open/continueRecent` + `navigateTree` + `fork` |
| day12 | ⬜ | Compaction（长会话自动压缩） | `session.compact()` + `SettingsManager` 中的 `compaction.enabled` / 阈值；前端展示压缩事件 |
| day13 | ⬜ | Slash commands + 主题 + Plan Mode | `promptsOverride` 注入命令；主题文件；参考 `examples/extensions/plan-mode/` 自行实现 |

## 目录结构

```
pi-agent-101/
├── README.md                ← 本文件：总体规划
├── day1/                    ← CLI REPL 最小对话（[README](./day1/README.md)）
│   ├── agent.ts
│   ├── package.json
│   ├── node_modules/        （npm install 后本地依赖）
│   └── README.md
├── day2/ ... day13/         ← 后续每天一个独立目录，互不干扰
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