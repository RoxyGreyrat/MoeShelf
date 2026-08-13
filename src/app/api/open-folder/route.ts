// /api/open-folder —— 打开文件夹（S1 依据编译产物模块 1251 + 2849 重建）。
import { spawn } from 'child_process'
import path from 'path'
import { NextResponse } from 'next/server'
import { isPathAllowed, PATH_DENIED_REASON } from '@/lib/core'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const p = (body.path as string | undefined)?.trim()
    if (!p) {
      return NextResponse.json({ ok: false, error: '缺少 path 参数' }, { status: 400 })
    }
    if (!(await isPathAllowed(p))) {
      return NextResponse.json({ ok: false, error: PATH_DENIED_REASON }, { status: 403 })
    }
    if (process.platform === 'win32') {
      spawn('explorer.exe', [path.resolve(p)], { detached: true, stdio: 'ignore' }).unref()
    } else if (process.platform === 'darwin') {
      spawn('open', [path.resolve(p)], { detached: true, stdio: 'ignore' }).unref()
    } else {
      spawn('xdg-open', [path.resolve(p)], { detached: true, stdio: 'ignore' }).unref()
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: '打开目录失败：' + (e instanceof Error ? e.message : String(e)) },
      { status: 500 }
    )
  }
}
