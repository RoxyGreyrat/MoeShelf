// /api/list-exes —— 列出目录内可启动程序（S1 依据编译产物模块 6626 + 2147.B 重建）。
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'
import { isPathAllowed, PATH_DENIED_REASON } from '@/lib/core'
import { collectExes } from '@/lib/scan'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams.get('path')?.trim()
    if (!p) {
      return NextResponse.json({ ok: false, error: '缺少 path 参数' }, { status: 400 })
    }
    if (!(await isPathAllowed(p))) {
      return NextResponse.json({ ok: false, error: PATH_DENIED_REASON }, { status: 403 })
    }
    const resolved = path.resolve(p)
    const st = await fs.stat(resolved).catch(() => null)
    if (!st?.isDirectory()) {
      return NextResponse.json({ ok: false, error: '路径不存在或不是文件夹' }, { status: 400 })
    }
    const exes = await collectExes(resolved)
    return NextResponse.json({ ok: true, exes })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: '读取失败：' + (e instanceof Error ? e.message : String(e)) },
      { status: 500 }
    )
  }
}
