// /api/cache —— 刮削缓存列表/清空（S1 依据编译产物模块 1411 + 281 重建）。
import fs from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'
import { clearCache, loadCacheGames, resolveDataDir } from '@/lib/core'

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
  // 封面图片缓存也一并清空，避免 cache.json 与 cache/images 不一致
  try {
    await fs.rm(path.join(await resolveDataDir(), 'cache', 'images'), {
      recursive: true,
      force: true,
    })
  } catch {
    // 目录不存在或占用时忽略
  }
  return NextResponse.json({ ok: true })
}
