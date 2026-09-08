// MoeShelf desktop (Electron) - main process
// Runs the existing Next.js standalone server with Electron's embedded Node
// (ELECTRON_RUN_AS_NODE), then shows the same UI in its own window.
// No system browser, no Node.js installation, no admin needed.
'use strict'

const { app, BrowserWindow, dialog, shell } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const net = require('net')
const http = require('http')

let serverChild = null
let port = 0

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })
}

// ---------- diagnostics ----------
function logFile() {
  try {
    const dir = process.env.PORTABLE_EXECUTABLE_DIR || app.getPath('userData')
    fs.mkdirSync(dir, { recursive: true })
    return path.join(dir, 'desktop-server.log')
  } catch { return null }
}
let serverLog = null
let outputTail = ''

function appendLog(text) {
  const s = String(text || '')
  outputTail = (outputTail + s).slice(-12000)
  if (!serverLog) serverLog = logFile()
  if (serverLog) {
    try {
      fs.appendFileSync(serverLog, '[' + new Date().toISOString() + '] ' + s.replace(/\n$/, '') + '\n')
    } catch { /* ignore */ }
  }
}
// ---------- helpers ----------

function isFreePort(p) {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.once('error', () => resolve(false))
    srv.once('listening', () => srv.close(() => resolve(true)))
    srv.listen(p, '0.0.0.0')
  })
}

async function pickPort(start) {
  for (let p = start; p < start + 20; p++) {
    if (await isFreePort(p)) return p
  }
  return 0
}

function connectOk(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port })
    const done = (ok) => { try { s.destroy() } catch { } resolve(ok) }
    s.once('connect', () => done(true))
    s.once('error', () => done(false))
    s.setTimeout(600, () => done(false))
  })
}

function webRoot() {
  if (process.env.MOESHELF_WEB_ROOT) return process.env.MOESHELF_WEB_ROOT
  if (app.isPackaged) return path.join(process.resourcesPath, 'webapp')
  return path.join(__dirname, 'webapp') // local manual test: put release here
}

function userDataRoot() {
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR
  if (portableDir) return path.join(portableDir, 'data')
  return app.getPath('userData')
}

function failMessage(base) {
  const tail = outputTail.trim()
  if (!tail) return base
  return base + '\n\n---- server output (last part) ----\n' + tail.slice(-2000)
}

async function startServer() {
  const root = webRoot()
  const serverJs = path.join(root, 'server.js')
  appendLog('--- MoeShelf desktop start ---')
  appendLog('webRoot=' + root)

  const checks = [
    ['server.js', serverJs],
    ['node_modules/next', path.join(root, 'node_modules', 'next')],
    ['.next/BUILD_ID', path.join(root, '.next', 'BUILD_ID')],
  ]
  for (const [label, p] of checks) {
    if (!fs.existsSync(p)) throw new Error('webapp 不完整：缺少 ' + label + ' （' + p + '）')
  }

  port = await pickPort(3000)
  if (!port) throw new Error('ports 3000-3019 are all busy')

  serverChild = spawn(process.execPath, [serverJs], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      ELECTRON_RUN_AS_NODE: '1',
      MOESHELF_DATA_DIR: userDataRoot(),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  serverChild.stdout.on('data', (d) => appendLog(d.toString()))
  serverChild.stderr.on('data', (d) => appendLog(d.toString()))
  serverChild.on('error', (err) => appendLog('SPAWN ERROR: ' + err.message))
  serverChild.on('exit', (code, sig) => appendLog('server child exit: code=' + code + ' signal=' + sig))
  serverChild.on('exit', () => { serverChild = null })

  const deadline = Date.now() + 45000
  while (Date.now() < deadline) {
    if (serverChild === null) {
      throw new Error('服务进程提前退出，未能启动。' + (serverLog ? '\n详细日志：' + serverLog : ''))
    }
    if (await connectOk(port)) return 'http://127.0.0.1:' + port
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error('server did not respond in time' + (serverLog ? '\n详细日志：' + serverLog : ''))
}

function killServer() {
  try {
    if (serverChild && !serverChild.killed) serverChild.kill()
  } catch { /* ignore */ }
  serverChild = null
}

function appIcon() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'icon.ico')
  return path.join(__dirname, 'icon.ico')
}

function createWindow(url) {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 620,
    backgroundColor: '#0a0b10',
    title: 'MoeShelf',
    icon: appIcon(),
    autoHideMenuBar: true,
    show: false,
  })
  win.once('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, target) => {
    if (!target.startsWith(url)) event.preventDefault()
  })

  win.loadURL(url)
  win.on('closed', () => {
    killServer()
    app.quit()
  })
}

app.whenReady().then(async () => {
  try {
    const url = await startServer()
    createWindow(url)
  } catch (err) {
    const msg = err && err.message ? err.message : String(err)
    dialog.showErrorBox('MoeShelf', failMessage(msg))
    killServer()
    app.quit()
  }
})

app.on('before-quit', () => killServer())
app.on('window-all-closed', () => {
  killServer()
  app.quit()
})
