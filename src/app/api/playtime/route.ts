// /api/playtime —— 游玩时长读取（S1 依据编译产物模块 9108 + 667 重建）。
import { NextResponse } from 'next/server'
import { loadPlaytimeGames } from '@/lib/core'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const games = await loadPlaytimeGames()
  return NextResponse.json({ ok: true, games })
}
