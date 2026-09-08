// 全源搜索聚合（编译产物模块 7157，含 Moyu 扩展）。
// 导出对应：vU=searchAllSources、Ps=searchCandidates、h_=fetchBySourceId。
import { getVndbById, searchVndb } from './vndb'
import { getBangumiById, searchBangumiList } from './bangumi'
import { getYmgalById, searchYmgal } from './ymgal'
import { getCngalById, searchCngal } from './cngal'
import { getMoyuById, searchMoyu } from './moyu'
import type { GameData, SearchCandidate, SourceSearchResult } from './source-types'

export const SOURCE_NAMES = ['vndb', 'bangumi', 'ymgal', 'cngal', 'moyu'] as const
export type SourceName = (typeof SOURCE_NAMES)[number]

/** 模块 7157 的 o：各源全源搜索超时 */
const SOURCE_TIMEOUTS: Record<SourceName, number> = {
  vndb: 20000,
  bangumi: 10000,
  ymgal: 8000,
  cngal: 8000,
  moyu: 10000,
}

/** 模块 7157 vU：五源并行搜索，逐源超时/异常隔离 */
export async function searchAllSources(query: string): Promise<SourceSearchResult[]> {
  return await Promise.all(
    SOURCE_NAMES.map(async (source) => {
      let result: SourceSearchResult = { source, candidates: [] }
      try {
        const candidates = await Promise.race([
          searchCandidates(source, query),
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), SOURCE_TIMEOUTS[source])
          ),
        ])
        result =
          candidates === null
            ? { source, candidates: [], timedOut: true }
            : { source, candidates }
      } catch (e) {
        result = { source, candidates: [], error: e instanceof Error ? e.message : String(e) }
      }
      return result
    })
  )
}

/** 模块 7157 的 l（Ps）：单源搜索并映射为统一候选结构 */
export async function searchCandidates(
  source: SourceName,
  query: string
): Promise<SearchCandidate[]> {
  switch (source) {
    case 'vndb':
      return (await searchVndb(query)).map((e) => ({
        source: 'vndb',
        id: e.id,
        title: e.title,
        originalTitle: e.alttitle ?? undefined,
        coverUrl: e.image?.url,
        released: e.released,
        developers: (e.developers ?? []).map((d) => d.name) as string[],
        rating: e.rating,
        votecount: e.votecount,
      }))
    case 'bangumi':
      return (await searchBangumiList(query)).map((e) => ({
        source: 'bangumi',
        id: String(e.id),
        title: e.name_cn || e.name,
        originalTitle: e.name_cn && e.name !== e.name_cn ? e.name : undefined,
        coverUrl: e.images?.large ?? e.images?.common,
        released: e.date ?? e.air_date,
        rating: typeof e.rating?.score === 'number' ? 10 * e.rating.score : undefined,
        votecount: e.rating?.total,
      }))
    case 'ymgal':
      return (await searchYmgal(query)).map((e) => ({
        source: 'ymgal',
        id: String(e.id),
        title: e.chineseName || e.name,
        originalTitle: e.chineseName ? e.name : undefined,
        coverUrl: e.mainImg,
        released: e.releaseDate,
        developers: e.orgName ? [e.orgName] : undefined,
        rating: e.score ? 10 * parseFloat(e.score) : undefined,
      }))
    case 'cngal':
      return (await searchCngal(query)).map((e) => ({
        source: 'cngal',
        id: String(e.entry.id),
        title: e.entry.name,
        coverUrl: e.entry.mainImage ?? undefined,
      }))
    case 'moyu':
      return (await searchMoyu(query)).map((e) => {
        const n = e.name ?? {}
        const zh = n['zh-cn'] || n['zh-tw'] || ''
        const ja = n['ja-jp'] || ''
        const en = n['en-us'] || ''
        const title = zh || ja || en || ''
        const original = ja || en
        const makerName = e.galgame?.maker?.name
        const developer = makerName
          ? makerName['zh-cn'] || makerName['zh-tw'] || makerName['ja-jp'] || makerName['en-us'] || ''
          : ''
        return {
          source: 'moyu',
          id: String(e.id),
          title,
          originalTitle: original && original !== title ? original : undefined,
          released: (e.release_date || e.galgame?.release_date || '').slice(0, 10) || undefined,
          developers: developer ? [developer] : undefined,
        }
      })
  }
}

/** 模块 7157 的 u（h_）：按数据源 + id 取详情 */
export async function fetchBySourceId(source: SourceName, id: string): Promise<GameData | null> {
  switch (source) {
    case 'vndb':
      return getVndbById(id)
    case 'bangumi':
      return getBangumiById(id)
    case 'ymgal':
      return getYmgalById(id)
    case 'cngal':
      return getCngalById(id)
    case 'moyu':
      return getMoyuById(id)
  }
}
