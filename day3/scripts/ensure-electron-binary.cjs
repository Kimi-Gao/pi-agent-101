#!/usr/bin/env node
// Eagerly download the Electron binary during `npm install`, redirected
// to npmmirror. The `electron` package is lazy: its `index.js` only
// downloads the binary on the first `require('electron')`. Worse, that
// lazy download spawns `install.js` as a plain Node child process —
// `npm_config_electron_mirror` set by npm's .npmrc handling does NOT
// reach it, so on flaky networks the GitHub releases CDN hangs forever.
//
// This script runs at the project's own `postinstall` step (after npm
// has installed `node_modules/electron`), so we can set `ELECTRON_MIRROR`
// explicitly in the spawned child's env. We only download if dist/ is
// missing, so re-runs are idempotent.

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const MIRROR = "https://npmmirror.com/mirrors/electron/";
const electronDir = path.join(__dirname, "..", "node_modules", "electron");
const distDir = path.join(electronDir, "dist");

if (!fs.existsSync(electronDir)) {
  // Should not happen — postinstall runs after the dep tree is in place.
  process.exit(0);
}
if (fs.existsSync(distDir)) {
  console.log("[ensure-electron-binary] dist/ already present, skipping.");
  process.exit(0);
}

console.log("[ensure-electron-binary] dist/ missing, downloading from npmmirror...");
const result = spawnSync(process.execPath, [path.join(electronDir, "install.js")], {
  stdio: "inherit",
  env: { ...process.env, ELECTRON_MIRROR: MIRROR },
});
if (result.status !== 0) {
  console.error("[ensure-electron-binary] download failed; check network or mirror URL.");
  process.exit(result.status ?? 1);
}