// /api/launch —— 启动游戏（游玩时长跟踪见 src/lib/playtime-tracker.ts）。
import { spawn } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'
import { isPathAllowed, PATH_DENIED_REASON } from '@/lib/core'
import { forgetLaunch, scheduleCheck, trackLaunch } from '@/lib/playtime-tracker'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const exePath = body.exePath?.trim() as string | undefined
    const hash = (body.hash as string | undefined)?.trim() ?? ''
    if (!exePath) {
      return NextResponse.json({ ok: false, error: '缺少 exePath 参数' }, { status: 400 })
    }
    if (!/\.(exe|bat|cmd)$/i.test(exePath)) {
      return NextResponse.json({ ok: false, error: '仅支持启动 .exe/.bat/.cmd 文件' }, { status: 400 })
    }
    if (!(await isPathAllowed(exePath))) {
      return NextResponse.json({ ok: false, error: '拒绝启动：' + PATH_DENIED_REASON }, { status: 403 })
    }
    const resolved = path.resolve(exePath)
    const cwd = path.dirname(resolved)
    const st = await fs.stat(resolved).catch(() => null)
    if (!st?.isFile()) {
      return NextResponse.json({ ok: false, error: '启动文件不存在或不是文件' }, { status: 404 })
    }
    const ext = path.extname(resolved).toLowerCase()
    const isScript = process.platform === 'win32' && (ext === '.bat' || ext === '.cmd')
    const child = isScript
      ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/c', resolved], {
          cwd,
          detached: true,
          stdio: 'ignore',
          windowsHide: false,
        })
      : spawn(resolved, [], { cwd, detached: true, stdio: 'ignore', windowsHide: false })
    const pid = child.pid ?? 0
    if (hash && pid) {
      await trackLaunch(pid, hash, isScript ? 'cmd.exe' : path.basename(resolved))
    }
    child.on('error', (e: Error) => {
      console.error('[launch] 启动失败:', e.message)
      forgetLaunch(pid)
    })
    // 启动器可能在几秒内就退出；延迟一次检查，进程树仍存活则继续计时
    child.on('exit', () => scheduleCheck(8000))
    return NextResponse.json({ ok: true, pid })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: '启动失败：' + (e instanceof Error ? e.message : String(e)) },
      { status: 500 }
    )
  }
}
