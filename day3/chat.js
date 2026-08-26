/**
 * day3: renderer chat logic
 *
 * Talks to the main process through window.pi.* (exposed by preload.ts):
 *   - pi.prompt(text)        → main process calls session.prompt()
 *   - pi.onTextDelta(cb)     → main process pushes text_delta events
 *   - pi.onToolStart(cb)     → main process pushes tool_execution_start
 *   - pi.onAgentEnd(cb)      → main process pushes agent_end
 *
 * No EventSource, no fetch — just a few methods on window.pi.
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

// Subscribe to events pushed from the main process
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

// Renderer initiates prompt (ipcRenderer.invoke → ipcMain.handle)
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