// /api/scan —— 扫描根目录/识别单路径（S1 依据编译产物模块 8229 + 内嵌 2147 重建）。
import { NextRequest, NextResponse } from 'next/server'
import { migrateGameAssociations } from '@/lib/core'
import { identify, scanRoot } from '@/lib/scan'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const rootPath = (body.rootPath as string | undefined)?.trim()
    if (!rootPath) {
      return NextResponse.json({ ok: false, error: '缺少根目录路径' }, { status: 400 })
    }
    const mode = body.mode === 'loose' ? 'loose' : 'strict'
    if (body.path) {
      const p = ((body.path as string) || '').trim()
      if (p) {
        try {
          const game = await identify(p, mode, rootPath)
          const oldHash = typeof body.oldHash === 'string' ? body.oldHash : ''
          if (game && oldHash && oldHash !== game.pathHash) {
            // 修改路径时迁移 settings/playtime/cache 的旧 hash 关联
            await migrateGameAssociations(
              oldHash,
              game.pathHash,
              game.folderName,
              game.folderPath,
              game.exeCandidates
            ).catch(() => {})
          }
          return NextResponse.json({ ok: true, game })
        } catch {
          return NextResponse.json({ ok: true, game: null, error: '路径无效或无法访问' })
        }
      }
    }
    const result = await scanRoot(rootPath, mode)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: '扫描失败：' + (e instanceof Error ? e.message : String(e)) },
      { status: 500 }
    )
  }
}
