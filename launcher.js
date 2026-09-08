const { spawn, exec } = require("child_process");
const os = require("os");
const path = require("path");
const fs = require("fs");
process.chdir(__dirname);
const LOG = path.join(__dirname, "launcher.log");
function log(msg) {
  try {
    // 日志轮转：超过 2MB 时把旧日志改名保留
    try { if (fs.existsSync(LOG) && fs.statSync(LOG).size > 2 * 1024 * 1024) fs.renameSync(LOG, LOG + ".old"); } catch {}
    fs.appendFileSync(LOG, "[" + new Date().toISOString() + "] " + msg + "\r\n");
  } catch {}
}
function lanIps() { const out = []; const ifs = os.networkInterfaces(); for (const k in ifs) for (const it of ifs[k] || []) if (it.family === "IPv4" && !it.internal) out.push(it.address); return out; }
function openBrowser(url) { try { exec('start "" "' + url + '"', { shell: "cmd.exe" }); } catch { log("openBrowser fail"); } }
function isPortFree(port) { return new Promise((r) => { const s = require("net").createServer(); s.once("error", () => r(false)); s.once("listening", () => s.close(() => r(true))); s.listen(port, "0.0.0.0"); }); }
function canConnect(port) { return new Promise((r) => { const s = require("net").connect({ host: "127.0.0.1", port }); s.once("connect", () => { s.destroy(); r(true); }); s.once("error", () => r(false)); s.setTimeout(1500, () => { s.destroy(); r(false); }); }); }
function serverEntry() {
  // 1) 打包发布目录：根目录 server.js
  const packaged = path.join(__dirname, "server.js");
  if (fs.existsSync(packaged)) return { script: packaged, args: [], label: "server.js" };
  // 2) 源码目录：构建过之后用 next start
  const nextBin = path.join(__dirname, "node_modules", "next", "dist", "bin", "next");
  if (fs.existsSync(nextBin) && fs.existsSync(path.join(__dirname, ".next", "BUILD_ID"))) {
    return { script: nextBin, args: ["start"], label: "next start" };
  }
  return null;
}
async function waitServer(port, timeoutMs) { const dl = Date.now() + (timeoutMs || 20000); while (Date.now() < dl) { if (await canConnect(port)) return true; await new Promise((r) => setTimeout(r, 300)); } return false; }
(async () => {
  const preferred = parseInt(process.env.PORT || "3000", 10);
  let port = preferred;
  if (!(await isPortFree(port))) {
    for (let p = preferred + 1; p < preferred + 20; p++) { if (await isPortFree(p)) { port = p; break; } }
  }
  const entry = serverEntry();
  const url = "http://localhost:" + port;
  log("=== launcher start === node=" + process.version + " port=" + port);
  if (!entry) {
    log("[ERROR] no server entry: run `npm run build` first in source folder");
    console.error("[ERROR] 未找到 server.js，也检测不到已构建的 .next。");
    console.error("源码目录请先运行：npm run build");
    console.error("发布目录请确认 server.js 与 node_modules 完整。");
    process.exit(1);
  }
  log("server entry: " + entry.label);
  const child = spawn(process.execPath, [entry.script, ...entry.args], { env: { ...process.env, PORT: String(port) }, stdio: "inherit" });
  child.on("error", (e) => { log("spawn error: " + (e && e.message)); console.error("[launcher] 启动失败:", e && e.message); });
  const ok = await waitServer(port);
  if (ok) { log("server ready. url=" + url); console.log("Port " + (port === preferred ? port + " is free. Starting..." : preferred + " is busy, using " + port + " instead.")); console.log("URL: " + url); const lan = lanIps(); if (lan.length) console.log("Phone access (same WiFi): http://" + lan[0] + ":" + port); console.log("Press Ctrl+C to stop the server"); console.log(""); log("opening browser: " + url); openBrowser(url); }
  else { log("[ERROR] server did not respond in time"); console.error("[ERROR] 服务启动超时"); console.error("可能原因：端口 3000-3019 全部被占用、node_modules 缺失/不完整、或杀毒软件拦截了 node"); console.error("请查看 launcher.log 和 start-bat.log 确认具体错误"); }
  child.on("exit", (code) => process.exit(code || 0));
})();
