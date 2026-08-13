// 刮削主逻辑（编译产物 scrape 路由模块 258 中提取，chunk 内的 4021/7157 已拆到各源模块）。
// 包含：三源并行中文名/评分补全（h）、顺序刮削（f）、会社游戏列表（fetchCompanyGames，
// 含空结果不缓存 = 自动重拉，及后台中文名补全并回写缓存）。
import { scrapeVndbByName } from './vndb'
import { searchBangumi } from './bangumi'
import { scrapeYmgalByName } from './ymgal'
import { scrapeCngalByName } from './cngal'
import { fetchWithProxy, UA_STRING } from './fetch'
import { loadCacheGames, saveCacheEntry, CACHE_SCHEMA } from './core'
import { sleep } from './similarity'
import type { CacheEntry } from './types'
import type { GameData } from './source-types'

/** 顺序刮削的数据源（模块 258 的 p） */
const SCRAPE_SOURCES = [
  { name: 'vndb', run: scrapeVndbByName },
  { name: 'bangumi', run: searchBangumi },
  { name: 'ymgal', run: scrapeYmgalByName },
  { name: 'cngal', run: scrapeCngalByName },
] as const

/**
 * scrape 路由使用的缓存新鲜度（模块 258 内嵌 281 的 p7）：
 * 成功条目 90 天、失败条目 6 小时。
 * 注意：characters 路由内嵌的 281 版本失败条目为 30 天（2592e5），
 * core.isCacheFresh 按 30 天实现；本路由按编译产物原样使用 6 小时，两处并存。
 */
export function isScrapeCacheFresh(entry: CacheEntry | undefined): boolean {
  if (!entry || entry.schema !== CACHE_SCHEMA) return false
  const age = Date.now() - new Date(entry.scrapedAt).getTime()
  const maxAge = entry.success ? 7776e6 : 216e5
  return age >= 0 && age < maxAge
}

export interface EnrichResult {
  cnTitle?: string
  bgmRating?: number
  bgmVotes?: number
  bgmSubjectId?: number
}

/**
 * 模块 258 的 h：三源并行补全中文名与 Bangumi 评分。
 * ymgal/cngal 超时 2s，bangumi 超时 4s；中文名优先级 ymgal > cngal > bangumi。
 */
export async function enrichChineseAndRating(name: string): Promise<EnrichResult> {
  const [ymgal, cngal, bangumi] = await Promise.all([
    Promise.race([scrapeYmgalByName(name), sleep(2000).then(() => null)]).catch(() => null),
    Promise.race([scrapeCngalByName(name), sleep(2000).then(() => null)]).catch(() => null),
    Promise.race([searchBangumi(name), sleep(4000).then(() => null)]).catch(() => null),
  ])
  const out: EnrichResult = {}
  if (ymgal?.cnTitle && !out.cnTitle) out.cnTitle = ymgal.cnTitle
  if (cngal?.cnTitle && !out.cnTitle) out.cnTitle = cngal.cnTitle
  if (bangumi) {
    if (bangumi.rating) {
      out.bgmRating = bangumi.rating
      out.bgmVotes = bangumi.votecount
    }
    if (bangumi.cnTitle && !out.cnTitle) out.cnTitle = bangumi.cnTitle
    if (bangumi.bgmSubjectId != null) out.bgmSubjectId = bangumi.bgmSubjectId
  }
  return out
}

export interface SequentialScrapeResult {
  success: boolean
  source: string | null
  sourcesTried: string[]
  data: GameData | null
}

/**
 * 模块 258 的 f：按 vndb → bangumi → ymgal → cngal 顺序刮削，
 * 源之间间隔 600ms；首个有结果的源即用；全部失败返回 success:false。
 * vndb 结果会额外调用 h() 补中文名与 Bangumi 评分。
 */
