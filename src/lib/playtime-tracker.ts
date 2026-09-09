// 游玩时长跟踪器。
//
// 为什么不能只盯 spawn 出来的 PID：大量 galgame 的启动器（或汉化/破解包装 exe）会在
// 拉起真正的游戏进程后立刻自己退出。如果只监听那个 PID 的 exit，会话几秒就结束，
// 时长几乎记不到。这里改为跟踪「整棵进程树」：
//   1) 每 20 秒枚举系统进程（pid/ppid/name），沿 ppid 找出根进程仍存活的后代；
//      父进程已退出、子进程还活着的情况也能识别（子进程的 ppid 仍指向已消失的父 PID）。
//   2) 树还活着 → 每累计 ≥0.5 分钟写一次库（不计次数）；树全没了 → 结算剩余时长并 sessions +1。
//   3) 运行中的会话写入 data/running.json；本模块在页面加载（/api/library）时就会被 import，
//      因此服务重启后能自动恢复计时（游戏已退出的按「最后可见时间」结算，不会把停机时间算进去）。
import { execFile } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { accumulatePlaytime, dataDir, finalizePlaytime, resolveDataDir } from './core'

export interface RunningEntry {
  hash: string
  exeName: string
  start: number
  /** 已经写库的分钟数（避免重复累计） */
  saved: number
  /** 最后一次确认该进程树还活着的时间（重启后据此结算） */
  lastSeen: number
}

interface ProcInfo {
  ppid: number
  name: string
}

const running = new Map<number, RunningEntry>()
const POLL_MS = 20000
const SAVE_MINUTES = 0.5

let poller: NodeJS.Timeout | null = null
let polling = false
let restoreStarted = false

// ---------------------------------------------------------------- 进程枚举
async function listProcesses(): Promise<Map<number, ProcInfo> | null> {
  const map = new Map<number, ProcInfo>()
  const add = (pid: number, ppid: number, name: string) => {
    if (!Number.isFinite(pid) || !Number.isFinite(ppid) || pid <= 0) return
    map.set(pid, { ppid, name })
  }

  const run = (file: string, args: string[]) =>
    new Promise<string | null>((resolve) => {
      execFile(file, args, { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
        resolve(err ? null : String(stdout))
      })
    })

  if (process.platform === 'win32') {
    // wmic 快；新系统已移除时退回 PowerShell CIM
    const csv = await run('wmic', ['process', 'get', 'ProcessId,ParentProcessId,Name', '/format:csv'])
    if (csv) {
      for (const line of csv.split(/\r?\n/)) {
        const parts = line.trim().split(',')
        if (parts.length < 4) continue
        add(Number(parts[3]), Number(parts[2]), (parts[1] ?? '').trim())
      }
      if (map.size) return map
    }
    const ps = await run('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId),$($_.ParentProcessId),$($_.Name)" }',
    ])
    if (ps) {
      for (const line of ps.split(/\r?\n/)) {
        const m = line.trim().match(/^(\d+),(\d+),(.*)$/)
        if (m) add(Number(m[1]), Number(m[2]), m[3].trim())
      }
      if (map.size) return map
    }
    return null
  }

  try {
    for (const e of await fs.readdir('/proc')) {
      if (!/^\d+$/.test(e)) continue
      try {
        const stat = await fs.readFile(`/proc/${e}/stat`, 'utf8')
        const close = stat.lastIndexOf(')')
        const tail = stat.slice(close + 2).split(' ')
        add(Number(e), Number(tail[1]), stat.slice(stat.indexOf('(') + 1, close))
      } catch {}
    }
    return map.size ? map : null
  } catch {
    return null
  }
}

/** 沿 ppid 关系收集根进程及其后代（父进程已消失的子进程同样计入） */
function aliveTree(rootPid: number, procs: Map<number, ProcInfo>, children: Map<number, number[]>): number[] {
  const alive: number[] = []
  const seen = new Set<number>()
  const stack = [rootPid]
  while (stack.length) {
    const pid = stack.pop() as number
    if (seen.has(pid)) continue
    seen.add(pid)
    if (procs.has(pid)) alive.push(pid)
    const kids = children.get(pid)
    if (kids) for (const k of kids) if (!seen.has(k)) stack.push(k)
  }
  return alive
}

