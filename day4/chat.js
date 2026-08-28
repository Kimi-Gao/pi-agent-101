/**
 * day4: renderer chat logic
 *
 * Sidebar shows the session list; click a row to switch; "New session" creates
 * one. The chat area talks to the current session. The main process owns the
 * AgentSessionRuntime; the renderer only renders + sends requests / receives
 * pushes through window.pi.*.
 */

const log = document.getElementById("log");
const t = document.getElementById("t");
const f = document.getElementById("f");
const btn = f.querySelector("button");
const list = document.getElementById("list");
const header = document.getElementById("header");

let currentId = null;
let sessions = [];

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
function clearLog() {
  log.innerHTML = "";
}

function renderList() {
  list.innerHTML = "";
  for (const s of sessions) {
    const li = document.createElement("li");
    if (s.id === currentId) li.classList.add("active");
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = s.name;
    li.appendChild(label);
    li.addEventListener("click", async () => {
      if (s.id === currentId) return;
      await window.pi.switchSession(s.id);
    });
    list.appendChild(li);
  }
}

function updateHeader() {
  const cur = sessions.find((s) => s.id === currentId);
  header.textContent = cur ? cur.name : "No session selected";
}

// subscribe to main-process pushes
window.pi.onTextDelta(appendDelta);
window.pi.onToolStart((toolName) => append("tool", "[tool] " + toolName));
window.pi.onAgentEnd(() => {
  append("assistant", "");
  t.disabled = false;
  btn.disabled = false;
  t.focus();
});
window.pi.onSessionsChanged((s) => {
  sessions = s;
  renderList();
  updateHeader();
});
window.pi.onCurrentSession((p) => {
  currentId = p.id;
  clearLog();
  updateHeader();
  renderList();
});

// new session
document.getElementById("new").addEventListener("click", async () => {
  await window.pi.newSession();
});

// initial load
window.pi.listSessions().then((s) => {
  sessions = s;
  currentId = s[0]?.id || null;
  renderList();
  updateHeader();
  t.disabled = !currentId;
  btn.disabled = !currentId;
  if (currentId) t.focus();
});

// submit
f.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = t.value.trim();
  if (!text || !currentId) return;
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