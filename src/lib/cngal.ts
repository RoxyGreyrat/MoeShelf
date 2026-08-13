// CnGal 数据源（编译产物模块 2587，chunk 136）。
// 使用 api.cngal.org 的 JSON 接口，无 HTML 解析。
// 导出对应：j$=scrapeCngalByName、hM=searchCngal、T1=findCngalIdByName、
//          ex=getCngalCharacters、QF=getCngalById。
import { fetchWithProxy, UA_STRING } from './fetch'
import { pickBest } from './similarity'
import type { CharacterEntry, GameData } from './source-types'

const CNGAL_SEARCH_API = 'https://api.cngal.org/api/home/Search'
const CNGAL_ENTRY_API = 'https://api.cngal.org/api/entries/GetEntryView'

export interface CngalSearchItem {
  entry: {
    id: number
    name: string
    mainImage?: string
  }
}

/** 模块 2587 的 i：按关键词搜索（返回含 entry 的条目） */
export async function searchCngal(text: string): Promise<CngalSearchItem[]> {
  try {
    const res = await fetchWithProxy(
      `${CNGAL_SEARCH_API}?Types=Game&Text=${encodeURIComponent(text)}`,
      {
        headers: { 'User-Agent': UA_STRING, Accept: 'application/json' },
      },
      12000
    )
    if (!res.ok) return []
    const json = await res.json().catch(() => null)
    return (json?.pagedResultDto?.data ?? []).filter((x: { entry?: unknown }) => x.entry)
  } catch {
    return []
  }
}

/** 模块 2587 o（j$）：按名称刮削（Li 阈值 0.45 → QF 取详情） */
export async function scrapeCngalByName(name: string): Promise<GameData | null> {
  const list = await searchCngal(name)
  if (!list.length) return null
  const pick = pickBest(name, list, (x) => x.entry.name, 0.45)
  return pick ? getCngalById(String(pick.entry.id)) : null
}

/** 模块 2587 l（hM）：按名称搜索原始结果 */
export async function searchCngalRaw(name: string): Promise<CngalSearchItem[]> {
  return searchCngal(name)
}

/** 模块 2587 c（T1）：按名称搜索返回 entry.id（阈值默认 0.32） */
export async function findCngalIdByName(name: string, threshold = 0.32): Promise<number | null> {
  const list = await searchCngal(name)
  if (!list.length) return null
  const pick = pickBest(name, list, (x) => x.entry.name, threshold)
  return pick ? pick.entry.id : null
}

/** 模块 2587 s（ex）：按 id 取角色（最多 12 个） */
export async function getCngalCharacters(id: number): Promise<CharacterEntry[]> {
  try {
    const res = await fetchWithProxy(
      `${CNGAL_ENTRY_API}/${id}`,
      {
        headers: { 'User-Agent': UA_STRING, Accept: 'application/json' },
      },
      12000
    )
    if (!res.ok) return []
    const json = await res.json().catch(() => null)
    if (!json?.roles?.length) return []
    return json.roles
      .filter((r: { name?: string }) => r.name)
      .slice(0, 12)
      .map((r: { name: string; cv?: string; mainImage?: string; roleIdentity?: string }) => ({
        name: r.name,
        cv: r.cv || undefined,
        image: r.mainImage || undefined,
        role: r.roleIdentity || undefined,
      }))
  } catch {
    return []
  }
}

/** 模块 2587 u（QF）：按 id 取详情 */
export async function getCngalById(id: string): Promise<GameData | null> {
  try {
    const res = await fetchWithProxy(
      `${CNGAL_ENTRY_API}/${id}`,
      {
        headers: { 'User-Agent': UA_STRING, Accept: 'application/json' },
      },
      12000
    )
    if (!res.ok) return null
    const json = await res.json().catch(() => null)
    if (!json?.name) return null
    const developers = (json.productionGroups ?? [])
      .map((g: { displayName?: string; name?: string }) => g.displayName ?? g.name)
      .filter((n: unknown) => !!n) as string[]
    const release = (json.releases ?? []).find((r: { time?: string }) => r.time)
    return {
      source: 'cngal',
      title: json.name,
      cnTitle: /[\u4e00-\u9fff]/.test(json.name) ? json.name : undefined,
      coverUrl: json.mainPicture ?? undefined,
      description: json.briefIntroduction ?? undefined,
      released: release?.time?.slice(0, 10),
      developers,
      sourceUrl: `https://www.cngal.org/entries/index/${json.id}`,
    }
  } catch {
    return null
  }
}
