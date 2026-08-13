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
async function waitServer(port, timeoutMs) { const dl = Date.now() + (timeoutMs || 20000); while (Date.now() < dl) { if (await canConnect(port)) return true; await new Promise((r) => setTimeout(r, 300)); } return false; }
(async () => {
  const preferred = parseInt(process.env.PORT || "3000", 10);
  let port = preferred;
  if (!(await isPortFree(port))) {
    for (let p = preferred + 1; p < preferred + 20; p++) { if (await isPortFree(p)) { port = p; break; } }
  }
  const url = "http://localhost:" + port;
  log("=== launcher start === node=" + process.version + " port=" + port);
  log("server.js exists: " + fs.existsSync(path.join(__dirname, "server.js")));
  const child = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(port) }, stdio: "inherit" });
  child.on("error", (e) => { log("spawn error: " + (e && e.message)); console.error("[launcher] 启动失败:", e && e.message); });
  const ok = await waitServer(port);
  if (ok) { log("server ready. url=" + url); console.log("Port " + (port === preferred ? port + " is free. Starting..." : preferred + " is busy, using " + port + " instead.")); console.log("URL: " + url); const lan = lanIps(); if (lan.length) console.log("Phone access (same WiFi): http://" + lan[0] + ":" + port); console.log("Press Ctrl+C to stop the server"); console.log(""); log("opening browser: " + url); openBrowser(url); }
  else { log("[ERROR] server did not respond in time"); console.error("[ERROR] 服务启动超时"); console.error("可能原因：端口 3000-3019 全部被占用、node_modules 缺失/不完整、或杀毒软件拦截了 node"); console.error("请查看 launcher.log 和 start-bat.log 确认具体错误"); }
  child.on("exit", (code) => process.exit(code || 0));
})();