// ---------------------------------------------------------------- 持久化
function runningFile(): string {
  return path.join(dataDir(), 'running.json')
}

async function saveRunning(): Promise<void> {
  try {
    const out: Record<string, RunningEntry> = {}
    for (const [pid, e] of running) out[String(pid)] = e
    if (!Object.keys(out).length) {
      await fs.rm(runningFile(), { force: true })
      return
    }
    await fs.mkdir(dataDir(), { recursive: true })
    await fs.writeFile(runningFile(), JSON.stringify(out, null, 2), 'utf8')
  } catch {}
}

async function restoreRunning(): Promise<void> {
  if (restoreStarted) return
  restoreStarted = true
  try {
    await resolveDataDir()
    const raw = await fs.readFile(runningFile(), 'utf8')
    const obj = JSON.parse(raw) as Record<string, RunningEntry>
    for (const [pid, e] of Object.entries(obj)) {
      if (!e?.hash || !Number.isFinite(e.start)) continue
      running.set(Number(pid), {
        hash: e.hash,
        exeName: e.exeName ?? '',
        start: e.start,
        saved: Number(e.saved) || 0,
        lastSeen: Number(e.lastSeen) || e.start,
      })
    }
    if (running.size) {
      ensurePoller()
      void poll()
    }
  } catch {}
}

// ---------------------------------------------------------------- 轮询
async function poll(): Promise<void> {
  if (!running.size || polling) return
  polling = true
  try {
    const procs = await listProcesses()
    if (!procs) return
    const children = new Map<number, number[]>()
    for (const [pid, info] of procs) {
      const arr = children.get(info.ppid)
      if (arr) arr.push(pid)
      else children.set(info.ppid, [pid])
    }
    const now = Date.now()
    for (const [rootPid, entry] of [...running]) {
      const alive = aliveTree(rootPid, procs, children)
      // 根 PID 可能被系统复用：名字对不上就当作已退出
      const root = procs.get(rootPid)
      const rootMatches = !root || !entry.exeName || root.name.toLowerCase() === entry.exeName.toLowerCase()
      const stillRunning = rootMatches && alive.length > 0

      if (stillRunning) {
        entry.lastSeen = now
        const total = (now - entry.start) / 60000
        if (total - entry.saved >= SAVE_MINUTES) {
          const delta = total - entry.saved
          entry.saved = total
          void accumulatePlaytime(entry.hash, delta, now, true)
        }
        continue
      }

      running.delete(rootPid)
      const total = (entry.lastSeen - entry.start) / 60000
      const delta = total - entry.saved
      // 即使 delta 已被定时累计写过（为 0），也要把这次会话记上一次
      void finalizePlaytime(entry.hash, delta > 0 ? delta : 0, entry.lastSeen)
    }
    await saveRunning()
    if (!running.size) stopPoller()
  } catch (e) {
    console.error('[playtime] 轮询失败:', e instanceof Error ? e.message : String(e))
  } finally {
    polling = false
  }
}

function ensurePoller(): void {
  if (poller) return
  poller = setInterval(() => void poll(), POLL_MS)
  if (typeof poller.unref === 'function') poller.unref()
}

function stopPoller(): void {
  if (!poller) return
  clearInterval(poller)
  poller = null
}

// ---------------------------------------------------------------- 对外
/** 记录一次启动：跟踪该进程树并开始计时 */
export async function trackLaunch(pid: number, hash: string, exeName: string): Promise<void> {
  if (!pid || !hash) return
  await resolveDataDir()
  const now = Date.now()
  running.set(pid, { hash, exeName, start: now, saved: 0, lastSeen: now })
  ensurePoller()
  await saveRunning()
}

/** 进程退出后延迟检查一次（启动器可能立刻退出，但真正的游戏进程还活着） */
export function scheduleCheck(delayMs = 8000): void {
  setTimeout(() => void poll(), delayMs)
}

/** 丢弃某次启动（例如 spawn 失败） */
export function forgetLaunch(pid: number): void {
  if (pid) running.delete(pid)
}

// 模块被加载时（页面首次请求 /api/library 等）立即恢复未结算的会话
void restoreRunning()
