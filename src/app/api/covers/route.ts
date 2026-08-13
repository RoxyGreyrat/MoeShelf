// /api/covers —— VNDB 封面列表 + 当前封面（S2 依据编译产物模块 9026 重建）。
import { NextRequest, NextResponse } from 'next/server'
import { getVndbCovers } from '@/lib/vndb'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const vndbId = req.nextUrl.searchParams.get('vndbId')?.trim() ?? ''
  const current = req.nextUrl.searchParams.get('current')?.trim() ?? ''
  if (!/^v\d+$/i.test(vndbId)) {
    return NextResponse.json({ ok: false, error: '无效的 vndbId' }, { status: 400 })
  }
  try {
    const covers = (await getVndbCovers(vndbId)).map((c) => ({
      ...c,
      isCurrent: !!current && c.url === current,
    }))
    if (current && !covers.some((c) => c.url === current)) {
      covers.unshift({ url: current, isCurrent: true })
    }
    return NextResponse.json({ ok: true, covers })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: '获取封面失败：' + (e instanceof Error ? e.message : String(e)) },
      { status: 500 }
    )
  }
}
