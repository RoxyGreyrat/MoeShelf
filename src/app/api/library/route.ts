// /api/library —— 游戏库读取/保存（S1 依据编译产物模块 7770 重建）。
// 注意：编译产物该路由没有 dynamic/runtime 导出，保持原样。
import { NextRequest, NextResponse } from 'next/server'
import {
  cacheKeyOf,
  getCacheData,
  isCacheFresh,
  loadCacheGames,
  loadLibrary,
  loadSettings,
  saveLibrary,
} from '@/lib/core'
import { scanRoot } from '@/lib/scan'
import type { CacheEntry, LibraryGame } from '@/lib/types'
// 副作用导入：页面首次加载时恢复未结算的游玩会话（服务重启后继续计时）
import '@/lib/playtime-tracker'

export async function GET() {
  let games = await loadLibrary()
  if (games.length === 0) {
    const settings = await loadSettings()
    const cacheValues = Object.values(await loadCacheGames())
    const rebuilt = cacheValues
      .filter((e) => e.success && e.name && e.folderPath)
      .map((e) => ({
        folderName: e.name,
        folderPath: e.folderPath as string,
        pathHash: e.key.includes('::') ? e.key.split('::')[1] : '',
        fileCount: 0,
        exeCandidates: [],
        rootPath: settings.rootPath || undefined,
        savedAt: new Date().toISOString(),
      }))
    if (rebuilt.length > 0) {
      games = rebuilt as unknown as LibraryGame[]
      await saveLibrary(games)
    } else {
      // n 复用：先为缓存条目，扫描成功后被替换为扫描结果
      let scannedOrCached: Array<Record<string, unknown>> = cacheValues as unknown as Array<
        Record<string, unknown>
      >
      if (settings.rootPath && cacheValues.length > 0) {
        try {
          const scanRes = await scanRoot(settings.rootPath, settings.filterMode)
          scannedOrCached = scanRes.games.map((g) => ({
            ...g,
            rootPath: settings.rootPath,
            savedAt: new Date().toISOString(),
          })) as unknown as Array<Record<string, unknown>>
          if (scannedOrCached.length > 0) {
            games = scannedOrCached as unknown as LibraryGame[]
            await saveLibrary(games)
          }
        } catch {
          // 扫描失败则继续走缓存重建分支
        }
      }
      if (games.length === 0 && scannedOrCached.length > 0) {
        games = scannedOrCached
          .filter((x) => x.name && x.folderPath)
          .map((x) => ({
            folderName: x.name as string,
            folderPath: (x.folderPath as string) ?? '',
            pathHash: (x.key as string | undefined)?.includes('::')
              ? (x.key as string).split('::')[1]
              : '',
            fileCount: 0,
            exeCandidates: [],
            savedAt: new Date().toISOString(),
          })) as unknown as LibraryGame[]
        if (games.length > 0) await saveLibrary(games)
      }
    }
  }

  const enriched: Array<LibraryGame & { metadata: unknown }> = []
  let allCache: Record<string, CacheEntry> | null = null
  for (const game of games) {
    let meta: unknown = game.pathHash
      ? await getCacheData(cacheKeyOf(game.folderName, game.pathHash))
      : null
    if (!meta && game.pathHash && game.folderName) {
      allCache = allCache ?? (await loadCacheGames())
      for (const entry of Object.values(allCache)) {
        if (
          entry &&
          entry.data &&
          entry.name === game.folderName &&
          entry.schema === 2 &&
          isCacheFresh(entry) &&
          !entry.key.startsWith('name::')
        ) {
          meta = entry.data
          break
        }
      }
    }
    enriched.push({ ...game, metadata: meta })
  }
  return NextResponse.json({ ok: true, games: enriched })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const games = (Array.isArray(body?.games) ? body.games : []).map(
      (g: Record<string, unknown>) =>
        ({
          folderName: typeof g.folderName === 'string' ? g.folderName : '',
          folderPath: typeof g.folderPath === 'string' ? g.folderPath : '',
          pathHash: typeof g.pathHash === 'string' ? g.pathHash : '',
          fileCount: typeof g.fileCount === 'number' ? g.fileCount : 0,
          exeCandidates: Array.isArray(g.exeCandidates)
            ? g.exeCandidates
                .filter(
                  (e: unknown) =>
                    e && typeof (e as { path?: unknown }).path === 'string' &&
                    typeof (e as { name?: unknown }).name === 'string'
                )
                .slice(0, 30)
            : [],
          matchScore: typeof g.matchScore === 'number' ? g.matchScore : undefined,
          matchedTypes: Array.isArray(g.matchedTypes) ? g.matchedTypes : undefined,
          rootPath: typeof g.rootPath === 'string' ? g.rootPath : undefined,
          completed: typeof g.completed === 'boolean' ? g.completed : undefined,
          completedAt: typeof g.completedAt === 'string' ? g.completedAt : undefined,
          savedAt: new Date().toISOString(),
        }) as unknown as LibraryGame
    )
    await saveLibrary(games)
    return NextResponse.json({ ok: true, count: games.length })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: '保存失败：' + (e instanceof Error ? e.message : String(e)) },
      { status: 500 }
    )
  }
}
