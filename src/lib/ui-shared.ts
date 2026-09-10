'use client'

// ---------------------------------------------------------------------------
// 页面与各 UI 组件共享的类型、常量与小工具
// 从 page.tsx 抽出（行为与原来逐字一致），供 page / detail / settings 等组件复用
// ---------------------------------------------------------------------------

import type { LibraryGame, Settings } from '@/lib/types'

export type { LibraryGame }

export type GameStatus = 'pending' | 'scraping' | 'done' | 'error'

export interface CharacterEntry {
  name?: string
  image?: string
  role?: string
  cv?: string
}

export interface GameMetadata {
  title?: string
  originalTitle?: string
  officialCnTitle?: string
  cnTitle?: string
  alttitle?: string
  aliases?: string[]
  released?: string
  rating?: number
  votecount?: number
  developers?: string[]
  description?: string
  cnDescription?: string
  vndbId?: string
  vndbUrl?: string
  source?: string
  bgmRating?: number
  bgmVotes?: number
  bgmSubjectId?: string
  sexual?: number
  scrapedAt?: string
  coverUrl?: string
  characters?: CharacterEntry[]
  [key: string]: unknown
}

export interface Game extends LibraryGame {
  selectedExe?: string
  customCover?: string
  customTitle?: string
  customDeveloper?: string
  metadata?: GameMetadata | null
  status?: GameStatus
  error?: string
  playtimeMinutes?: number
  lastPlayed?: string
  playSessions?: number
  notDownloaded?: boolean
  completed?: boolean
}

export interface SearchCandidate {
  id: string
  source: string
  title: string
  originalTitle?: string
  coverUrl?: string
  released?: string
  rating?: number
  votecount?: number
  developers?: string[]
}

export interface SourceGroup {
  source: string
  candidates: SearchCandidate[]
  timedOut?: boolean
}

export interface CoverItem {
  url: string
  released?: string
  relTitle?: string
  isCurrent?: boolean
}

export interface ExeItem {
  name: string
  path: string
  rel?: string
}

export interface DirItem {
  name: string
  path: string
}

export interface CompanyInfo {
  local: number
  total: number
  games: Game[]
}

export interface WebCustomPatch {
  customTitle?: string
  customCover?: string
  customDeveloper?: string
}

export type AppSettings = Partial<Settings> | null

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

export const SOURCE_LABELS: Record<string, string> = {
  vndb: 'VNDB',
  bangumi: 'Bangumi',
  ymgal: 'YMGal',
  cngal: 'CnGal',
  moyu: 'Moyu',
}

export const CANDIDATE_SOURCES = ['vndb', 'bangumi', 'ymgal', 'cngal', 'moyu']

// 卡片网格：每页挂载数量 + 密度档位标签（最小卡宽走 CSS 变量 --density-min）
export const PAGE_STEP = 60
export const DENSITY_LABEL: Record<'compact' | 'cozy' | 'large', string> = {
  compact: '紧凑',
  cozy: '舒适',
  large: '大图',
}

// 详情弹窗「更多设置」的分组键（单选导航；同时也用于左侧导航列表）
export const ACT_SECTIONS = ['title', 'cover', 'fix', 'exe', 'dev', 'path', 'char'] as const
export const ACT_GROUPS: { title: string; items: { key: string; icon: string; label: string }[] }[] = [
  {
    title: '基本信息',
    items: [
      { key: 'title', icon: 'book', label: '修改标题' },
      { key: 'cover', icon: 'folder', label: '更换封面' },
    ],
  },
  {
    title: '识别与匹配',
    items: [
      { key: 'fix', icon: 'search', label: '修正条目' },
      { key: 'dev', icon: 'gamepad', label: '厂商 / 制作组' },
      { key: 'path', icon: 'folder', label: '修改路径' },
    ],
  },
  {
    title: '运行',
    items: [{ key: 'exe', icon: 'play', label: '可执行文件' }],
  },
  {
    title: '扩展数据',
    items: [{ key: 'char', icon: 'info', label: '角色 / 声优' }],
  },
]

