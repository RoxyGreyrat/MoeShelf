// Bangumi 数据源（编译产物模块 3524，chunk 136）。
// 使用 api.bgm.tv 的 JSON 接口，无 HTML 解析。
// 导出对应：searchBangumi=l、ex=searchBangumiList、kC=getBangumiCharacters、sr=getBangumiById。
import { fetchWithProxy, UA_STRING } from './fetch'
import { similarityOf } from './similarity'
import type { CharacterEntry, GameData } from './source-types'

const BGM_BASE = 'https://api.bgm.tv'
const BGM_HEADERS = { 'User-Agent': UA_STRING, Accept: 'application/json' }

/** 模块 3524 的 A：带 429 重试（最多 3 次，间隔 2s）的请求；不吞超时异常 */
async function bgmFetch(url: string, timeoutMs: number): Promise<Response | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetchWithProxy(url, { headers: BGM_HEADERS }, timeoutMs)
    if (res && res.status === 429) {
      await new Promise((r) => setTimeout(r, 2000))
      continue
    }
    return res
  }
  return null
}

interface BgmSearchItem {
  id: number
  name?: string
  name_cn?: string
  images?: { large?: string; common?: string } | null
  date?: string
  air_date?: string
  rating?: { score?: number; total?: number } | null
  summary?: string
}

/**
 * 模块 3524 l（searchBangumi）：按名称搜索 → 相似度（name_cn/name，阈值 0.4）
 * 选最佳 → 用 sr 取详情；sr 失败时用搜索条目本身兜底。
 * 注意：兜底分支的 rating 是原始分（未 ×10），与 sr 的 10× 不一致——原样保留。
 */
export async function searchBangumi(name: string): Promise<GameData | null> {
  let list: BgmSearchItem[] = []
  try {
    const res = await bgmFetch(`${BGM_BASE}/search/subject/${encodeURIComponent(name)}?type=4`, 12000)
    if (!res || !res.ok) return null
    const json = await res.json().catch(() => null)
    list = json?.list ?? []
  } catch {
    return null
  }
  if (!list.length) return null
  let best: BgmSearchItem | null = null
  let bestScore = 0
  for (const item of list) {
    const score = Math.max(similarityOf(name, item.name_cn || ''), similarityOf(name, item.name || ''))
    if (score > bestScore) {
      bestScore = score
      best = item
    }
  }
  const pick = bestScore >= 0.4 ? best : null
  if (!pick) return null
  const detail = await getBangumiById(String(pick.id))
  return (
    detail || {
      source: 'bangumi',
      title: pick.name_cn || pick.name || name,
      cnTitle: pick.name_cn || undefined,
      originalTitle: pick.name_cn && pick.name !== pick.name_cn ? pick.name : undefined,
      coverUrl: pick.images?.large ?? pick.images?.common,
      released: pick.date ?? pick.air_date,
      rating: typeof pick.rating?.score === 'number' ? pick.rating.score : undefined,
      votecount: typeof pick.rating?.total === 'number' ? pick.rating.total : undefined,
      description: pick.summary,
      sourceUrl: `https://bgm.tv/subject/${pick.id}`,
    }
  )
}

/** 模块 3524 ex：按名称搜索，返回原始 list（失败返回 []） */
export async function searchBangumiList(name: string): Promise<BgmSearchItem[]> {
  try {
    const res = await bgmFetch(`${BGM_BASE}/search/subject/${encodeURIComponent(name)}?type=4`, 12000)
    if (!res || !res.ok) return []
    const json = await res.json().catch(() => null)
    return json?.list ?? []
  } catch {
    return []
  }
}

/** 模块 3524 kC：按 subjectId 取角色/声优（最多 10 个，按 type 排序） */
export async function getBangumiCharacters(subjectId: number): Promise<CharacterEntry[]> {
  try {
    const res = await bgmFetch(`${BGM_BASE}/v0/subjects/${subjectId}/characters`, 10000)
    if (!res || !res.ok) return []
    const json = await res.json().catch(() => null)
    if (!Array.isArray(json) || !json.length) return []
    return json
      .filter((c: { name?: string }) => c.name)
      .sort((a: { type?: number }, b: { type?: number }) => (a.type ?? 9) - (b.type ?? 9))
      .slice(0, 10)
      .map(
        (c: {
          name: string
          actors?: { name?: string }[] | null
          images?: { grid?: string; large?: string; medium?: string } | null
          relation?: string
        }) => ({
          name: c.name,
          cv: c.actors?.[0]?.name || undefined,
          image: c.images?.grid ?? c.images?.large ?? c.images?.medium,
          role: c.relation || undefined,
        })
      )
  } catch {
    return []
  }
}

/** 模块 3524 sr：按 subjectId 取详情；infobox 中匹配 开发/制作/发行/producer/developer 的键用于提取制作方 */
export async function getBangumiById(id: string): Promise<GameData | null> {
  try {
    const res = await bgmFetch(`${BGM_BASE}/v0/subjects/${id}`, 12000)
    if (!res || !res.ok) return null
    const json = await res.json().catch(() => null)
    if (!json?.name) return null
    const developers: string[] = []
    for (const item of json.infobox ?? []) {
      const key = (item.key ?? '').toLowerCase()
      if (/开发|制作|发行|producer|developer/i.test(key)) {
        const value = item.value
        if (typeof value === 'string') developers.push(value)
        else if (Array.isArray(value)) {
          for (const v of value) {
            if (typeof v === 'string') developers.push(v)
            else if (v && typeof v === 'object') {
              const s = v.v ?? v.value
              if (typeof s === 'string') developers.push(s)
            }
          }
        }
      }
    }
    const title = json.name_cn || json.name
    return {
      source: 'bangumi',
      title: title || '',
      cnTitle: json.name_cn || undefined,
      originalTitle: json.name && json.name !== title ? json.name : undefined,
      coverUrl: json.images?.large ?? json.images?.common,
      description: json.summary,
      released: json.date,
      developers,
      rating: typeof json.rating?.score === 'number' ? 10 * json.rating.score : undefined,
      votecount: typeof json.rating?.total === 'number' ? json.rating.total : undefined,
      sourceUrl: `https://bgm.tv/subject/${json.id}`,
      bgmSubjectId: json.id,
    }
  } catch {
    return null
  }
}
