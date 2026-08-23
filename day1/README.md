# day1：命令行 REPL 最小对话

本目录是 `agent-mini` 项目的 **day1** —— 第一篇基础的开端。
整体规划见仓库根目录的 [README.md](../README.md)。

## 为什么

目标是用最少代码看清 SDK 的核心调用，方便后续深入学习扩展。

## 运行

需要 Node ≥ 22.6（Node 24 默认开启 `--experimental-strip-types`，无需 tsx 或编译）。

```bash
cd day1
npm install   # 安装 @earendil-works/pi-coding-agent
npm start     # node --experimental-strip-types agent.ts
```

启动后会看到 `[model] xxx/xxx`，然后进入 REPL，输入消息即可对话，输入 `exit` 退出。

## 核心 SDK 调用一览

`agent.ts` 里依次出现的 6 个 SDK 调用：

| # | 调用 | 作用 |
| - | ---- | ---- |
| ① | `ModelRuntime.create()` | 加载 `~/.pi/agent/auth.json` 和 `models.json`，管理凭据和模型目录 |
| ② | `modelRuntime.getAvailable()` | 列出已认证可用的模型 |
| ③ | `createAgentSession({...})` | 创建一个 `AgentSession`（对话状态 + 工具 + LLM 循环） |
| ④ | `session.subscribe(cb)` | 订阅事件流（流式文本、工具调用、生命周期） |
| ⑤ | `session.prompt(text)` | 发送用户消息，并 `await` 到本轮结束 |
| ⑥ | `session.dispose()` | 释放事件订阅和持有的资源 |

## 代码骨架（按行速览）

```
① ModelRuntime.create()        ←  加载凭据 + 模型目录
② getAvailable() / 取首个模型  ←  选模型
③ createAgentSession()         ←  组装一个会话（工具 + 会话管理器 + 模型）
④ session.subscribe()          ←  开始监听事件（流式文本 / 工具 / 生命周期）
⑤ REPL 循环 + session.prompt() ←  每次输入发一条消息，等本轮结束
⑥ finally 里 dispose           ←  释放资源
```

## 三种事件类型（day1 只用到）

- `message_update`：当 `assistantMessageEvent.type === "text_delta"` 时，是 LLM 的增量输出文本，直接 `write` 到 stdout 就是流式效果
- `tool_execution_start`：工具被调用前触发（虽然 day1 工具都是只读的，看不到副作用，但日志里能体现）
- `agent_end`：一轮结束（LLM 回复 + 所有工具调用 + 重试都完成后），用来换行

后续 day 会用到更多事件：`tool_execution_update` / `tool_execution_end`（day4）、`thinking_delta`（day6）、`compaction_*`（day12）等。

## 术语解释

按 day1 代码中出现顺序解释，几个后续 day 会接触到的词也一并列出：

| 术语 | 解释 |
| --- | --- |
| **REPL** | Read-Eval-Print Loop，读取一行输入、求值（执行）、打印结果、循环。day1 的命令行主循环就是经典 REPL 模式。 |
| **ModelRuntime** | pi SDK 的“凭据中心 + 模型目录”。读 `~/.pi/agent/auth.json` 和 `models.json`，提供 `getAvailable()` / `setRuntimeApiKey()` / `refresh()` 等方法。 |
| **AgentSession** | 一个完整的 agent 会话实例。包含对话状态、可调用的工具、当前模型，以及 LLM 循环（接收 → 调工具 → 回 LLM → 重复 → 结束）。 |
| **SessionManager** | 会话管理器。负责会话的生命周期——创建 / 持久化 / 恢复 / 列出 / 删除。day1 用 `SessionManager.inMemory()` 表示不写磁盘、重启即丢。 |
| **prompt（动词）** | 在 LLM 语境里，`session.prompt(text)` 表示“把用户这条消息发给 agent 并等本轮完整结束（包含所有 tool 调用和重试）”。不是 CLI 里那种“输入提示符”的意思。 |
| **subscribe** | 订阅 session 内部的事件流。LLM 的流式输出、tool 调用、生命周期都通过事件抛出，subscribe 是接收它们的唯一渠道。 |
| **dispose** | 释放 session 持有的资源（事件订阅、内部状态等）。进程退出前必须调用，否则可能泄漏。 |
| **RPC** | Remote Procedure Call，远程过程调用。day1 不用，但 pi SDK 提供 RPC 模式（`runRpcMode`），可让其他进程用 JSON-RPC 跟 agent 通信。后续 day 可能会用到。 |
| **SSE** | Server-Sent Events，服务端推送。day2 会用 Node 原生 `http` 加 `text/event-stream` 响应头，把 session 的事件流推到浏览器，前端用 `EventSource` 接收。 |

## pi monorepo 包结构

pi 是一个分层的 monorepo，`@earendil-works/pi-coding-agent` 只是最外层的"产品壳"。
理解各包的分工后，你才知道"什么时候该读哪个仓库 / import 哪个包"。

仓库：<https://github.com/earendil-works/pi/tree/main/packages>

### 依赖关系

