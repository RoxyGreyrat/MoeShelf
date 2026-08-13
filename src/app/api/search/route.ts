// /api/search —— 四源搜索（S2 依据编译产物模块 7341 重建）。
import { NextRequest, NextResponse } from 'next/server'
import { SOURCE_NAMES, searchAllSources, searchCandidates } from '@/lib/search'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const source = req.nextUrl.searchParams.get('source') ?? 'all'
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (!q) {
    return NextResponse.json({ ok: false, error: '缺少搜索关键词' }, { status: 400 })
  }
  try {
    if (source === 'all') {
      const results = await searchAllSources(q)
      return NextResponse.json({ ok: true, source: 'all', results })
    }
    if (!(SOURCE_NAMES as readonly string[]).includes(source)) {
      return NextResponse.json({ ok: false, error: '无效的数据源' }, { status: 400 })
    }
    const candidates = await searchCandidates(source as (typeof SOURCE_NAMES)[number], q)
    return NextResponse.json({ ok: true, source, candidates })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: '搜索失败：' + (e instanceof Error ? e.message : String(e)) },
      { status: 500 }
    )
  }
}
