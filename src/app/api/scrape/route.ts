// /api/scrape —— 刮削主接口（S2 依据编译产物模块 258 重建）。
// 支持 company（会社未下载列表）、enrich（补 Bangumi 评分）、source+id（按源按 id 拉取）、
// 常规顺序刮削与缓存复用。响应字段与前端依赖逐字段一致。
import { NextRequest, NextResponse } from 'next/server'
import { proxyFallbackUsedInRequest, withProxyFallbackContext } from '@/lib/fetch'
import { cacheKeyOf, loadCacheGames, saveCacheEntry } from '@/lib/core'
import { searchBangumi } from '@/lib/bangumi'
import { SOURCE_NAMES, fetchBySourceId } from '@/lib/search'
import {
  fetchCompanyGames,
  isScrapeCacheFresh,
  scrapeSequentially,
} from '@/lib/scrape'
import type { CacheEntry, ScrapedData } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  return withProxyFallbackContext(async () => {
    const json = (body: Record<string, unknown>, init?: ResponseInit) =>
      NextResponse.json({ ...body, proxyFallback: proxyFallbackUsedInRequest() }, init)
  const name = req.nextUrl.searchParams.get('name')?.trim() ?? ''
  const folder = req.nextUrl.searchParams.get('folder')?.trim()
  const hash = req.nextUrl.searchParams.get('hash')?.trim()
  const folderPath = req.nextUrl.searchParams.get('folderPath')?.trim()
  const force = req.nextUrl.searchParams.get('force') === '1'
  const source = req.nextUrl.searchParams.get('source')
  const id = req.nextUrl.searchParams.get('id')?.trim()
  const company = req.nextUrl.searchParams.get('company')?.trim()
  const vndbIds = (req.nextUrl.searchParams.get('vndbIds') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  // ===== 会社游戏列表（未下载游戏） =====
  if (company) {
    const ckey = 'company::' + company.toLowerCase()
    const hit = (await loadCacheGames())[ckey]
    // 会社缓存为“永久缓存”：命中即返回，不做过期判断；空结果不写缓存 → 下次自动重拉
    if (hit && hit.success && hit.data && !force) {
      const data = hit.data as { games?: unknown[] }
      return json({
        ok: true,
        cached: true,
        company,
        count: data.games?.length,
        games: data.games,
      })
    }
    try {
      const data = await fetchCompanyGames(company, vndbIds, ckey)
      if (!data || !data.games || !data.games.length) {
        return json({ ok: true, company, count: 0, games: [] })
      }
      const entry: CacheEntry = {
        key: ckey,
        name: company,
        scrapedAt: new Date().toISOString(),
        success: true,
        schema: 2,
        data: {
          producerId: data.producer?.id,
          games: data.games,
        },
      }
      try {
        await saveCacheEntry(entry)
      } catch (e) {
        console.error('[scrape] company cache write failed:', e)
      }
      return json({
        ok: true,
        cached: false,
        company,
        count: data.games.length,
        games: data.games,
      })
    } catch (err) {
      return json(
        {
          ok: false,
          error: '获取会社游戏列表失败：' + (err instanceof Error ? err.message : String(err)),
        },
        { status: 500 }
      )
    }
  }

  if (!name) {
    return json({ ok: false, error: '缺少 name 参数' }, { status: 400 })
  }

  const cacheKey = folder && hash ? cacheKeyOf(folder, hash) : `name::${name}`

  // ===== enrich：补 Bangumi 评分/条目 id =====
  if (req.nextUrl.searchParams.get('enrich') === '1') {
    const entry = (await loadCacheGames())[cacheKey]
    if (entry && entry.success && entry.data) {
      if (entry.data.bgmRating != null) {
        return json({
          ok: true,
          cached: true,
          success: true,
          source: entry.data.source ?? null,
          data: entry.data,
        })
      }
      try {
        const bangumi = await searchBangumi(name)
        if (bangumi?.rating) {
          entry.data.bgmRating = bangumi.rating
          entry.data.bgmVotes = bangumi.votecount
          entry.data.bgmSubjectId = bangumi.bgmSubjectId ?? entry.data.bgmSubjectId
          entry.scrapedAt = new Date().toISOString()
          entry.folderPath = entry.folderPath || folderPath || undefined
          await saveCacheEntry(entry)
          return json({
            ok: true,
            cached: false,
            enriched: true,
            success: true,
            source: entry.data.source ?? null,
            data: entry.data,
          })
        }
        if (bangumi?.bgmSubjectId != null && entry.data.bgmSubjectId == null) {
          entry.data.bgmSubjectId = bangumi.bgmSubjectId
          entry.scrapedAt = new Date().toISOString()
          await saveCacheEntry(entry)
        }
      } catch {
        // enrich 失败走缓存兜底
      }
      return json({
        ok: true,
        cached: true,
        success: true,
        source: entry.data.source ?? null,
        data: entry.data,
      })
    }
  }

  // ===== 按数据源 + id 拉取 =====
  if (source && id) {
    if (!(SOURCE_NAMES as readonly string[]).includes(source)) {
      return json({ ok: false, error: '无效的数据源' }, { status: 400 })
    }
    let fetched
    try {
      fetched = await fetchBySourceId(source as (typeof SOURCE_NAMES)[number], id)
    } catch (e) {
      return json(
        { ok: false, error: '拉取失败：' + (e instanceof Error ? e.message : String(e)) },
        { status: 500 }
      )
    }
    if (!fetched) {
      return json(
        { ok: false, error: '该数据源中未找到对应条目（id=' + id + '）' },
        { status: 404 }
      )
    }
    const data = {
      ...fetched,
      title: fetched.title || name,
      scrapedAt: new Date().toISOString(),
    }
    const entry: CacheEntry = {
      key: cacheKey,
      name,
      scrapedAt: data.scrapedAt,
      success: true,
      schema: 2,
      data,
      folderPath: folderPath || undefined,
    }
    try {
      await saveCacheEntry(entry)
    } catch (e) {
      console.error('[scrape] 缓存写入失败:', e)
    }
    return json({ ok: true, cached: false, success: true, source, data })
  }

  // ===== 缓存复用（非 force 时） =====
  if (!force) {
    const entry = (await loadCacheGames())[cacheKey]
    if (entry && isScrapeCacheFresh(entry)) {
      return json({
        ok: true,
        cached: true,
        success: entry.success,
        source: entry.data?.source ?? null,
        sourcesTried: [],
        data: entry.data,
      })
    }
  }

  // ===== 顺序刮削 =====
  let result
  try {
    result = await scrapeSequentially(name)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return json({ ok: false, error: `刮削服务异常：${message}` }, { status: 500 })
  }
  const entry: CacheEntry = {
    key: cacheKey,
    name,
    scrapedAt: new Date().toISOString(),
    success: result.success,
    schema: 2,
    data: result.data as ScrapedData | null,
    folderPath: folderPath || undefined,
  }
  try {
    await saveCacheEntry(entry)
  } catch (e) {
    console.error('[scrape] 缓存写入失败:', e)
  }
  return json({ ok: true, cached: false, ...result })
  })
}
