// moyu / 鲲 Galgame 数据源（www.moyu.moe，开源项目 KunMoe/kun-galgame-patch）。
// 使用站内公开 JSON API（无需登录/鉴权，无 HTML 解析）：
//   GET /api/v1/search/quick?keywords=<kw>   —— 关键词搜索（返回 data.galgames）
//   GET /api/v1/patch/:id/detail             —— 条目详情（含多语言 introduction_markdown）
// 站点为全年龄/SFW 与 R18 内容并存，但本模块只取文字简介/元数据，不涉及补丁资源下载。
import { fetchWithProxy, UA_STRING } from './fetch'
import { similarityOf } from './similarity'
import type { GameData } from './source-types'

const MOYU_API = 'https://www.moyu.moe/api/v1'
const MOYU_WEB = 'https://www.moyu.moe'
/** 站点图片床（与 nuxt.config 的 NUXT_PUBLIC_IMAGE_BED 默认值一致） */
const MOYU_IMAGE_BASE = 'https://image.kungal.iloveren.link'

/** 多语言名字/简介字段（站点 JSON 的键名） */
interface MoyuLangName {
  'en-us'?: string
  'ja-jp'?: string
  'zh-cn'?: string
  'zh-tw'?: string
}

/** quick-search 返回的单个 galgame 条目 */
export interface MoyuSearchItem {
  id: number
  name?: MoyuLangName
  vndb_id?: string
  banner?: string
  release_date?: string
  galgame?: {
    id?: number
    name_en_us?: string
    name_ja_jp?: string
    name_zh_cn?: string
    name_zh_tw?: string
    release_date?: string | null
    maker?: { id?: number; name?: MoyuLangName } | null
    effective_portrait_hash?: string
    effective_banner_hash?: string
  } | null
}

/** 详情接口的封面（缩略）字段 */
interface MoyuCover {
  image_hash?: string
  kind?: string
  width?: number
  height?: number
}

/** 详情接口返回的条目 */
export interface MoyuDetail {
  id: number
  name?: MoyuLangName
  vndb_id?: string
  release_date?: string | null
  galgame?: {
    id?: number
    name_en_us?: string
    name_ja_jp?: string
    name_zh_cn?: string
    name_zh_tw?: string
    release_date?: string | null
    maker?: { id?: number; name?: MoyuLangName } | null
    effective_portrait_hash?: string
    effective_banner_hash?: string
  } | null
  covers?: MoyuCover[]
  introduction_markdown?: MoyuLangName
  ratings?: Array<{ source?: string; score?: number; vote_count?: number }>
}

/** 请求公共头 */
function moyuHeaders() {
  return { 'User-Agent': UA_STRING, Accept: 'application/json' }
}

/** 详情图片哈希 → CDN URL（image.kungal.iloveren.link/<aa>/<bb>/<hash>.webp） */
function imageUrlOf(hash?: string): string | undefined {
  if (!hash || hash.length < 6) return undefined
  return `${MOYU_IMAGE_BASE}/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.webp`
}

/** 从 maker 多语言名取一个可读名 */
function makerDisplayName(n: MoyuLangName | undefined): string {
  if (!n) return ''
  return n['zh-cn'] || n['zh-tw'] || n['ja-jp'] || n['en-us'] || ''
}

/**
 * 按关键词搜索（quick-search 接口）。失败/无结果返回 []。
 * 返回条目同时包含「有补丁资源」与「暂无资源」的 galgame（均为 /patch/:id 页面）。
 */
export async function searchMoyu(keyword: string): Promise<MoyuSearchItem[]> {
  if (!keyword || !keyword.trim()) return []
  try {
    const res = await fetchWithProxy(
      `${MOYU_API}/search/quick?keywords=${encodeURIComponent(keyword.trim())}`,
      { headers: moyuHeaders() },
      10000
    )
    if (!res.ok) return []
    const json = await res.json().catch(() => null)
    const list = json?.data?.galgames
    return Array.isArray(list) ? (list as MoyuSearchItem[]) : []
  } catch {
    return []
  }
}

/**
 * 从搜索结果里挑与查询词最相似的条目。
 * 相似度取简体/繁体/日文/英文四个名字里的最大值。
 */
export function pickBestMoyu(
  query: string,
  items: MoyuSearchItem[],
  threshold = 0.4
): MoyuSearchItem | null {
  let best: MoyuSearchItem | null = null
  let bestScore = 0
  for (const item of items) {
    const n = item.name ?? {}
    const score = Math.max(
      similarityOf(query, n['zh-cn'] ?? ''),
      similarityOf(query, n['zh-tw'] ?? ''),
      similarityOf(query, n['ja-jp'] ?? ''),
      similarityOf(query, n['en-us'] ?? '')
    )
    if (score > bestScore) {
      bestScore = score
      best = item
    }
  }
  return best && bestScore >= threshold ? best : null
}

/** 按条目 id 拉详情原始数据 */
export async function fetchMoyuDetail(id: string): Promise<MoyuDetail | null> {
  if (!id) return null
  try {
    // 站方接口默认 SFW 过滤：R18 条目（content_limit=nsfw）不带参数会被 404
    // （搜索接口不拦、详情接口拦，导致"搜得到却取不到"）。这里统一请求全部内容，
    // 本模块只取文字简介/元数据，不含任何补丁资源下载。
    const res = await fetchWithProxy(
      `${MOYU_API}/patch/${encodeURIComponent(id)}/detail?content_limit=all`,
      { headers: moyuHeaders() },
      10000
    )
    if (!res.ok) return null
    const json = await res.json().catch(() => null)
    const data = json?.data
    if (!data || data.id == null) return null
    return data as MoyuDetail
  } catch {
    return null
  }
}

