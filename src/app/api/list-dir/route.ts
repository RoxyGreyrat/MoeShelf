// /api/list-dir —— 目录浏览（S1 依据编译产物模块 3335 重建）。
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const dir = req.nextUrl.searchParams.get('path') ?? ''
  if (!dir) {
    return NextResponse.json({ ok: false, error: '缺少 path 参数' }, { status: 400 })
  }
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const dirs: Array<{ name: string; path: string }> = []
    let fileCount = 0
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.')) continue
        const lower = entry.name.toLowerCase()
        if (['$recycle.bin', 'system volume information', 'windows'].includes(lower)) continue
        dirs.push({ name: entry.name, path: path.join(dir, entry.name) })
      } else {
        fileCount++
      }
    }
    dirs.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
    const parentDir = path.dirname(dir)
    return NextResponse.json({
      ok: true,
      current: dir,
      parent: parentDir === dir ? null : parentDir,
      dirs,
      fileCount,
    })
  } catch {
    return NextResponse.json({ ok: false, error: '无法读取该目录（可能没有权限）' }, { status: 400 })
  }
}
