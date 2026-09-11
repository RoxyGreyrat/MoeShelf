/**
 * MoeShelf 手机串流 · 采集端（Electron）
 *
 * 为什么必须用 Electron（浏览器实测都不行）：
 *   1. desktopCapturer 可直接枚举窗口并锁定 sourceId → 不需要用户在选择框里挑（浏览器做不到）
 *   2. setDisplayMediaRequestHandler(..., { audio: 'loopback' }) → 一次拿到「窗口画面 + Windows 系统回环声」
 *      （浏览器对窗口源结构上没有音轨）
 *
 * 生命周期：由 MoeShelf 拉起。父进程关闭 stdin 或直接结束本进程即退出。
 *
 * 参数：
 *   --server=http://localhost:3000   串流服务地址（MoeShelf）
 *   --title=<窗口标题子串>             要采集的游戏窗口
 *   --game=<游戏名>                   仅用于日志/上报
 *   --wait=<秒>                       等窗口出现的秒数（游戏启动需要时间），默认 20
 *   --print-only                      只列出可见采集源后退出（排障用）
 */
const { app, BrowserWindow, desktopCapturer, ipcMain } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const argv = process.argv.slice(2)
const arg = (k, d = '') => { const hit = argv.find(a => a.startsWith('--' + k + '=')); return hit ? hit.slice(k.length + 3) : d }
const SERVER = arg('server', 'http://localhost:3000')
const TITLE = arg('title')
const GAME = arg('game')
const WAIT_S = Number(arg('wait', '20'))
const PRINT_ONLY = argv.includes('--print-only')

const log = (...a) => console.log('[cap]', ...a)
const sleep = ms => new Promise(r => setTimeout(r, ms))

function pickWindow (sources, sub) {
  const wins = sources.filter(s => s.id.startsWith('window:'))
  if (!wins.length) return null
  if (!sub) return null
  return wins.find(s => s.name === sub) ||
    wins.find(s => s.name.includes(sub)) ||
    wins.find(s => s.name.toLowerCase().includes(sub.toLowerCase())) ||
    null
}

/** 游戏启动需要时间，窗口可能还没出现——按 --wait 轮询等待 */
async function findWindow (sub) {
  const deadline = Date.now() + WAIT_S * 1000
  let lastNames = []
  for (;;) {
    const sources = await desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: { width: 0, height: 0 } })
    lastNames = sources.map(s => s.id.split(':')[0] + ' ' + s.name)
    const win = pickWindow(sources, sub)
    if (win) {
      const scr = sources.find(s => s.id.startsWith('screen:'))
      return { win, scr, sources }
    }
    if (Date.now() > deadline) {
      log('等待窗口超时（title=' + sub + '）。当前可见窗口：')
      for (const n of lastNames.slice(0, 30)) log('   ' + n)
      return { win: null, scr: null, sources }
    }
    await sleep(1000)
  }
}

app.whenReady().then(async () => {
  log('启动 · Electron', process.versions.electron, '· Chrome', process.versions.chrome)
  log('服务=' + SERVER + ' 目标窗口=' + TITLE + ' 游戏=' + GAME + ' 等待=' + WAIT_S + 's')

  const { win, scr, sources } = await findWindow(TITLE)
  if (PRINT_ONLY || !win) {
    log('可见采集源共 ' + sources.length + ' 个：')
    for (const s of sources.slice(0, 40)) log('   [' + s.id.split(':')[0] + '] ' + s.name)
    if (!win) { log('没找到目标窗口，退出'); app.exit(3); return }
  }
  if (PRINT_ONLY) { app.exit(0); return }
  log('锁定窗口: ' + win.name + '  (' + win.id + ')')
  if (scr) log('系统声源: ' + scr.id)

  const hidden = new BrowserWindow({
    width: 640, height: 360,
    show: false,
    skipTaskbar: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false },
  })

  // 渲染进程日志转到主进程 stdout，便于 MoeShelf 收集
  hidden.webContents.on('console-message', (_e, _lvl, message) => { if (String(message).startsWith('cap-step')) log('[renderer] ' + message) })
  hidden.webContents.on('render-process-gone', (_e, d) => log('渲染进程退出: ' + JSON.stringify(d)))

  // 读取用户在 /stream/settings 里的手动画质设置，随 cap:info 交给渲染进程应用
  let opts = null
  try { opts = await (await fetch(SERVER + '/api/stream/config')).json() } catch (e) { log('读取串流设置失败，用默认值: ' + e.message) }
  if (opts && opts.config) { opts = opts.config; log('已载入串流设置: ' + JSON.stringify(opts)) } else { opts = null; log('未取到串流设置，用内置默认值') }

  ipcMain.handle('cap:info', () => ({ server: SERVER, windowSourceId: win.id, windowName: win.name, screenSourceId: scr ? scr.id : '', game: GAME, opts }))
  ipcMain.on('cap:report', (_e, payload) => log('[renderer] ' + JSON.stringify(payload)))
  // 渲染进程发现 MoeShelf 已经不可达（连续心跳失败）→ 自行退出
  ipcMain.on('cap:quit', (_e, why) => { log('退出：' + why); app.quit() })

  // 关键：必须在 loadFile 之前注册；audio:'loopback' = Windows 系统回环声（零点击授权的实现点）
  hidden.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    log('授权采集：video=' + win.name + ' audio=loopback')
    callback({ video: win, audio: 'loopback' })
  }, { useSystemPicker: false })

  const pageUrl = pathToFileURL(path.join(__dirname, 'capture.html')).toString()
  log('加载采集页: ' + pageUrl)
  await hidden.loadURL(pageUrl)
  log('采集页已加载，等待 MoeShelf 的串流请求')
})

// 生命周期：由渲染进程的心跳判断 MoeShelf 是否还活着（见 capture.html），
// 或由 MoeShelf 直接结束本进程。注意：不能用「stdin 关闭」当信号——子进程启动时 stdin 本就是关闭的。

app.on('window-all-closed', () => { /* 由 MoeShelf 控制生命周期，不因窗口关闭退出 */ })