export async function scrapeSequentially(name: string): Promise<SequentialScrapeResult> {
  const sourcesTried: string[] = []
  let result: GameData | null = null
  for (const source of SCRAPE_SOURCES) {
    sourcesTried.push(source.name)
    try {
      result = await source.run(name)
    } catch {
      // 单源异常继续下一个
    }
    if (result) break
    await sleep(600)
  }
  if (!result) {
    return { success: false, source: null, sourcesTried, data: null }
  }
  const data: GameData = {
    title: result.title || name,
    source: result.source,
    scrapedAt: new Date().toISOString(),
  }
  if (result.source === 'bangumi') {
    data.officialCnTitle = result.cnTitle ?? result.title
    data.bgmRating = result.rating
    data.bgmVotes = result.votecount
    data.bgmSubjectId = result.bgmSubjectId
  } else if (result.source !== 'vndb') {
    data.officialCnTitle = result.cnTitle ?? result.title
  }
  for (const field of [
    'originalTitle',
    'coverUrl',
    'released',
    'developers',
    'description',
    'rating',
    'votecount',
    'aliases',
    'vndbId',
    'vndbUrl',
    'sourceUrl',
  ] as const) {
    const value = result[field]
    if (value != null && value !== '') {
      ;(data as Record<string, unknown>)[field] = value
    }
  }
  if (result.source === 'vndb') {
    const extra = await enrichChineseAndRating(name)
    if (extra.cnTitle && extra.cnTitle !== data.title) data.officialCnTitle = extra.cnTitle
    if (extra.bgmRating) {
      data.bgmRating = extra.bgmRating
      data.bgmVotes = extra.bgmVotes
    }
    if (extra.bgmSubjectId != null) data.bgmSubjectId = extra.bgmSubjectId
  }
  return { success: true, source: result.source, sourcesTried, data }
}

// ============ 会社游戏列表（模块 258 的 fetchCompanyGames） ============

interface VndbProducer {
  id: string
  name?: string
  original?: string
  aliases?: string[]
}

export interface CompanyGame {
  source: string
  cnTitle?: string
  title: string
  originalTitle?: string
  coverUrl?: string
  released?: string
  developers?: string[]
  rating?: number
  votecount?: number
  sexual?: number
  aliases?: string[]
  vndbId: string
  vndbUrl: string
  sourceUrl: string
}

export interface CompanyGamesResult {
  producer: Pick<VndbProducer, 'id' | 'name'> | null
  games: CompanyGame[]
}

/**
 * 模块 258 的 fetchCompanyGames：
 * 1) 按公司名搜 VNDB producer；搜不到且有 vndbIds 时用首个 id 反查 developer；
 * 2) 名称/原名/别名精确匹配选 producer，否则取第一条；
 * 3) 拉全部游戏（最多 6 页 × 100）；
 * 4) 别名中带汉字的直接用其中文名；
 * 5) 其余游戏在后台（setTimeout 0）以 5 个并发 worker 补中文名，完成后回写缓存。
 */
