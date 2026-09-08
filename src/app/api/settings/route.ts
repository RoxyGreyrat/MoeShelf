// /api/settings —— 设置读写（S1 依据编译产物模块 5595 + 3247 重建）。
import { NextResponse } from 'next/server'
import { loadSettings, updateSettings } from '@/lib/core'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const settings = await loadSettings()
  return NextResponse.json({ ok: true, settings })
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const settings = await updateSettings({
      rootPath: typeof body.rootPath === 'string' ? body.rootPath.trim() : undefined,
      filterMode: body.filterMode as string | undefined,
      exeMap: body.exeMap as Record<string, string> | undefined,
      coverMap: body.coverMap as Record<string, string> | undefined,
      titleMap: body.titleMap as Record<string, string> | undefined,
      devMap: body.devMap as Record<string, string> | undefined,
      proxy: typeof body.proxy === 'string' ? body.proxy.trim() : undefined,
      ignorePaths: Array.isArray(body.ignorePaths) ? body.ignorePaths : undefined,
    })
    return NextResponse.json({ ok: true, settings })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: '参数错误：' + (e instanceof Error ? e.message : String(e)) },
      { status: 400 }
    )
  }
}