/** 去除 markdown 标记，转纯文本（保留换行段落） */
function mdToPlain(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // 图片
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接保留文字
    .replace(/^#{1,6}\s*/gm, '') // 标题标记
    .replace(/[*_`~]/g, '') // 强调/删除线等符号
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 从单篇简介 markdown 里提取「STORY（剧情简介）」一节；
 * 没有 STORY 小标题时退回整篇纯文本。适合作为游戏的简介正文。
 */
function storySection(md: string | undefined): string {
  if (!md) return ''
  const lines = md.split('\n')
  const start = lines.findIndex((l) => /^#{1,4}\s*(?:STORY|ストーリー)/i.test(l.trim()))
  if (start < 0) return mdToPlain(md)
  const body: string[] = []
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,6}\s+\S/.test(lines[i])) break
    body.push(lines[i])
  }
  const text = mdToPlain(body.join('\n'))
  return text || mdToPlain(md)
}

/**
 * 提取条目的多语言简介：zh-cn → zh-tw → ja-jp → en-us（按顺序取首个非空）。
 * cnDescription 流程请使用 scrapeMoyuChineseByName，只取中文字键。
 */
function extractMoyuIntro(markdown?: MoyuLangName): string | undefined {
  if (!markdown) return undefined
  for (const key of ['zh-cn', 'zh-tw', 'ja-jp', 'en-us'] as const) {
    const text = storySection(markdown[key])
    if (text) return text
  }
  return undefined
}

/**
 * 中文简介专用：搜索 + 详情，仅接受 zh-cn / zh-tw 键的简介正文（避免把
 * 日文简介里夹杂的汉字误当成中文简介），找不到返回 undefined。
 */
export async function scrapeMoyuChineseByName(name: string): Promise<string | undefined> {
  const items = await searchMoyu(name)
  if (!items.length) return undefined
  const best = pickBestMoyu(name, items, 0.35)
  if (!best) return undefined
  const detail = await fetchMoyuDetail(String(best.id))
  if (!detail) return undefined
  const text =
    storySection(detail.introduction_markdown?.['zh-cn']) ||
    storySection(detail.introduction_markdown?.['zh-tw']) ||
    ''
  return text || undefined
}

/** 详情 → 统一 GameData */
export function moyuToGameData(detail: MoyuDetail, fallbackName?: string): GameData {
  const id = String(detail.id)
  const name = detail.name ?? {}
  const g = detail.galgame ?? {}
  const zh = name['zh-cn'] || name['zh-tw'] || ''
  const ja = name['ja-jp'] || ''
  const en = name['en-us'] || ''
  const title = zh || ja || en || fallbackName || id
  const cnTitle = zh && /[\u4e00-\u9fff]/.test(zh) ? zh : undefined

  // 原始名：日文优先，其次英文；与标题相同则略去
  const original = ja || en
  const originalTitle = original && original !== title ? original : undefined

  const makerName = makerDisplayName(g.maker?.name)
  const released = (g.release_date || detail.release_date || '').slice(0, 10) || undefined
  const vndbRating = (detail.ratings ?? []).find((r) => r.source === 'vndb')
  const vndbId =
    detail.vndb_id && /^v\d+$/i.test(detail.vndb_id) ? detail.vndb_id : undefined

  // 封面：优先竖版 portrait，其次详情首张封面，最后兜底 portrait/banner 哈希
  const portrait =
    (detail.covers ?? []).find((c) => c.kind === 'portrait' && c.image_hash) ||
    (detail.covers ?? []).find((c) => c.image_hash) ||
    { image_hash: g.effective_portrait_hash || g.effective_banner_hash }
  const coverUrl = imageUrlOf(portrait.image_hash)

  // 别名：除标题外的其它语言名（去重、限 12 个）
  const rawAliases = [name['zh-cn'], name['zh-tw'], name['ja-jp'], name['en-us']].filter(
    (v): v is string => !!v && v !== title
  )
  const aliases = Array.from(new Set(rawAliases)).slice(0, 12)

  const data: GameData = {
    source: 'moyu',
    title,
    cnTitle,
    originalTitle,
    description: extractMoyuIntro(detail.introduction_markdown),
    coverUrl,
    released,
    developers: makerName ? [makerName] : undefined,
    rating: vndbRating?.score,
    votecount: vndbRating?.vote_count,
    aliases: aliases.length ? aliases : undefined,
    vndbId,
    sourceUrl: `${MOYU_WEB}/patch/${id}/introduction`,
  }
  // 去掉空值字段，保持与其它源输出一致（scrape.ts 也会再过滤一遍）
  for (const key of Object.keys(data) as (keyof GameData)[]) {
    const v = data[key]
    if (v == null || v === '') delete data[key]
  }
  return data
}

/** 按名称刮削：搜索 → 最佳匹配（阈值 0.4）→ 详情 */
export async function scrapeMoyuByName(name: string): Promise<GameData | null> {
  const items = await searchMoyu(name)
  if (!items.length) return null
  const best = pickBestMoyu(name, items, 0.4)
  if (!best) return null
  const detail = await fetchMoyuDetail(String(best.id))
  if (!detail) return null
  return moyuToGameData(detail, name)
}

/** 按条目 id 取详情 */
export async function getMoyuById(id: string): Promise<GameData | null> {
  const detail = await fetchMoyuDetail(id)
  if (!detail) return null
  return moyuToGameData(detail)
}
