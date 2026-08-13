// 各刮削数据源返回/使用的共享类型。
// 字段名与前端页面依赖的 JSON 响应逐字段一致（编译产物 4021/3524/7331/2587/7157）。

/** 标准化的游戏数据（写入 cache.json 的 data，也是 scrape 接口响应中的 data） */
export interface GameData {
  source?: string
  title?: string
  cnTitle?: string
  officialCnTitle?: string
  originalTitle?: string
  coverUrl?: string
  released?: string
  developers?: string[]
  description?: string
  rating?: number
  votecount?: number
  aliases?: string[]
  vndbId?: string
  vndbUrl?: string
  sourceUrl?: string
  bgmRating?: number
  bgmVotes?: number
  bgmSubjectId?: number
  scrapedAt?: string
}

/** 搜索候选（search 接口 candidates 中的一项，字段同编译产物 7157） */
export interface SearchCandidate {
  source: string
  id?: string
  title?: string
  originalTitle?: string
  coverUrl?: string
  released?: string
  developers?: string[]
  rating?: number
  votecount?: number
}

/** 全源搜索的单个数据源结果（同编译产物 7157 vU） */
export interface SourceSearchResult {
  source: string
  candidates: SearchCandidate[]
  timedOut?: boolean
  error?: string
}

/** 角色/声优条目（characters 接口） */
export interface CharacterEntry {
  name: string
  cv?: string
  image?: string
  role?: string
}
