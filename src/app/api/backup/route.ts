// /api/backup —— 资料库导出/导入（新功能，S1 实现）。
// GET ?action=export：下载单个 JSON（{exportedAt, library, settings, playtime}）。
// POST ?action=import：请求体为上述导出 JSON，校验后写回三个数据文件。
import { NextRequest, NextResponse } from 'next/server'
import {
  loadLibraryFile,
  loadPlaytime,
  loadSettings,
  saveLibrary,
  savePlaytime,
  updateSettings,
} from '@/lib/core'
import type { LibraryFile, LibraryGame, PlaytimeFile, Settings } from '@/lib/types'

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function dateStamp(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    if (req.nextUrl.searchParams.get('action') !== 'export') {
      return NextResponse.json({ ok: false, error: '缺少 action=export 参数' }, { status: 400 })
    }
    const [library, settings, playtime] = await Promise.all([
      loadLibraryFile(),
      loadSettings(),
      loadPlaytime(),
    ])
    const payload = {
      exportedAt: new Date().toISOString(),
      library,
      settings,
      playtime,
    }
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="galgame-library-backup-${dateStamp(new Date())}.json"`,
      },
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: '导出失败：' + (e instanceof Error ? e.message : String(e)) },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    if (req.nextUrl.searchParams.get('action') !== 'import') {
      return NextResponse.json({ ok: false, error: '缺少 action=import 参数' }, { status: 400 })
    }
    const body = await req.json().catch(() => null)
    if (!isPlainObject(body)) {
      return NextResponse.json({ ok: false, error: '导入数据格式无效' }, { status: 400 })
    }
    const library = body.library as LibraryFile | undefined
    const settings = body.settings as Settings | undefined
    const playtime = body.playtime as PlaytimeFile | undefined
    if (!isPlainObject(library) || !Array.isArray(library.games)) {
      return NextResponse.json({ ok: false, error: '导入数据缺少有效的 library.games 数组' }, { status: 400 })
    }
    if (!isPlainObject(settings)) {
      return NextResponse.json({ ok: false, error: '导入数据缺少有效的 settings 对象' }, { status: 400 })
    }
    if (!isPlainObject(playtime) || !isPlainObject(playtime.games)) {
      return NextResponse.json({ ok: false, error: '导入数据缺少有效的 playtime.games 对象' }, { status: 400 })
    }
    // 与现有数据格式兼容：写回前用与编译产物相同的字段映射做归一化
    const games = library.games.map(
      (g) =>
        ({
          folderName: typeof g.folderName === 'string' ? g.folderName : '',
          folderPath: typeof g.folderPath === 'string' ? g.folderPath : '',
          pathHash: typeof g.pathHash === 'string' ? g.pathHash : '',
          fileCount: typeof g.fileCount === 'number' ? g.fileCount : 0,
          exeCandidates: Array.isArray(g.exeCandidates)
            ? g.exeCandidates
                .filter(
                  (e) =>
                    e &&
                    typeof (e as { path?: unknown }).path === 'string' &&
                    typeof (e as { name?: unknown }).name === 'string'
                )
                .slice(0, 30)
            : [],
          matchScore: typeof g.matchScore === 'number' ? g.matchScore : undefined,
          matchedTypes: Array.isArray(g.matchedTypes) ? g.matchedTypes : undefined,
          rootPath: typeof g.rootPath === 'string' ? g.rootPath : undefined,
          completed:
            typeof (g as Record<string, unknown>).completed === 'boolean'
              ? ((g as Record<string, unknown>).completed as boolean)
              : undefined,
          completedAt:
            typeof (g as Record<string, unknown>).completedAt === 'string'
              ? ((g as Record<string, unknown>).completedAt as string)
              : undefined,
          savedAt: typeof g.savedAt === 'string' ? g.savedAt : new Date().toISOString(),
        }) as unknown as LibraryGame
    )
    await saveLibrary(games)
    await updateSettings(settings)
    await savePlaytime({ version: 1, updatedAt: new Date().toISOString(), games: playtime.games })
    return NextResponse.json({ ok: true, games: games.length })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: '导入失败：' + (e instanceof Error ? e.message : String(e)) },
      { status: 500 }
    )
  }
}
