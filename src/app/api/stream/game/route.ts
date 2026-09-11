import { NextResponse } from 'next/server'
import { spawn } from 'node:child_process'
import { stream } from '@/lib/stream/session'
import { findWindow, restoreTopmost } from '@/lib/stream/input-win32'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * 手机上「结束游戏」：
 *   按本次串流采集的窗口找到游戏进程 → 连同子进程一起结束 → 关闭采集端 → 还原窗口置顶 → 结束会话。
 *
 * 注意：只结束「正在串流的那一个游戏窗口所属的进程」，不动其它任何程序。
 */
export async function POST () {
  const cap = stream.get()?.capture
  const holder = (globalThis as unknown as {
    __moeshelfCapture?: { child: import('node:child_process').ChildProcess | null; launchPid?: number }
  }).__moeshelfCapture

  // 优先用采集端上报的窗口标题定位（最准），否则退回启动时记录的 pid
  const win = cap?.windowTitle ? findWindow({ title: cap.windowTitle }) : null
  const pid = win?.pid || holder?.launchPid || 0

  const killed: string[] = []
  if (pid) {
    await new Promise<void>(resolve => {
      // /T 连同子进程一起结束（很多引擎是「启动器 → 引擎」两级）
      const t = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      t.on('exit', () => resolve())
      t.on('error', () => resolve())
    })
    killed.push(String(pid))
  }

  // 关采集端（同时会让它把窗口置顶还原）
  if (holder?.child && !holder.child.killed) {
    try { holder.child.stdin?.end(); holder.child.kill() } catch {}
    holder.child = null
  }
  restoreTopmost()
  stream.bye('host')

  return NextResponse.json({
    ok: true,
    killed,
    window: win ? { title: win.title, process: win.process } : null,
    note: pid ? undefined : '没有正在串流的游戏窗口，只结束了会话',
  })
}
