import { NextResponse } from 'next/server'
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { stream } from '@/lib/stream/session'
import { findWindow, listWindows, restoreTopmost, ensureDpiAware } from '@/lib/stream/input-win32'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * 手机串流的采集端进程管理
 *   POST   { game?, windowTitle?, pid?, process? }  → 找到游戏窗口并拉起 Electron 采集端
 *   DELETE                                          → 关闭采集端并还原窗口置顶
 *
 * 生命周期：本进程握着采集端的 stdin；关闭 stdin 即让采集端自行退出（见 stream-capture/main.js）。
 */

type Holder = { child: ChildProcess | null; startedAt: number; windowTitle: string | null }
const g = globalThis as unknown as { __moeshelfCapture?: Holder }
const holder: Holder = g.__moeshelfCapture ?? (g.__moeshelfCapture = { child: null, startedAt: 0, windowTitle: null })

function electronPath (): string | null {
  const dir = path.join(process.cwd(), 'stream-capture')
  const cands = [
    path.join(dir, 'node_modules', 'electron', 'dist', 'electron.exe'),
    path.join(dir, 'node_modules', 'electron', 'dist', 'electron'),
  ]
  for (const c of cands) if (fs.existsSync(c)) return c
  return null
}

export async function POST (req: Request) {
  ensureDpiAware()
  let body: any = {}
  try { body = await req.json() } catch {}

  const dir = path.join(process.cwd(), 'stream-capture')
  const exe = electronPath()
  if (!exe) {
    return NextResponse.json({
      ok: false,
      error: '采集端未安装：请在 stream-capture 目录执行 npm install（会下载 Electron）',
      hint: dir,
    }, { status: 400 })
  }
  if (!fs.existsSync(path.join(dir, 'main.js'))) {
    return NextResponse.json({ ok: false, error: '采集端文件缺失：' + dir }, { status: 500 })
  }

  // 已有一个在跑：先换掉（同一次串流只允许一个采集端）
  if (holder.child && !holder.child.killed) {
    try { holder.child.stdin?.end(); holder.child.kill() } catch {}
    holder.child = null
  }

  // 找游戏窗口：优先「同目录」（引擎自我重启也能命中）→ pid → 进程名 → 标题。
  // 游戏启动慢（BGI 这类引擎常有配置对话框/开场，窗口十几秒才出来），所以最多等 60 秒。
  const wantPid = Number(body.pid) || 0
  const wantProc = body.process ? String(body.process) : ''
  const wantTitle = body.windowTitle ? String(body.windowTitle) : ''
  const wantDir = body.exePath ? path.dirname(String(body.exePath)) : (body.exeDir ? String(body.exeDir) : '')
  let win = null as ReturnType<typeof findWindow>
  const deadline = Date.now() + 60000
  for (;;) {
    if (wantDir) win = findWindow({ exeDir: wantDir })
    if (!win && wantPid) win = findWindow({ pid: wantPid })
    if (!win && wantProc) win = findWindow({ process: wantProc })
    if (!win && wantTitle) win = findWindow({ title: wantTitle })
    if (win || Date.now() > deadline) break
    await new Promise(r => setTimeout(r, 1500))
    listWindows(true) // 强制刷新窗口列表
  }
  if (!win) {
    return NextResponse.json({
      ok: false,
      error: '等了一分钟还没看到游戏窗口。请确认游戏已经在电脑上启动（有些游戏会先弹配置/开场窗口）；若窗口已出现仍报错，请把窗口标题告诉我。',
      want: { dir: wantDir || undefined, pid: wantPid || undefined, process: wantProc || undefined, title: wantTitle || undefined },
      visible: listWindows(true).slice(0, 12).map(w => w.process + ' · ' + w.title),
    }, { status: 404 })
  }

  // 服务地址：从请求头里取本机端口（采集端与 MoeShelf 同机）
  const host = req.headers.get('host') || '127.0.0.1:3000'
  const port = host.includes(':') ? host.split(':').pop() : '80'
  const server = `http://127.0.0.1:${port}`

  const args = [dir, `--server=${server}`, `--title=${win.title}`, `--wait=25`]
  if (body.game) args.push(`--game=${String(body.game)}`)

  const child = spawn(exe, args, { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'], detached: false, windowsHide: false })
  holder.child = child
  holder.startedAt = Date.now()
  holder.windowTitle = win.title

  const lines: string[] = []
  const onLine = (buf: Buffer) => {
    for (const line of String(buf).split(/\r?\n/)) {
      if (!line.trim()) continue
      lines.push(line)
      if (lines.length > 200) lines.shift()
      console.log('[capture] ' + line)
    }
  }
  child.stdout?.on('data', onLine)
  child.stderr?.on('data', onLine)
  child.on('exit', code => { console.log('[capture] 采集端退出 code=' + code); if (holder.child === child) holder.child = null; restoreTopmost() })

  return NextResponse.json({ ok: true, pid: child.pid, window: { title: win.title, process: win.process, pid: win.pid, rect: { left: win.left, top: win.top, width: win.width, height: win.height } }, server })
}

export async function DELETE () {
  if (holder.child && !holder.child.killed) {
    try { holder.child.stdin?.end(); holder.child.kill() } catch {}
  }
  holder.child = null
  restoreTopmost()
  stream.bye('host')
  return NextResponse.json({ ok: true })
}

export async function GET () {
  return NextResponse.json({
    running: !!holder.child && !holder.child.killed,
    pid: holder.child?.pid ?? null,
    startedAt: holder.startedAt,
    windowTitle: holder.windowTitle,
  })
}
