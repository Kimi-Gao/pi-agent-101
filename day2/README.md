# day2：Web UI 最小版（单会话 + SSE 流式推送）

本目录是 `pi-agent-101` 项目的 **day2** —— 第一篇第二站。
整体规划见仓库根目录的 [README.md](../README.md)；前一篇见 [day1](../day1/README.md)。

## 为什么

day1 的 REPL 只能本地跑、且无法多人共用。把 day1 的 `process.stdout` 换成 HTTP
响应、把 readline 换成浏览器表单，就有了最基础的 Web UI：你在浏览器里输入消息，
浏览器通过 **SSE（Server-Sent Events）** 实时看到 LLM 的流式回复。

day2 的目标只有一个：**点亮"服务端 → 浏览器"的流式通路**。多会话管理（day3）、
工具可视化（day4）、skills 面板（day5）都还不要碰。

## 运行

需要 Node ≥ 22.6（Node 24 默认开启 `--experimental-strip-types`，无需 tsx 或编译）。

```bash
cd day2
npm install        # 安装 @earendil-works/pi-coding-agent
npm start          # 默认监听 http://localhost:5173
PORT=5174 npm start # 自定义端口
```

启动后看 stderr：

```
[model] xxx/xxx
[http] listening on http://localhost:5173
[http] open the URL above in a browser to start chatting
```

用浏览器打开输出的 URL 即可。输入消息回车发送，输入由后端转给 `session.prompt()`；
LLM 的流式文本 / 工具调用 / 一轮结束都会通过 SSE 推到所有连上的标签页。

## 三个 HTTP 路由

`server.ts` 用 Node 原生 `http` 模块起一个最小服务，共三个路由：

| 路由 | 方法 | 作用 |
| --- | --- | --- |
| `/` | `GET` | 返回 chat UI（HTML 内嵌在 `server.ts` 的 `HTML` 模板字符串里） |
| `/api/events` | `GET` | SSE 端点。连接建立后订阅 session 事件，每条事件写成一个 SSE 帧 |
| `/api/prompt` | `POST` | 接收 JSON `{ "text": "..." }`，调 `session.prompt(text)` |

`/api/prompt` 在 agent 上一轮还没结束时返回 `409 agent is busy` —— day2 是
单会话版，故意不排队，避免两条请求把同一个 session 的事件流搅在一起。

## 三种 SDK 事件 → 三种 SSE 帧

`session.subscribe()` 收到的 SDK 事件，在 day2 里只翻译成三种 SSE 帧：

| SDK 事件 | SSE 帧 | 浏览器侧处理 |
| --- | --- | --- |
| `message_update` 且 `assistantMessageEvent.type === "text_delta"` | `event: text_delta`<br>`data: {"delta":"…"}` | 追加到最后一条 assistant 消息 |
| `tool_execution_start` | `event: tool_start`<br>`data: {"toolName":"…"}` | 新建一条灰色 `[tool] xxx` |
| `agent_end` | `event: agent_end`<br>`data: {}` | 重新启用输入框、聚焦 |

SSE 帧格式（每帧必须以空行 `\n\n` 结尾才会被浏览器当作一条完整事件）：

```
event: text_delta
data: {"delta":"Hello"}

event: agent_end
data: {}

```

后续 day 会再接上：`tool_execution_update` / `tool_execution_end`（day4）、
`thinking_delta`（day6）、`compaction_*`（day12）。

## 代码骨架（按行速览）

```
① ModelRuntime.create()              ←  加载凭据 + 模型目录（同 day1）
② getAvailable() / 取首个模型       ←  选模型（同 day1）
③ createAgentSession()               ←  组装单会话（同 day1）
④ session.subscribe()                ←  把事件翻译成 SSE 帧 + 广播给所有 res
⑤ HTML 模板字符串                    ←  chat UI（CSS + EventSource + fetch）
⑥ http.createServer()                ←  三个路由：/、/api/events、/api/prompt
⑦ SIGINT/SIGTERM 优雅退出             ←  end 所有 SSE → unsubscribe → dispose → exit
```

## 三段连线：服务端 ↔ 浏览器

```
浏览器 (EventSource)
        │
        │  GET /api/events          ← 建立长连接
        ▼
  ┌─────────────┐                ┌──────────────────────┐
  │  http server │  SSE 帧        │  session.subscribe() │
  │  subscribers │ ◄──────────── │  (text_delta / tool_ │
  │    (Set)     │   序列化事件    │   start / agent_end) │
  └─────────────┘                └──────────────────────┘
        ▲                                ▲
        │  res.write(payload)            │
        │                                │ 事件由 LLM 循环触发
        │                                │
        │  fetch POST /api/prompt        │
        │ ───────────────────────────►   │
        │  body: { text: "..." }          │
        │                                │
        │           session.prompt(text) ─┘
```

## 术语解释

按 day2 代码中出现顺序解释，几个后续 day 会接触到的词也一并列出：

| 术语 | 解释 |
| --- | --- |
| **SSE** | Server-Sent Events，服务端推送。HTTP 长连接 + `text/event-stream` 响应头，浏览器用 `EventSource` 自动重连。比 WebSocket 简单：单向、纯 HTTP、能跨代理。 |
| **EventSource** | 浏览器原生 SSE 客户端 API。`new EventSource("/api/events")` 建立连接，`addEventListener("event_name", cb)` 收命名事件；连接断开会自动重连。 |
| **CORS** | 跨域资源共享。同源访问不需要；如果你把 chat UI 部署到别的域，需要在 server.ts 里加 `Access-Control-Allow-Origin` 等响应头。day2 同源访问，不需要。 |
| **单会话** | 整个进程共享一个 `AgentSession`。所有浏览器标签页看同一份对话历史。day3 才拆多会话。 |
| **isProcessing** | 互斥锁。`session.prompt()` 在并行调用时会互相打断消息流，day2 用这个 boolean 拒绝并发（返回 409），把"同一时刻只有一个用户消息在飞"作为最小版的正确性保证。 |
| **SSE 注释帧** | 以 `:` 开头的行（如 `: connected 1700000000000`），浏览器忽略但能立刻 flush 响应头，避免首事件到达前连接看起来"卡死"。 |

## 常见扩展点

只列 day2 代码里能直接改、立刻能看到效果的几行改动：

- **多端排队**：把 `isProcessing` 换成 `Promise` 队列，多标签页并发也能顺序处理。
- **持久化**：和 day1 一样，把 `SessionManager.inMemory()` 换成 `SessionManager.create(process.cwd())`，重启服务后对话还在。
- **写工具**：把 `tools: [...]` 改成 `["read", "bash", "edit", "write"]`，agent 就能动你文件了（注意安全）。
- **更多事件**：在 `subscribe()` 的 switch 里加 `tool_execution_update` / `_end` / `thinking_delta`，前端对应加 `addEventListener` —— 这是 day4 和 day6 的入口。

## 下一步

进入 **day3：多会话管理**。在侧边栏列出会话、点击切换、新建 / 删除会话，
每个会话独立一份 history 和 LLM 循环。SDK 里叫 `createAgentSessionRuntime` +
`runtime.newSession` / `switchSession`。