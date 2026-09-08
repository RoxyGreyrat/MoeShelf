// MoeShelf desktop (Electron) - main process
// Runs the existing Next.js standalone server with Electron's embedded Node
// (ELECTRON_RUN_AS_NODE), then shows the same UI in its own window.
// No system browser, no Node.js installation, no admin needed.
'use strict'

const { app, BrowserWindow, dialog, shell } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
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

function waitHttp(url, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { req.destroy(); resolve(false) }, timeoutMs)
    const req = http.get(url, (res) => { clearTimeout(timer); res.resume(); resolve(true) })
    req.on('error', () => { clearTimeout(timer); resolve(false) })
  })
}

function webRoot() {
  if (process.env.MOESHELF_WEB_ROOT) return process.env.MOESHELF_WEB_ROOT
  if (app.isPackaged) return path.join(process.resourcesPath, 'webapp')
  return path.join(__dirname, 'webapp') // local manual test: put release here
}

function userDataRoot() {
  // Portable exe: keep data next to the exe (truly portable).
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR
  if (portableDir) return path.join(portableDir, 'data')
  // Regular desktop install / dev: standard per-user app data.
  return app.getPath('userData')
}

async function startServer() {
  const root = webRoot()
  const serverJs = path.join(root, 'server.js')
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
    stdio: 'inherit',
  })
  serverChild.on('exit', () => { serverChild = null })

  const url = 'http://127.0.0.1:' + port
  if (await waitHttp(url, 30000)) return url
  throw new Error('server did not respond in time')
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

  // Keep the app self-contained: open external http(s) links in the default
  // browser, never inside the app window.
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
    dialog.showErrorBox('MoeShelf', 'Failed to start: ' + (err && err.message ? err.message : err))
    killServer()
    app.quit()
  }
})

app.on('before-quit', () => killServer())
app.on('window-all-closed', () => {
  killServer()
  app.quit()
})
