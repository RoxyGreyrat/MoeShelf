// VNDB 数据源（编译产物模块 4021，chunk 136 内嵌于 scrape/covers 路由）。
// 全部走 kana JSON API（POST），无 HTML 解析。
// 导出对应：Ew=scrapeVndbByName、VJ=searchVndb、gM=getVndbById、
//          nC=getVndbCharacters、rp=getVndbCovers。
import { fetchWithProxy, UA_STRING } from './fetch'
import type { CharacterEntry, GameData } from './source-types'

/** 模块 4021 的角色定位映射表 */
const ROLE_LABELS: Record<string, string> = {
  main: '主角',
  primary: '主要人物',
  side: '次要人物',
  appears: '仅出现',
}

const VNDB_API = 'https://api.vndb.org/kana'

const VN_FIELDS =
  'id, title, alttitle, aliases, image { url, sexual, violence }, released, developers { name }, description, rating, votecount'

interface VndbVnResult {
  id: string
  title?: string
  alttitle?: string
  aliases?: string[]
  image?: { url?: string; sexual?: number; violence?: number } | null
  released?: string
  developers?: { name?: string }[] | null
  description?: string
  rating?: number
  votecount?: number
}

interface VndbCharacterResult {
  id: string
  name?: string
  original?: string
  image?: { url?: string } | null
  vns?: { role?: string }[] | null
}

/** 模块 4021 内嵌的 vn 查询（i）：429 时等待 2s 重试一次，失败返回 [] */
async function queryVn(filters: unknown[], results: number): Promise<VndbVnResult[]> {
  const isSearch = Array.isArray(filters) && filters[0] === 'search'
  const body: Record<string, unknown> = {
    filters,
    fields: VN_FIELDS,
    results,
  }
  if (isSearch) body.sort = 'searchrank'
  let res: Response | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await fetchWithProxy(
        `${VNDB_API}/vn`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': UA_STRING,
          },
          body: JSON.stringify(body),
        },
        20000
      )
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 2000))
        continue
      }
      break
    } catch {
      break
    }
  }
  if (!res || !res.ok) return []
  const json = await res.json().catch(() => null)
  return json?.results ?? []
}

/** 模块 4021 的 o：VN 条目 → 标准化 GameData */
function mapVndbResult(vn: VndbVnResult, fallbackTitle: string): GameData {
  return {
    source: 'vndb',
    title: vn.title || fallbackTitle,
    originalTitle: vn.alttitle || undefined,
    coverUrl: vn.image?.url,
    released: vn.released,
    developers: (vn.developers ?? []).map((d) => d.name).filter(Boolean) as string[],
    description: vn.description,
    rating: vn.rating,
    votecount: vn.votecount,
    sexual: vn.image?.sexual,
    aliases: vn.aliases?.length ? vn.aliases : undefined,
    vndbId: vn.id,
    vndbUrl: `https://vndb.org/${vn.id}`,
    sourceUrl: `https://vndb.org/${vn.id}`,
  }
}

/** 模块 4021 的 c：搜索前清洗标题用正则（remake/高清/汉化版 等噪声词） */
const REMOVE_RE =
  /\b(remake|remaster(ed)?|full ?voice|hd|高清|重置版|重制版|完整版|汉化版|官方中文|合集|收藏版|限定版|dlc|season|导演剪辑版|director'?s cut|终极版|豪华版)\b/gi

/** 模块 4021 Ew 内的最佳匹配打分（非 Li/hY，逐项加分） */
function pickBestVndb(list: VndbVnResult[], query: string): VndbVnResult | null {
  const q = query.trim().toLowerCase()
  const year = q.match(/(?:19|20)\d{2}/)
  let best: VndbVnResult | null = null
  let bestScore = -1
  for (const item of list) {
    let score = 0
    const title = (item.title ?? '').toLowerCase()
    if (title === q) score += 100
    else if (title.includes(q) || q.includes(title)) score += 40
    if ((item.aliases ?? []).some((a) => a.trim().toLowerCase() === q)) score += 80
    if (year && item.released?.startsWith(year[0])) score += 60
    if (item.released) score += 2
    if (item.image?.url) score += 1
    if (score > bestScore) {
      bestScore = score
      best = item
    }
  }
  return best ?? list[0] ?? null
}

/** 模块 4021 Ew：按名称刮削（清洗标题 → 搜索 → 打分选最佳） */
export async function scrapeVndbByName(name: string): Promise<GameData | null> {
  const cleaned =
    name.replace(REMOVE_RE, ' ').replace(/\b(?:19|20)\d{2}\b/g, ' ').replace(/\s+/g, ' ').trim() ||
    name
  const results = await queryVn(['search', '=', cleaned], 10)
  if (!results.length) return null
  const best = pickBestVndb(results, name)
  return best ? mapVndbResult(best, name) : null
}

/** 模块 4021 VJ：按名称搜索（原始结果，默认 12 条） */
export async function searchVndb(name: string, count = 12): Promise<VndbVnResult[]> {
  return queryVn(['search', '=', name], count)
}

/** 模块 4021 gM：按 id 取条目（无结果返回 null） */
export async function getVndbById(id: string): Promise<GameData | null> {
  const list = await queryVn(['id', '=', id], 1)
  return list.length ? mapVndbResult(list[0], '') : null
}

/** 模块 4021 nC：按 vndbId 取角色/声优列表 */
export async function getVndbCharacters(vndbId: string): Promise<CharacterEntry[]> {
  if (!vndbId) return []
  try {
    const res = await fetchWithProxy(
      `${VNDB_API}/character`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': UA_STRING,
        },
        body: JSON.stringify({
          filters: ['vn', '=', ['id', '=', vndbId]],
          fields: 'id, name, original, image.url, vns.role',
          sort: 'id',
          results: 100,
        }),
      },
      20000
    )
    if (!res.ok) return []
    const json = await res.json().catch(() => null)
    return ((json?.results ?? []) as VndbCharacterResult[])
      .map((c) => {
        const role = c.vns?.find((v) => v.role)?.role
        return {
          name: c.original || c.name || '',
          image: c.image?.url,
          role: role ? ROLE_LABELS[role] || role : undefined,
        }
      })
      .filter((c) => c.name)
  } catch {
    return []
  }
}

/** 模块 4021 rp：按 vndbId 取全部发行封面（去重） */
export async function getVndbCovers(
  vndbId: string
): Promise<Array<{ url: string; released?: string; relTitle?: string; dims?: [number, number] }>> {
  try {
    const res = await fetchWithProxy(
      `${VNDB_API}/release`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': UA_STRING,
        },
        body: JSON.stringify({
          filters: ['vn', '=', ['id', '=', vndbId]],
          fields: 'id, title, released, images.url, images.dims',
          sort: 'released',
          reverse: true,
          results: 100,
        }),
      },
      15000
    )
    if (!res.ok) return []
    const json = await res.json().catch(() => null)
    const seen = new Set<string>()
    const covers: Array<{ url: string; released?: string; relTitle?: string; dims?: [number, number] }> = []
    for (const release of json?.results ?? []) {
      for (const image of release.images ?? []) {
        if (!image.url || seen.has(image.url)) continue
        seen.add(image.url)
        // VNDB 的 dims 是 [宽, 高]，只接受两个数字，异常值丢掉
        const d = image.dims
        const dims =
          Array.isArray(d) && d.length === 2 && typeof d[0] === 'number' && typeof d[1] === 'number'
            ? ([d[0], d[1]] as [number, number])
            : undefined
        covers.push({ url: image.url, released: release.released, relTitle: release.title, dims })
      }
    }
    return covers
  } catch {
    return []
  }
}
