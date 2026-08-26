/**
 * day3：渲染进程 chat 逻辑
 *
 * 通过 window.pi.*（preload.ts 暴露）跟主进程对话：
 *   - pi.prompt(text)         → 主进程调 session.prompt()
 *   - pi.onTextDelta(cb)      → 主进程推送 text_delta 事件
 *   - pi.onToolStart(cb)      → 主进程推送 tool_execution_start
 *   - pi.onAgentEnd(cb)       → 主进程推送 agent_end
 *
 * 没有 EventSource、没有 fetch——只是 window.pi 上的几个方法。
 */

const log = document.getElementById("log");
const t = document.getElementById("t");
const f = document.getElementById("f");
const btn = f.querySelector("button");

function append(role, text) {
  const div = document.createElement("div");
  div.dataset.role = role;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}
function appendDelta(delta) {
  const last = log.lastElementChild;
  if (last && last.dataset.role === "assistant") {
    last.textContent += delta;
  } else {
    append("assistant", delta);
  }
  log.scrollTop = log.scrollHeight;
}

// 订阅主进程推送的事件
window.pi.onTextDelta(appendDelta);
window.pi.onToolStart((toolName) => {
  append("tool", "[tool] " + toolName);
});
window.pi.onAgentEnd(() => {
  append("assistant", "");
  t.disabled = false;
  btn.disabled = false;
  t.focus();
});

// 渲染进程发起 prompt（走 ipcRenderer.invoke → ipcMain.handle）
f.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = t.value.trim();
  if (!text) return;
  t.value = "";
  t.disabled = true;
  btn.disabled = true;
  append("user", "you> " + text);
  try {
    await window.pi.prompt(text);
  } catch (err) {
    append("error", "[error] " + err);
    t.disabled = false;
    btn.disabled = false;
  }
});

t.disabled = false;
btn.disabled = false;
t.focus();