// 全局设置弹窗的分组与导航（与详情弹窗的「更多设置」是两回事，键名一一对应右侧内容）
export const SETTINGS_GROUPS: { title: string; items: { key: string; icon: string; label: string }[] }[] = [
  {
    title: '资料库',
    items: [
      { key: 'root', icon: 'folder', label: '游戏根目录' },
      { key: 'storage', icon: 'drive', label: '数据存储位置' },
      { key: 'backup', icon: 'download', label: '数据备份与导出' },
    ],
  },
  {
    title: '界面',
    items: [
      { key: 'appearance', icon: 'grid', label: '界面缩放' },
      { key: 'nsfw', icon: 'eyeOff', label: 'NSFW 封面模糊' },
    ],
  },
  {
    title: '网络',
    items: [
      { key: 'proxy', icon: 'external', label: '代理服务器' },
      { key: 'lan', icon: 'info', label: '局域网访问' },
    ],
  },
  {
    title: '维护',
    items: [
      { key: 'cache', icon: 'refresh', label: '刮削缓存' },
      { key: 'about', icon: 'book', label: '说明' },
    ],
  },
]

// ---------------------------------------------------------------------------
// 全局刮削开关（localStorage 记忆）
// ---------------------------------------------------------------------------

export const cnMap: Record<string, string> = {}
export const nsfwMap: Record<string, number> = {}
let nsfwBlur = true
try {
  nsfwBlur = '0' !== (localStorage.getItem('gl-nsfw-blur') || '1')
} catch (e) {}

export function isNsfwBlurEnabled(): boolean {
  return nsfwBlur
}

export function setNsfwBlurEnabled(next: boolean): void {
  nsfwBlur = next
}

// 代理回退提示：整个页面会话只提示一次
let proxyFallbackToastShown = false
export function toastProxyFallback(push: (message: string, type?: 'success' | 'error' | 'info') => void) {
  if (proxyFallbackToastShown) return
  proxyFallbackToastShown = true
  try {
    localStorage.setItem('gl-proxy-toast-at', String(Date.now()))
  } catch (e) {}
  push('代理不可用，已尝试直连', 'info')
}

// ---------------------------------------------------------------------------
// 展示用格式化
// ---------------------------------------------------------------------------

/** VNDB 标签形如 "g123"、"g123.4"、"g123 (minor)" —— 只保留文本部分 */
export function stripVndbTags(text?: string | null): string {
  if (!text) return ''
  return text.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim()
}

/** "2018-04-27" → "2018-04-27"；只有年份时原样返回 */
export function formatRelease(released?: string | null): string {
  if (!released) return '发售日未知'
  const s = String(released).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d{4}-\d{2}$/.test(s)) return s
  if (/^\d{4}$/.test(s)) return s
  const d = new Date(s)
  if (!isNaN(d.getTime())) {
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  }
  return s
}

/** 显示标题优先级：手动标题 > 官方中文标题 > 中文标题 > 原名 > 文件夹名 */
export function displayTitle(game: Game): string {
  return (
    cnMap[game.pathHash] ??
    game.customTitle ??
    (game.metadata?.officialCnTitle as string | undefined) ??
    (game.metadata?.cnTitle as string | undefined) ??
    game.metadata?.title ??
    game.folderName
  )
}

export function isNsfwGame(game: Game): boolean {
  const id = game.metadata?.vndbId
  if (!id) return false
  const v = nsfwMap[id]
  return typeof v === 'number' && v > 0
}

/** 分钟 → "12.5 小时" / "45 分钟"；0 或空返回 null（不再渲染「0 分钟」） */
export function formatDuration(minutes?: number | null): string | null {
  if (minutes == null || minutes <= 0) return null
  if (minutes < 60) return `${Math.round(minutes)} 分钟`
  const h = minutes / 60
  return `${h >= 10 ? Math.round(h) : Math.round(h * 10) / 10} 小时`
}

/** 分钟 → "12.5h" / "45m"（统计卡用短格式） */
export function formatDurationCompact(minutes?: number | null): string {
  if (!minutes || minutes <= 0) return '0'
  if (minutes < 60) return `${Math.round(minutes)}m`
  const h = minutes / 60
  return `${h >= 10 ? Math.round(h) : Math.round(h * 10) / 10}h`
}

