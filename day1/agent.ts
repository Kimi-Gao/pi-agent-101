/**
 * day1：命令行 REPL 最小对话
 *
 * 教学目标：看清 pi SDK 的四个核心调用（ModelRuntime / createAgentSession /
 *           subscribe / prompt），用最少代码跑通一个能对话的程序。
 *
 * 运行：node --experimental-strip-types agent.ts
 *      或 npm start
 */

import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

// ① 导入 SDK
// 我们只用到三个导出，全部来自 pi-coding-agent 一个包。
import {
  createAgentSession, // 工厂：返回一个 AgentSession（对话状态 + 工具 + LLM 循环）
  ModelRuntime,       // 凭据中心 + 模型目录（读 ~/.pi/agent/auth.json、models.json）
  SessionManager,     // 会话管理：内存 / 持久化 / 恢复旧会话
} from "@earendil-works/pi-coding-agent";

// ② 初始化模型运行时
// ModelRuntime.create() 会读 ~/.pi/agent/auth.json 和 models.json，
// 之后可以 setRuntimeApiKey() / getAvailable() / refresh()。
const modelRuntime = await ModelRuntime.create();

// 只列已配置凭据的模型，避免选了模型却调不通。
const available = await modelRuntime.getAvailable();
if (available.length === 0) {
  process.stderr.write(
    "没有可用模型。\n" +
      "请配置 ~/.pi/agent/auth.json，或设置环境变量 ANTHROPIC_API_KEY 等。\n",
  );
  process.exit(1);
}

// 简单起见选第一个；想指定可用 getModel("anthropic", "claude-opus-4-5")。
const model = available[0];
process.stderr.write(`[model] ${model.provider}/${model.id}\n`);

// ③ 创建一个 AgentSession
// createAgentSession() 是 SDK 的唯一入口；TUI / print / RPC 模式都基于它。
// 这里只开只读工具，避免 agent 误改你文件。常见值：
//   "read" | "bash" | "edit" | "write" | "grep" | "find" | "ls"
const { session } = await createAgentSession({
  modelRuntime,
  sessionManager: SessionManager.inMemory(),  // 内存会话，不写磁盘
  tools: ["read", "grep", "find", "ls"],
});

// ④ 订阅事件流
// SDK 把 LLM 的增量输出、工具调用、生命周期全部以事件形式抛出。
// 这里只关心三种：流式文本、工具调用开始、一轮结束。
// 这一行里其实有三个名字，容易混淆，拆开说：
//   session.subscribe  — 订阅动作（把回调挂到事件流上）。
//   (event) => { ... }  — 回调本身：每来一个事件做什么。
//   unsubscribe        — subscribe() 返回的退订句柄，调用它就取消订阅。
// 本 demo 不会调它，因为进程马上就要退出；长跑的 agent 应该在
// cleanup / dispose 路径里调一次，避免监听器泄漏。
const unsubscribe = session.subscribe((event) => {
  switch (event.type) {
    case "message_update": {
      const e = event.assistantMessageEvent;
      // assistantMessageEvent.type 还有 "thinking_delta"（思考过程）等。
      if (e.type === "text_delta") process.stdout.write(e.delta);
      break;
    }
    case "tool_execution_start":
      process.stderr.write(`\n[tool] ${event.toolName}\n`);
      break;
    case "agent_end":
      process.stderr.write("\n");
      break;
  }
});

// ⑤ REPL 主循环
// readline 每次拿到一行用户输入，调用 session.prompt() 发给 agent。
// prompt() 会一直 await 到本轮结束（LLM 回复 + 工具调用 + 重试）。
const rl = readline.createInterface({ input: stdin, output: stdout });
process.stderr.write("\n输入消息开始对话，输入 exit 退出。\n");

try {
  while (true) {
    const text = (await rl.question("you> ")).trim();
    if (!text) continue;
    if (/^(exit|quit)$/i.test(text)) break;

    process.stdout.write("assistant> ");
    await session.prompt(text); // ★ SDK 核心调用
    process.stdout.write("\n");
  }
} catch (err) {
  process.stderr.write(`\n[error] ${(err as Error).message}\n`);
} finally {
  // dispose() 释放事件订阅和 session 持有的资源，务必在退出前调用。
  unsubscribe();
  session.dispose();
  rl.close();
}