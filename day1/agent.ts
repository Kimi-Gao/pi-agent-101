/**
 * day1: CLI REPL minimum viable chat
 *
 * Learning goals: see the four core SDK calls (ModelRuntime / createAgentSession /
 *                 subscribe / prompt) in the minimum amount of code; run a chat-capable
 *                 program end-to-end.
 *
 * Run: node --experimental-strip-types agent.ts
 *      or npm start
 */

import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

// ① Import the SDK
// We only use three exports, all from the pi-coding-agent package.
import {
  createAgentSession, // Factory: returns an AgentSession (conversation state + tools + LLM loop)
  ModelRuntime,       // Credential hub + model catalog (reads ~/.pi/agent/auth.json, models.json)
  SessionManager,     // Session manager: in-memory / persistent / restore old sessions
} from "@earendil-works/pi-coding-agent";

// ② Initialize the model runtime
// ModelRuntime.create() reads ~/.pi/agent/auth.json and models.json,
// after which you can call setRuntimeApiKey() / getAvailable() / refresh().
const modelRuntime = await ModelRuntime.create();

// List only models with valid credentials, to avoid picking a model that can't be called.
const available = await modelRuntime.getAvailable();
if (available.length === 0) {
  console.error(
    "No available models.\n" +
      "Please configure ~/.pi/agent/auth.json, or set an environment variable such as ANTHROPIC_API_KEY.",
  );
  process.exit(1);
}

// Pick the first for simplicity; use getModel("anthropic", "claude-opus-4-5") to pin a specific one.
const model = available[0];
console.error(`[model] ${model.provider}/${model.id}`);

// ③ Create an AgentSession
// createAgentSession() is the SDK's only entry point; TUI / print / RPC modes are all built on it.
// Here we enable read-only tools only, to keep the agent from modifying your files. Common values:
//   "read" | "bash" | "edit" | "write" | "grep" | "find" | "ls"
const { session } = await createAgentSession({
  modelRuntime,
  sessionManager: SessionManager.inMemory(),  // In-memory session, no disk writes
  tools: ["read", "grep", "find", "ls"],
});

// ④ Subscribe to the event stream
// The SDK emits all of: LLM incremental output, tool calls, lifecycle — as events.
// Here we only care about three: streaming text, tool call start, turn end.
const unsubscribe = session.subscribe((event) => {
  switch (event.type) {
    case "message_update": {
      const e = event.assistantMessageEvent;
      // assistantMessageEvent.type also includes "thinking_delta" (thinking process), etc.
      if (e.type === "text_delta") process.stdout.write(e.delta);
      break;
    }
    case "tool_execution_start":
      console.error(`\n[tool] ${event.toolName}`);
      break;
    case "agent_end":
      console.error();
      break;
  }
});

// ⑤ REPL main loop
// readline grabs one line of user input per iteration; session.prompt() sends it to the agent.
// prompt() awaits the entire turn (LLM reply + tool calls + retries).
const rl = readline.createInterface({ input: stdin, output: stdout });
console.error("\nType to chat. 'exit' to quit.");

try {
  while (true) {
    const text = (await rl.question("you> ")).trim();
    if (!text) continue;
    if (/^(exit|quit)$/i.test(text)) break;

    process.stdout.write("assistant> ");
    await session.prompt(text); // ★ Core SDK call
    process.stdout.write("\n");
  }
} catch (err) {
  console.error(`\n[error] ${(err as Error).message}`);
} finally {
  // dispose() releases event subscriptions and resources held by the session; must call before exit.
  unsubscribe();
  session.dispose();
  rl.close();
}