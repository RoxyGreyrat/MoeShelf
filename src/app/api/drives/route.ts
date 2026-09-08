// /api/drives —— 列出磁盘盘符（S1 依据编译产物模块 5936 重建）。
import { execSync } from 'child_process'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    if (process.platform === 'win32') {
      const out = execSync(
        'powershell -NoProfile -Command "Get-PSDrive -PSProvider FileSystem | ForEach-Object { $_.Name + \':\' }"',
        { encoding: 'utf-8', windowsHide: true }
      )
      const drives = out
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => /^[A-Za-z]:$/.test(l))
        .map((d) => `${d}\\`)
      return NextResponse.json({ ok: true, drives })
    }
    return NextResponse.json({ ok: true, drives: ['/'] })
  } catch {
    return NextResponse.json({ ok: true, drives: ['C:\\'] })
  }
}
