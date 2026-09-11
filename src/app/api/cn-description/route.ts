// /api/cn-description —— 中文简介（S2 依据编译产物模块 450 重建，扩展 moyu 优先）。
// 三种用法：
//   GET  不带 source ：自动模式，每个候选名称内依次尝试 moyu → cngal → ymgal → bangumi，
//                     取首个含汉字的 description；命中后连同来源一起写回缓存条目。
//   GET  ?source=xx  ：手动指定源，跳过缓存只查这一个源（查不到时保留原有简介，不动缓存）。
//   POST            ：保存用户手动编辑的简介，标记 cnDescriptionSource='manual'
//                     （带 manual 标记的简介不会被重新刮削覆盖，见 api/scrape）。
import { NextRequest, NextResponse } from 'next/server'
import { CACHE_SCHEMA, cacheKeyOf, loadCacheGames, saveCacheEntry } from '@/lib/core'
import { scrapeMoyuChineseByName } from '@/lib/moyu'
import { scrapeCngalByName } from '@/lib/cngal'
import { searchYmgal, getYmgalById } from '@/lib/ymgal'
import type { YmgalSearchItem } from '@/lib/ymgal'
import { searchBangumi } from '@/lib/bangumi'
import { similarityOf } from '@/lib/similarity'
import type { CacheEntry } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** 可手动指定的中文简介源；数组顺序即自动模式的优先顺序 */
const SOURCES = ['moyu', 'cngal', 'ymgal', 'bangumi'] as const
type DescSource = (typeof SOURCES)[number]

/** 模块 450 的 m：描述需包含汉字才可用 */
function hasCjk(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text)
}

/** 只查一个源，返回首个含汉字的简介 */
async function fetchFromSource(source: DescSource, name: string): Promise<string | undefined> {
  if (!name || !name.trim()) return undefined
  if (source === 'moyu') {
    const text = await scrapeMoyuChineseByName(name)
    return text && hasCjk(text) ? text : undefined
  }
  if (source === 'cngal') {
    const cngal = await scrapeCngalByName(name)
    return cngal?.description && hasCjk(cngal.description) ? cngal.description : undefined
  }
  if (source === 'ymgal') {
    const list = await searchYmgal(name)
    if (!list.length) return undefined
    let best: YmgalSearchItem | null = null
    let bestScore = 0
    for (const item of list) {
      const score = Math.max(similarityOf(name, item.chineseName ?? ''), similarityOf(name, item.name))
      if (score > bestScore) {
        bestScore = score
        best = item
      }
    }
    if (!best || bestScore < 0.3) return undefined
    const detail = await getYmgalById(String(best.id))
    return detail?.description && hasCjk(detail.description) ? detail.description : undefined
  }
  const bangumi = await searchBangumi(name)
  return bangumi?.description && hasCjk(bangumi.description) ? bangumi.description : undefined
}

/** 自动模式：保持原行为（名称外层、源内层），命中时把来源一起带回去 */
async function findChineseDescription(
  names: string[],
): Promise<{ text: string; source: DescSource } | undefined> {
  for (const name of names) {
    for (const source of SOURCES) {
      try {
        const text = await fetchFromSource(source, name)
        if (text) return { text, source }
      } catch {
        // 换下一个源
      }
    }
  }
  return undefined
}

/** 候选名称：原名 / 官方中文名 / 传入标题 / 缓存里的标题 */
function candidateNames(
  name: string,
  title: string,
  data: Record<string, unknown> | null | undefined,
): string[] {
  const official = typeof data?.officialCnTitle === 'string' ? data.officialCnTitle : ''
  const scraped = typeof data?.title === 'string' ? data.title : ''
  return [name, official, title && title !== name ? title : '', scraped].filter(
    (n): n is string => !!n && String(n).trim().length > 0,
  )
}

function entryKeyOf(name: string, hash: string): string {
  return hash ? cacheKeyOf(name, hash) : `name::${name}`
}

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name')?.trim() ?? ''
  const title = req.nextUrl.searchParams.get('title')?.trim() ?? ''
  const hash = req.nextUrl.searchParams.get('hash')?.trim() ?? ''
  const wantSource = req.nextUrl.searchParams.get('source')?.trim() ?? ''
  const force = req.nextUrl.searchParams.get('force') === '1'
  if (!name) {
    return NextResponse.json({ ok: false, error: '缺少 name 参数' }, { status: 400 })
  }
  const cacheKey = entryKeyOf(name, hash)
  const entry = (await loadCacheGames())[cacheKey]
  const names = candidateNames(name, title, entry?.data)

  // 手动指定源：跳过缓存，只查这一个源
  if (wantSource && (SOURCES as readonly string[]).includes(wantSource)) {
    const source = wantSource as DescSource
    let text: string | undefined
    for (const candidate of names) {
      try {
        text = await fetchFromSource(source, candidate)
      } catch {
        text = undefined
      }
      if (text) break
    }
    if (!text) {
      // 查不到就保留原有简介，不覆盖缓存
      return NextResponse.json({ ok: true, description: null, source, empty: true })
    }
    if (entry?.data) {
      entry.data.cnDescription = text
      entry.data.cnDescriptionSource = source
      entry.scrapedAt = new Date().toISOString()
      await saveCacheEntry(entry)
    }
    return NextResponse.json({ ok: true, description: text, source })
  }

  if (!force && entry?.data?.cnDescription !== undefined) {
    return NextResponse.json({
      ok: true,
      cached: true,
      description: entry.data.cnDescription,
      source: entry.data.cnDescriptionSource ?? null,
    })
  }

  const hit = await findChineseDescription(names)
  // 空结果也写入（存空字符串标记已查过），避免每次打开详情都重新抓取
  if (entry?.data) {
    entry.data.cnDescription = hit?.text ?? ''
    if (hit) entry.data.cnDescriptionSource = hit.source
    entry.scrapedAt = new Date().toISOString()
    await saveCacheEntry(entry)
  }
  return NextResponse.json({ ok: true, description: hit?.text ?? null, source: hit?.source ?? null })
}

/** 手动编辑保存：写进缓存条目（没有条目就新建），并标记来源 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { name?: unknown; hash?: unknown; description?: unknown; source?: unknown }
    | null
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const hash = typeof body?.hash === 'string' ? body.hash.trim() : ''
  if (!name) {
    return NextResponse.json({ ok: false, error: '缺少 name 参数' }, { status: 400 })
  }
  const description = typeof body?.description === 'string' ? body.description : ''
  const source = typeof body?.source === 'string' && body.source ? body.source : 'manual'

  const cacheKey = entryKeyOf(name, hash)
  const entry: CacheEntry =
    (await loadCacheGames())[cacheKey] ??
    ({
      key: cacheKey,
      name,
      scrapedAt: new Date().toISOString(),
      success: true,
      data: {},
      schema: CACHE_SCHEMA,
    } as CacheEntry)
  entry.data = { ...(entry.data ?? {}), cnDescription: description, cnDescriptionSource: source }
  entry.scrapedAt = new Date().toISOString()
  await saveCacheEntry(entry)
  return NextResponse.json({ ok: true })
}