/** ISO 时间 → "刚刚 / 3 分钟前 / 5 小时前 / 2 天前 / 日期" */
export function relativeTime(t?: string | null): string {
  if (!t) return ''
  const then = new Date(t).getTime()
  if (isNaN(then)) return ''
  const diff = Date.now() - then
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day} 天前`
  const d = new Date(then)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function devName(game: Game): string | undefined {
  return game.customDeveloper ?? game.metadata?.developers?.[0]
}

/** 厂商名归一化：去掉常见后缀差异，避免同一会社被拆成多个分组 */
export function normalizeDev(name?: string | null): string {
  if (!name) return '未分类'
  let s = String(name).trim()
  if (!s) return '未分类'
  s = s.replace(/\s*[（(].*?[)）]\s*/g, '').trim()
  const alias: Record<string, string> = {
    FrontWing: 'Frontwing',
    Frontwing: 'Frontwing',
    Yuzusoft: 'YuzuSoft',
    YUZUSOFT: 'YuzuSoft',
  }
  return alias[s] ?? s
}

export function djb2Hash(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0
  return hash.toString(16).padStart(8, '0')
}

const COLOR_PAIRS: [string, string][] = [
  ['#6366f1', '#312e81'],
  ['#0ea5e9', '#0c4a6e'],
  ['#10b981', '#064e3b'],
  ['#f59e0b', '#78350f'],
  ['#ef4444', '#7f1d1d'],
  ['#8b5cf6', '#4c1d95'],
  ['#ec4899', '#831843'],
  ['#14b8a6', '#134e4a'],
  ['#f97316', '#7c2d12'],
  ['#84cc16', '#365314'],
  ['#06b6d4', '#164e63'],
  ['#a855f7', '#581c87'],
  ['#f43f5e', '#881337'],
  ['#22c55e', '#14532d'],
  ['#eab308', '#713f12'],
  ['#3b82f6', '#1e3a8a'],
  ['#d946ef', '#3b0764'],
  ['#0ea5e9', '#082f49'],
  ['#ca8a04', '#422006'],
  ['#64748b', '#0f172a'],
]

/** 按名称稳定取一对渐变色（封面占位用） */
export function colorFor(name: string): [string, string] {
  return COLOR_PAIRS[parseInt(djb2Hash(name), 16) % COLOR_PAIRS.length]
}

/** 列表筛选：厂商分组 + 关键词（标题 / 原名 / 文件夹名 / 厂商） */
export function matchesFilter(game: Game, query: string, filter: { kind: 'all' | 'dev'; name?: string }): boolean {
  if (filter.kind === 'dev' && normalizeDev(devName(game)) !== filter.name) return false
  if (query) {
    const title = displayTitle(game).toLowerCase()
    const original = (game.metadata?.originalTitle ?? '').toLowerCase()
    const dev = `${devName(game) ?? ''} ${(game.metadata?.developers ?? []).join(' ')}`.toLowerCase()
    const folder = game.folderName.toLowerCase()
    if (!title.includes(query) && !original.includes(query) && !folder.includes(query) && !dev.includes(query))
      return false
  }
  return true
}

// ---------------------------------------------------------------------------
// IndexedDB 封面缓存（含 window.indexedDB 特性检测与失败兜底）
// ---------------------------------------------------------------------------

export function idbGet(key: string): Promise<Blob | null> {
  return new Promise(res => {
    try {
      const q = indexedDB.open('gl-img', 1)
      q.onupgradeneeded = () => {
        q.result.createObjectStore('i')
      }
      q.onsuccess = () => {
        const tr = q.result.transaction('i')
        const os = tr.objectStore('i')
        const rq = os.get(key)
        rq.onsuccess = () => res(rq.result || null)
        rq.onerror = () => res(null)
      }
      q.onerror = () => res(null)
    } catch (e) {
      res(null)
    }
  })
}

export function idbPut(key: string, value: Blob): Promise<void> {
  return new Promise(res => {
    try {
      const q = indexedDB.open('gl-img', 1)
      q.onupgradeneeded = () => {
        q.result.createObjectStore('i')
      }
      q.onsuccess = () => {
        const tr = q.result.transaction('i', 'readwrite')
        tr.objectStore('i').put(value, key)
        tr.oncomplete = () => res()
        tr.onerror = () => res()
      }
      q.onerror = () => res()
    } catch (e) {
      res()
    }
  })
}

export function idbSave(url: string, cacheKey: string) {
  fetch(url)
    .then(r => r.blob())
    .then(b => idbPut(cacheKey, b))
    .catch(() => {})
}