export async function fetchCompanyGames(
  name: string,
  vndbIds: string[],
  ckey: string
): Promise<CompanyGamesResult | null> {
  const vndbHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': UA_STRING,
  }

  const prodRes = await fetchWithProxy(
    'https://api.vndb.org/kana/producer',
    {
      method: 'POST',
      headers: vndbHeaders,
      body: JSON.stringify({
        filters: ['search', '=', name],
        fields: 'id, name, original, aliases',
        results: 20,
      }),
    },
    20000
  )
  if (!prodRes || !prodRes.ok) return null
  const prodJson = await prodRes.json().catch(() => null)
  let prods: VndbProducer[] = prodJson?.results ?? []
  if (!prods.length && Array.isArray(vndbIds) && vndbIds.length) {
    const vnRes = await fetchWithProxy(
      'https://api.vndb.org/kana/vn',
      {
        method: 'POST',
        headers: vndbHeaders,
        body: JSON.stringify({
          filters: ['id', '=', vndbIds[0]],
          fields: 'id, developers { id, name }',
          results: 1,
        }),
      },
      20000
    )
    const vnJson = vnRes && vnRes.ok ? await vnRes.json().catch(() => null) : null
    const dev0 = vnJson?.results?.[0]?.developers?.[0]
    if (dev0 && dev0.id) prods = [{ id: dev0.id, name: dev0.name || name }]
  }
  if (!prods.length) return null

  const q = name.trim().toLowerCase()
  const pick =
    prods.find((p) => (p.name || '').trim().toLowerCase() === q) ||
    prods.find((p) => (p.original || '').trim().toLowerCase() === q) ||
    prods.find((p) => (p.aliases || []).some((a) => (a || '').trim().toLowerCase() === q)) ||
    prods[0]

  let results: Array<{
    id: string
    title?: string
    alttitle?: string
    aliases?: string[]
    image?: { url?: string; sexual?: number } | null
    released?: string
    developers?: { name?: string }[] | null
    rating?: number
    votecount?: number
  }> = []
  let page = 1
  let more = true
  while (more && page <= 6) {
    const vnRes = await fetchWithProxy(
      'https://api.vndb.org/kana/vn',
      {
        method: 'POST',
        headers: vndbHeaders,
        body: JSON.stringify({
          filters: ['developer', '=', ['id', '=', pick.id]],
          fields:
            'id, title, alttitle, aliases, image.url, released, developers { name }, rating, votecount, image { id, url, sexual, violence }',
          sort: 'id',
          results: 100,
          page,
        }),
      },
      20000
    )
    if (!vnRes || !vnRes.ok) break
    const json = await vnRes.json().catch(() => null)
    if (!json) break
    results = results.concat(json.results ?? [])
    more = !!json.more
    page++
  }

  const cnMap = new Map<string, string>()
  for (const vn of results) {
    const cn = (vn.aliases || []).find((a) => /[\u4e00-\u9fff]/.test(a || ''))
    if (cn) cnMap.set(vn.id, cn)
  }
  const todo = results.filter((vn) => !cnMap.has(vn.id))
  const games: CompanyGame[] = results.map((vn) => ({
    source: 'vndb',
    cnTitle: cnMap.get(vn.id),
    title: vn.title || '',
    originalTitle: vn.alttitle || undefined,
    coverUrl: vn.image?.url,
    released: vn.released,
    developers: (vn.developers ?? []).map((d) => d.name).filter(Boolean) as string[],
    rating: vn.rating,
    votecount: vn.votecount,
    sexual: vn.image ? vn.image.sexual : undefined,
    aliases: vn.aliases?.length ? vn.aliases : undefined,
    vndbId: vn.id,
    vndbUrl: 'https://vndb.org/' + vn.id,
    sourceUrl: 'https://vndb.org/' + vn.id,
  }))

  // 中文名搜索后台执行（不阻塞响应），完成后更新缓存
  if (todo.length && ckey) {
    let index = 0
    setTimeout(() => {
      void (async () => {
        const worker = async () => {
          while (index < todo.length) {
            const cur = todo[index++]
            const term =
              cur.alttitle && /[\u4e00-\u9fff\u3040-\u30ff]/.test(cur.alttitle)
                ? cur.alttitle
                : cur.title
            try {
              const extra = await enrichChineseAndRating(term || '')
              if (extra && extra.cnTitle) {
                cnMap.set(cur.id, extra.cnTitle)
                const target = games.find((g) => g.vndbId === cur.id)
                if (target) target.cnTitle = extra.cnTitle
              }
            } catch {
              // 单个条目失败不影响其余
            }
          }
        }
        await Promise.all([worker(), worker(), worker(), worker(), worker()])
        try {
          const all = await loadCacheGames()
          const entry = all[ckey]
          if (entry && entry.data) {
            entry.data.games = games
            await saveCacheEntry(entry)
          }
        } catch {
          // 后台回写失败静默
        }
      })()
    }, 0)
  }

  return { producer: pick, games }
}
