// /api/characters —— 角色/声优（S2 依据编译产物模块 8522 重建）。
// 支持按源+id 直取，以及四源并行回退（bangumi 优先，其次 vndb/cngal/ymgal），
// 并交叉补全声优（cv）。结果写入缓存条目 data.characters。
import { NextRequest, NextResponse } from 'next/server'
import { cacheKeyOf, loadCacheGames, saveCacheEntry } from '@/lib/core'
import { getBangumiCharacters, searchBangumi } from '@/lib/bangumi'
import { getVndbCharacters } from '@/lib/vndb'
import { findCngalIdByName, getCngalCharacters } from '@/lib/cngal'
import { findYmgalIdByName, getYmgalCharacters } from '@/lib/ymgal'
import type { CharacterEntry } from '@/lib/source-types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** 模块 8522 的 g：角色名归一化（小写、去空白/间隔符/连字符） */
function normalizeCharName(name: string): string {
  return (name || '').toLowerCase().replace(/[\s·・・\u3000-]/g, '')
}

/** 模块 8522 的 h：按顺序尝试名称，返回第一个非空结果 */
async function firstWorking<T>(
  names: string[],
  run: (name: string) => Promise<T[]>
): Promise<T[]> {
  for (const name of names) {
    if (!name || !name.trim()) continue
    const result = await run(name.trim())
    if (result.length > 0) return result
  }
  return []
}

/** 模块 8522 的 m：四源并行取角色，选定源后交叉补全声优 */
async function fetchCharacters(input: {
  vndbId?: unknown
  bgmSubjectId?: unknown
  names: string[]
}): Promise<CharacterEntry[]> {
  const names = (input.names ?? []).filter((n) => n && n.trim().length > 0)
  const [bgm, vndb, cngal, ymgal] = await Promise.all(
    [
      input.bgmSubjectId != null
        ? getBangumiCharacters(input.bgmSubjectId as number)
        : Promise.resolve([] as CharacterEntry[]),
      input.vndbId
        ? getVndbCharacters(input.vndbId as string)
        : Promise.resolve([] as CharacterEntry[]),
      firstWorking(names, async (n) => {
        const id = await findCngalIdByName(n)
        return id != null ? getCngalCharacters(id) : []
      }),
      firstWorking(names, async (n) => {
        const id = await findYmgalIdByName(n)
        return id != null ? getYmgalCharacters(id) : []
      }),
    ].map((p) => p.catch(() => [] as CharacterEntry[]))
  )
  const chosen = bgm.length ? bgm : vndb.length ? vndb : cngal.length ? cngal : ymgal
  if (!chosen.length) return []
  const cvByName = new Map<string, string>()
  for (const list of [bgm, cngal, ymgal]) {
    for (const ch of list) {
      if (ch.cv) cvByName.set(normalizeCharName(ch.name), ch.cv)
    }
  }
  return chosen.map((ch) =>
    ch.cv ? ch : { ...ch, cv: cvByName.get(normalizeCharName(ch.name)) || undefined }
  )
}

/** 给任意 Promise 加总超时；超时返回 null，不中断原请求 */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<null>(resolve => {
        timer = setTimeout(() => resolve(null), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name')?.trim() ?? ''
  const title = req.nextUrl.searchParams.get('title')?.trim() ?? ''
  const hash = req.nextUrl.searchParams.get('hash')?.trim() ?? ''
  const source = req.nextUrl.searchParams.get('source')?.trim()
  const id = req.nextUrl.searchParams.get('id')?.trim()
  if (!name) {
    return NextResponse.json({ ok: false, error: '缺少 name 参数' }, { status: 400 })
  }
  const cacheKey = hash ? cacheKeyOf(name, hash) : `name::${name}`
  const entry = (await loadCacheGames())[cacheKey]

  // ===== 按数据源 + id 直取 =====
  if (source && id) {
    let characters: CharacterEntry[] = []
    try {
      const picked = await withTimeout(
        (async () =>
          source === 'cngal'
            ? await getCngalCharacters(Number(id))
            : source === 'vndb'
              ? await getVndbCharacters(id)
              : source === 'ymgal'
                ? await getYmgalCharacters(Number(id))
                : await getBangumiCharacters(Number(id)))(),
        15000
      )
      if (picked === null) {
        return NextResponse.json({ ok: true, characters: [], timedOut: true })
      }
      characters = picked
    } catch {
      characters = []
    }
    // 空结果也写入缓存（[] 为真值，命中判断兼容），避免每次打开详情都重新抓取
    if (entry?.data) {
      entry.data.characters = characters
      if (source === 'bangumi') entry.data.bgmSubjectId = Number(id)
      entry.scrapedAt = new Date().toISOString()
      await saveCacheEntry(entry)
    }
    return NextResponse.json({ ok: true, characters })
  }

  // ===== 缓存命中 =====
  if (entry?.data?.characters) {
    return NextResponse.json({ ok: true, cached: true, characters: entry.data.characters })
  }

  // ===== bgmSubjectId：缓存 → searchBangumi 补全 =====
  let bgmSubjectId = entry?.data?.bgmSubjectId as number | null | undefined
  if (bgmSubjectId == null) {
    try {
      const bangumi = await withTimeout(searchBangumi(name), 10000)
      if (bangumi?.bgmSubjectId != null) {
        bgmSubjectId = bangumi.bgmSubjectId
        if (entry?.data) {
          entry.data.bgmSubjectId = bgmSubjectId
          entry.scrapedAt = new Date().toISOString()
          await saveCacheEntry(entry)
        }
      }
    } catch {
      // 忽略补全失败
    }
  }

  const names = [
    name,
    entry?.data?.officialCnTitle,
    title && title !== name ? title : '',
    entry?.data?.title,
  ].filter((n) => !!n && String(n).trim().length > 0) as string[]

  const picked = await withTimeout(
    fetchCharacters({
      vndbId: entry?.data?.vndbId,
      bgmSubjectId: bgmSubjectId ?? undefined,
      names,
    }),
    15000
  )
  if (picked === null) {
    return NextResponse.json({ ok: true, cached: false, characters: [], timedOut: true })
  }
  const characters = picked
  // 空结果也写入缓存，避免每次打开详情都重新抓取；超时不写缓存，下次可重试
  if (entry?.data) {
    entry.data.characters = characters
    entry.scrapedAt = new Date().toISOString()
    try {
      await saveCacheEntry(entry)
    } catch {
      // 缓存写失败不阻塞响应
    }
  }
  return NextResponse.json({ ok: true, cached: false, characters })
}
