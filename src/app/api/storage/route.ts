// /api/storage —— 数据目录位置查看/迁移（S1 依据编译产物模块 1746 + 8621 重建）。
import { NextResponse } from 'next/server'
import { changeDataDir, DEFAULT_DATA_DIR, resolveDataDir } from '@/lib/core'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const dataPath = await resolveDataDir()
  return NextResponse.json({ ok: true, dataPath, defaultPath: DEFAULT_DATA_DIR })
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const p = (body?.path as string | undefined)?.trim()
    if (!p) {
      return NextResponse.json({ ok: false, error: '缺少路径' }, { status: 400 })
    }
    const dataPath = await changeDataDir(p)
    return NextResponse.json({ ok: true, dataPath, defaultPath: DEFAULT_DATA_DIR })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: '更改失败：' + (e instanceof Error ? e.message : String(e)) },
      { status: 500 }
    )
  }
}
