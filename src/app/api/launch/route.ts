// /api/launch —— 启动游戏并统计游玩时长（S1 依据编译产物模块 4925 + 667 + 2849 重建）。
import { spawn } from 'child_process'
import path from 'path'
import { NextResponse } from 'next/server'
import { accumulatePlaytime, isPathAllowed, PATH_DENIED_REASON } from '@/lib/core'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface RunningEntry {
  hash: string
  start: number
  saved: number
}

const running = new Map<number, RunningEntry>()

// 每 60 秒对运行中的进程累计一次游玩时长（不增加 sessions 次数）
setInterval(() => {
  if (!running.size) return
  for (const [pid, entry] of running) {
    const minutes = (Date.now() - entry.start) / 60000
    if (minutes - (entry.saved ?? 0) >= 0.5) {
      const delta = minutes - (entry.saved ?? 0)
      entry.saved = minutes
      void accumulatePlaytime(entry.hash, delta, Date.now(), true)
    }
  }
}, 60000)

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const exePath = body.exePath?.trim() as string | undefined
    const hash = (body.hash as string | undefined)?.trim() ?? ''
    if (!exePath) {
      return NextResponse.json({ ok: false, error: '缺少 exePath 参数' }, { status: 400 })
    }
    if (!/\.(exe|bat|cmd)$/i.test(exePath)) {
      return NextResponse.json(
        { ok: false, error: '仅支持启动 .exe/.bat/.cmd 文件' },
        { status: 400 }
      )
    }
    if (!(await isPathAllowed(exePath))) {
      return NextResponse.json({ ok: false, error: '拒绝启动：' + PATH_DENIED_REASON }, { status: 403 })
    }
    const resolved = path.resolve(exePath)
    const cwd = path.dirname(resolved)
    const child = spawn(resolved, [], { cwd, detached: true, stdio: 'ignore', windowsHide: false })
    const pid = child.pid ?? 0
    if (hash) running.set(pid, { hash, start: Date.now(), saved: 0 })
    child.on('error', (e: Error) => {
      console.error('[launch] 启动失败:', e.message)
      if (hash) running.delete(pid)
    })
    child.on('exit', () => {
      const entry = running.get(pid)
      if (entry) {
        running.delete(pid)
        const minutes = (Date.now() - entry.start) / 60000
        const delta = (entry.saved ?? 0) > 0 ? minutes - (entry.saved ?? 0) : minutes
        void accumulatePlaytime(entry.hash, delta, entry.start, false)
      }
    })
    return NextResponse.json({ ok: true, pid })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: '启动失败：' + (e instanceof Error ? e.message : String(e)) },
      { status: 500 }
    )
  }
}