```
┌─────────────────────────────────────────────────────────────┐
│  pi-coding-agent   ← CLI / SDK 入口，本仓库用的就是这个     │
│       │                                                       │
│       ├──► pi-agent-core    有状态 agent（tool 执行 + 事件流）│
│       │         │                                            │
│       │         └──► pi-ai    统一 LLM API（多 provider 适配）│
│       │                                                        │
│       ├──► pi-protocol   运行时无关的协议 schema + CBOR 编码  │
│       │       ▲                                              │
│       │       │                                              │
│       └──► pi-client     远程会话客户端（走 pi-protocol）     │
│                                                                │
│  pi-tui            终端 UI 框架（差分渲染、防闪烁）           │
│  pi-telemetry      供应商中立的遥测契约与类型化 schema          │
└─────────────────────────────────────────────────────────────┘
```

### 各包职责

| 包 | 职责 | 何时需要看它 |
| --- | --- | --- |
| **[pi-ai](https://github.com/earendil-works/pi/tree/main/packages/ai)** | 统一 LLM API：多 provider 适配（Anthropic / OpenAI / Gemini / 自定义…）、自动凭据解析、token & cost 跟踪、会话中途换模型。只收录支持 tool calling 的模型。 | 你想直接调 LLM（不带 agent 循环），或想加自定义 provider。 |
| **[pi-agent-core](https://github.com/earendil-works/pi/tree/main/packages/agent-core)** | 有状态 agent：`Agent` 类负责 tool 执行 + 事件流。基于 `pi-ai`，不依赖 TUI/CLI。SQLite 会话后端是独立包 `pi-session-backend-sqlite-node`。 | 你想自己写一个 agent 框架 / 想直接操作 `state.messages` / `.tools`。 |
| **[pi-protocol](https://github.com/earendil-works/pi/tree/main/packages/protocol)** | 运行时无关的协议：消息 schema、CBOR 编码、长度前缀字节流帧。协议版本 1：4 字节大端长度 + 一条 CBOR 消息。 | 你要实现自定义传输（WebSocket / Unix socket / IPC）让 pi 跑在远端。 |
| **[pi-tui](https://github.com/earendil-works/pi/tree/main/packages/tui)** | 极简终端 UI 框架：差分渲染、CSI 2026 同步输出（防闪烁）、Markdown / Editor / SelectList 等组件、Kitty / iTerm2 内联图片。 | 你要给 pi 写一套自定义 TUI，或复用它的组件做别的 CLI。 |
| **[pi-client](https://github.com/earendil-works/pi/tree/main/packages/client)** | 远程 pi 会话的传输中立客户端：`PiClient` 走长度前缀 CBOR，通过 `ByteTransport` 接口接入。无 Node 专用依赖。 | 你的前端 / 服务端要连接一个远端 pi 进程。 |
| **[pi-telemetry](https://github.com/earendil-works/pi/tree/main/packages/telemetry)** | 供应商中立的遥测契约：`TelemetryContext` / `TelemetrySpan`、可序列化 schema、内存实现参考。无 exporter，不绑 OpenTelemetry。 | 你想把 pi 接入自家可观测性平台（OpenTelemetry / Sentry / 日志）。 |
| **[pi-coding-agent](https://github.com/earendil-works/pi/tree/main/packages/coding-agent)** | 把上面拼起来的 CLI + SDK：内置 `read` / `bash` / `edit` / `write` 等工具、会话管理、扩展机制、3 种运行模式（interactive / print / RPC）。 | **默认起点。** `agent.ts` 里 import 的就是它。 |

### 本教程 import 的是哪个

`agent.ts` 里只有一行 import，全部来自 **`pi-coding-agent`**：

```ts
import { createAgentSession, ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";
```

这意味着：
- `createAgentSession()` 内部组装了 `pi-agent-core` + `pi-ai` + 各种工具。
- `ModelRuntime` 是 `pi-ai` 凭据解析 + 模型目录的薄包装，加上 SDK 层的诊断信息。
- `SessionManager` 是 SDK 层的会话树管理（fork / branch / 持久化）。

如果你只做"嵌入式 agent"，`pi-coding-agent` 就够了。
当你要做"自定义传输 / 自定义 UI / 接入自己模型目录"时，再去直接读下面的子包。

## 扩展阅读

只列和 day1 直接相关的官方资源（其他能力会在后续 day 里出现）：

- [docs/sdk.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md) — pi SDK 全量参考手册。读“Quick Start”和“Core Concepts”两节就足够理解 day1 的所有调用。
- [examples/sdk/01-minimal.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/sdk/01-minimal.ts) — pi 官方最简示例，和 day1 是同骨架，可以两边对着看。
- [examples/sdk/05-tools.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/sdk/05-tools.ts) — 工具白名单与自定义工具（`defineTool`）。day1 用到了内置工具部分。
- [examples/sdk/11-sessions.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/sdk/11-sessions.ts) — 会话管理与持久化。day1 用到了 `SessionManager.inMemory()`。

## 常用扩展点

只列 day1 代码里能直接改、立刻能看到效果的几行改动：

- **加 bash / edit / write 工具**：把 `agent.ts` 里 `tools: [...]` 改成 `["read", "bash", "edit", "write"]`，agent 就能写文件和跑命令了（注意安全）。
- **持久化对话**：把 `SessionManager.inMemory()` 换成 `SessionManager.create(process.cwd())`，会话会写到 `~/.pi/agent/sessions/` 下，重启后能继续。

## 下一步

进入 **day2：Web UI 最小版**。把 day1 的 REPL 替换成 HTTP handler，前端用 `EventSource` 接收 SSE 流。

根 README 的"第一篇"表格里有 day2-day6 的完整路线图。