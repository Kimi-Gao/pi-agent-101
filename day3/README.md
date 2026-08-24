# day3：多会话管理 Web UI

本目录是 `pi-agent-101` 项目的 **day3** —— 第一篇第三站。
整体规划见仓库根目录的 [README.md](../README.md)；前一篇见 [day2](../day2/README.md)。

## 为什么

day2 是单会话 —— 所有浏览器标签页共享同一份 history,并发 prompt 会被 409 拒绝。
真实使用场景需要多个独立会话:这边调试一个,那边开一个全新话题聊别的;切会话不能丢历史。

day3 的目标只有一个:**点亮多会话**。每个会话是独立的 `AgentSession` 实例,有自己的
history、SSE 订阅者集合和 `isProcessing` 互斥锁。切换 = 前端 close EventSource + 后端换
sessionId,不丢历史、不打架。

## 运行

需要 Node ≥ 22.6(Node 24 默认开启 `--experimental-strip-types`,无需 tsx 或编译)。

```bash
cd day3
npm install        # 安装 @earendil-works/pi-coding-agent
npm start          # 默认监听 http://localhost:5173
```

启动后:

```
[model] xxx/xxx
[http] listening on http://localhost:5173
```

浏览器打开 → 看到左侧侧边栏(目前空)+ 右侧 chat 区。点 **+ 新建会话** 创建,点
列表条目切换,点 **×** 删除。

## 五个 HTTP 路由

`server.ts` 用 Node 原生 `http` 起服务,共五个路由:

| 路由 | 方法 | 作用 |
| --- | --- | --- |
| `/` | `GET` | 返回 chat UI(HTML 在独立文件 `chat-ui.html`) |
| `/api/sessions` | `GET` | 列出所有会话 `{ sessions: [{id, busy}] }` |
| `/api/sessions` | `POST` | 新建一个会话,返回 `{ id }`(后端调一次 `createAgentSession`) |
| `/api/sessions/:id` | `DELETE` | 释放该会话的所有 SSE → unsubscribe → `dispose()` → 从 map 删除 |
| `/api/events?session=:id` | `GET` | SSE 端点,**只**广播该会话的 SDK 事件 |
| `/api/prompt` | `POST` | `{ sessionId, text }`,在指定会话上 `await session.prompt(text)` |

会话 busy 时 `/api/prompt` 返回 `409 agent is busy`;每个会话各自的互斥锁,不影响其他会话。

## 数据结构:一个 Entry = 一个完整会话

```ts
type Entry = {
  id: string;                                  // crypto.randomUUID()
  session: AgentSession;                       // SDK 会话(独立 history + 独立 LLM 循环)
  subscribers: Set<http.ServerResponse>;       // 当前正在订阅这个会话 SSE 的浏览器标签页
  isProcessing: boolean;                       // 这个会话的并发互斥锁
  unsubscribe: () => void;                     // session.subscribe() 返回的退订句柄
};
const sessions = new Map<string, Entry>();
```

每个 Entry 独立创建一个 `AgentSession`,独立订阅一次 SDK 事件流,广播时只往自己
的 `subscribers` Set 写。删除时:`end()` 所有 SSE → `unsubscribe()` → `session.dispose()`。

## 三种 SDK 事件 → 三种 SSE 帧(同 day2)

`session.subscribe()` 在 day3 仍然只翻译三种事件:

| SDK 事件 | SSE 帧 |
| --- | --- |
| `message_update` 且 `text_delta` | `event: text_delta` `data: {"delta":"…"}` |
| `tool_execution_start` | `event: tool_start` `data: {"toolName":"…"}` |
| `agent_end` | `event: agent_end` `data: {}` |

跟 day2 唯一区别:**每个会话各自调一次 `subscribe()`**,各自维护一个 `subscribers` Set。
切换会话 = 前端 close 旧 `EventSource` + open 新 `EventSource`,旧会话的事件流在后端
照常订阅者收不到(因为前端已经 close 了),新会话的事件流独立推给当前订阅者。

## 前端记忆当前会话

刷新页面后,前端用 `localStorage.getItem("currentId")` 记住上次浏览的 sessionId,自动
重连它的 SSE 流。如果该 id 已经被删除,前端从侧边栏找另一个会话作为当前。

这是客户端状态的最小持久化(几行 localStorage),不涉及 SDK 的 SessionManager
持久化机制 —— 那是 day11 的内容。

## 代码骨架(按行速览)

```
① ModelRuntime.create()           ←  加载凭据 + 模型目录
② createAgentSession() factory   ←  返回新的 AgentSession(每次创建独立)
③ Map<id, Entry> + subscribers   ←  每个会话独立的事件广播通道
④ fs.readFileSync(chat-ui.html)  ←  启动时一次性读入 HTML
⑤ http.createServer()              ←  5 个路由:/、/api/sessions(GET/POST/DELETE)、
                                    /api/events、/api/prompt
⑥ SIGINT/SIGTERM 优雅退出         ←  遍历 sessions → disposeEntry → exit
```

## 术语解释

按 day3 代码中出现顺序解释:

| 术语 | 解释 |
| --- | --- |
| **多会话 (multi-session)** | 一个进程里同时存在多个独立的 `AgentSession`,各自维护自己的 messages 数组和 LLM 循环。**不要**跟 `AgentSessionRuntime` 混为一谈 —— 后者是"单当前会话 + 切换"的 UX 模型(day11 才用)。 |
| **Entry** | day3 自己定义的复合类型,把 `AgentSession` + SSE 订阅者 Set + 互斥锁 + unsubscribe 句柄打包在一起。map 的 value 就是 Entry,增删改查都走它。 |
| **subscribers (per-session)** | 每个 Entry 自己持有一个 `Set<http.ServerResponse>`。事件来时 `for (const res of entry.subscribers) res.write(...)`。同一会话可以被多个标签页同时订阅,各自独立收流。 |
| **sessionId** | `crypto.randomUUID()` 生成的字符串,既是后端 map 的 key,也是 SSE URL 的 query param,还是 localStorage 里记住当前会话的键。 |
| **localStorage** | 浏览器原生持久化 KV(day3 用来记 currentId)。进程重启 / 浏览器关掉再开,会话能"复活" —— 但只复活当前那个,不会复活侧边栏的全部列表(那需要 SessionManager 持久化)。 |
| **crypto.randomUUID()** | Node 24 + 现代浏览器都内置的 UUID v4 生成器。免 import,免依赖。 |

## 常见扩展点

- **多端队列**:每个 Entry 的 `isProcessing` 是布尔。改成 `Promise` 队列,就能让多端排队等候同一个会话,而不会 409。
- **持久化**:把 `SessionManager.inMemory()` 换成 `SessionManager.create(process.cwd())`,进程重启后 `createAgentSession` 会自动恢复会话 history —— 但 day3 的 Map 仍然清空,所以侧边栏列表会是空的(day11 解决)。
- **历史回放**:切到旧会话时,前端目前 clearLog 然后等新事件。读 `session.state.messages` 把历史一次性渲染出来,是更完整的体验。day11 会做。
- **重命名**:现在侧边栏只有 `session xxxxxxxx`(短 id)。加一个 `PATCH /api/sessions/:id { name }` + Entry 加 `name` 字段即可。

## 下一步

进入 **day4:工具调用可视化**。把 `tool_execution_start` 之外再加 `tool_execution_update` /
`tool_execution_end` 三个事件,前端对每次工具调用渲染一张可折叠的卡片(工具名 + 参数 +
执行中... + 结果),让 agent 在"做事"的过程对用户可见。