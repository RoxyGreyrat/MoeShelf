// /api/cache —— 刮削缓存列表/清空（S1 依据编译产物模块 1411 + 281 重建）。
import { NextResponse } from 'next/server'
import { clearCache, loadCacheGames } from '@/lib/core'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const entries = Object.values(await loadCacheGames()).map((e) => ({
    key: e.key,
    name: e.name,
    success: e.success,
    scrapedAt: e.scrapedAt,
  }))
  return NextResponse.json({ count: entries.length, entries })
}

export async function DELETE() {
  await clearCache()
  return NextResponse.json({ ok: true })
}
