'use client'

// 模块 5867 整页组件 —— 从编译产物 .next/static/chunks/app/page-a8f2c3d4e5b6.js 逐段重建。
// 所有 className 字符串、fetch 调用、状态流转、条件渲染与编译产物一致；
// 任务二图标修复点以「[FIX]」注释标出。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import QRCode from 'qrcode-generator'
import { Icon, Spinner } from '@/components/icons'
import { useToast } from '@/components/toast'
import { buildCsv, downloadCsv } from '@/lib/csv'
import type { LibraryGame, Settings } from '@/lib/types'

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

type GameStatus = 'pending' | 'scraping' | 'done' | 'error'

interface CharacterEntry {
  name?: string
  image?: string
  role?: string
  cv?: string
}

interface GameMetadata {
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

interface Game extends LibraryGame {
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

interface SearchCandidate {
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

interface SourceGroup {
  source: string
  candidates: SearchCandidate[]
  timedOut?: boolean
}

interface CoverItem {
  url: string
  released?: string
  relTitle?: string
  isCurrent?: boolean
}

interface ExeItem {
  name: string
  path: string
  rel?: string
}

interface DirItem {
  name: string
  path: string
}

interface CompanyInfo {
  local: number
  total: number
  games: Game[]
}

interface WebCustomPatch {
  customTitle?: string
  customCover?: string
  customDeveloper?: string
}

type AppSettings = Partial<Settings> | null

// ---------------------------------------------------------------------------
// 模块级常量与工具函数
// ---------------------------------------------------------------------------

const SOURCE_LABELS: Record<string, string> = {
  vndb: 'VNDB',
  bangumi: 'Bangumi',
  ymgal: 'YMgal',
  cngal: 'CnGal',
  moyu: 'Moyu',
}

const cnMap: Record<string, string> = {}
const nsfwMap: Record<string, number> = {}
let nsfwBlur = true
try {
  nsfwBlur = '0' !== (localStorage.getItem('gl-nsfw-blur') || '1')
} catch (e) {}

// 代理回退提示：整个页面会话只提示一次（后台自动补全/重试失败时静默，
// 用户手动操作触发时才给提示；代理恢复后下次会话可再次提示）
let proxyFallbackToastShown = false
function toastProxyFallback(push: (message: string, type?: 'success' | 'error' | 'info') => void) {
  if (proxyFallbackToastShown) return
  proxyFallbackToastShown = true
  try {
    localStorage.setItem('gl-proxy-toast-at', String(Date.now()))
  } catch (e) {}
  push('代理不可用，已尝试直连', 'info')
}

const YEAR_PREFIX = /^(?:19|20)\d{2}[年.\-/]\d{1,2}/

function stripVndbTags(text?: string | null): string {
  if (!text) return ''
  return text
    .replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, '$2')
    .replace(/\[\/?(?:b|i|u|s|quote|center|spoiler|code|size=[^\]]*|color=[^\]]*)\]/gi, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\r/g, '')
    .trim()
}

function formatRelease(released?: string | null): string {
  if (!released) return '发售日未知'
  const m = released.match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/)
  if (!m) return released
  const [, year, month, day] = m
  return `${year}${month ? '-' + month.padStart(2, '0') : ''}${day ? '-' + day.padStart(2, '0') : ''}`
}

function displayTitle(game: Game): string {
  const custom = game.customTitle?.trim()
  if (custom) return custom
  const official = game.metadata?.officialCnTitle?.trim()
  if (official) return official
  if (game.metadata && game.metadata.vndbId) {
    const fromMap = cnMap[game.metadata.vndbId] || ''
    if (fromMap) return fromMap
  }
  const title = game.metadata?.title?.trim()
  if (title) return title
  return game.folderName
}

/** 是否为 NSFW 游戏（sexual 超标或 VNDB 标记），与卡片/弹窗的模糊判定一致 */
function isNsfwGame(game: Game): boolean {
  const metadata = game.metadata
  return (
    ((metadata?.sexual ?? 0) as number) > 0.5 ||
    (!!metadata?.vndbId && nsfwMap[metadata.vndbId] >= 2)
  )
}

function formatDuration(minutes?: number | null): string | null {
  if (minutes == null || minutes <= 0) return null
  if (minutes < 60) return `${Math.round(minutes)} 分钟`
  const hours = minutes / 60
  return hours >= 10 ? `${Math.round(hours)} 小时` : `${hours.toFixed(1)} 小时`
}

function formatDurationCompact(minutes?: number | null): string {
  if (minutes == null || minutes <= 0) return '0分钟'
  if (minutes < 60) return `${Math.round(minutes)}分钟`
  const hours = minutes / 60
  return hours >= 10 ? `${Math.round(hours)}小时` : `${hours.toFixed(1)}小时`
}

function relativeTime(t?: string | null): string {
  const ts = typeof t === 'string' ? Date.parse(t) : (t as unknown as number)
  if (!ts || isNaN(ts)) return ''
  const minutes = Math.floor((Date.now() - ts) / 60000)
  return minutes < 1
    ? '刚刚'
    : minutes < 60
      ? `${minutes}分钟前`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}小时前`
        : `${Math.floor(minutes / 1440)}天前`
}

function devName(game: Game): string | undefined {
  const custom = game.customDeveloper?.trim()
  if (custom) return custom
  const dev = game.metadata?.developers?.[0]?.trim()
  if (dev && !YEAR_PREFIX.test(dev)) return dev
  return undefined
}

const DEV_ALIASES: Array<[RegExp, string]> = [
  [/^key$/i, 'Key'],
  [/visual arts/i, 'Visual Arts'],
  [/yuzusoft|ゆずソフト|酸柚子|柚子社/i, 'YuzuSoft'],
  [/type.?moon|^notes\.?$/i, 'TYPE-MOON'],
  [/nitroplus|ニトロプラス/i, 'Nitroplus'],
  [/^age$|アージュ/i, 'AGE'],
  [/^minori$/i, 'minori'],
  [/5pb\./i, '5pb.'],
  [/^circus$/i, 'Circus'],
  [/^august$/i, 'August'],
  [/saga ?planets|サガプラネッツ/i, 'SAGA PLANETS'],
  [/frontwing/i, 'Frontwing'],
  [/^favorite$/i, 'FAVORITE'],
  [/lump of sugar|方糖社/i, 'Lump of Sugar'],
  [/purple ?software|紫社/i, 'Purple software'],
  [/^makura$|枕/i, '枕'],
  [/cabbage|きゃべつ/i, 'Cabbage Soft'],
  [/うぐいすかぐら/i, 'ウグイスカグラ'],
  [/alice ?soft|アリスソフト/i, 'Alice Soft'],
  [/eushully|ユーショリー/i, 'Eushully'],
  [/07th ?expansion/i, '07th Expansion'],
  [/akabeisoft/i, 'AKABEiSOFT2'],
  [/^feng$/i, 'Feng'],
  [/^sprite$/i, 'sprite'],
  [/kogado|工画堂/i, '工画堂'],
  [/^elf$|エルフ/i, 'élf'],
  [/戯画|chara-ani|^gigantic/i, '戏画'],
  [/^navel$/i, 'Navel'],
  [/^smee$/i, 'SMEE'],
  [/^hulotte$/i, 'Hulotte'],
  [/^ensemble$|エンサークル/i, 'ensemble'],
  [/whirlpool/i, 'Whirlpool'],
  [/silky'?s|シルキーズ/i, "Silky's"],
  [/palette|ぱれっと/i, 'Palette'],
  [/pulltop/i, 'PULLTOP'],
  [/^mangagamer$/i, 'MangaGamer'],
]

function normalizeDev(name?: string | null): string {
  if (!name) return '未分类'
  const t = name.trim()
  if (!t) return '未分类'
  for (const [re, mapped] of DEV_ALIASES) if (re.test(t)) return mapped
  return t
}

const COLOR_PAIRS: Array<[string, string]> = [
  ['#4f46e5', '#1e1b4b'],
  ['#7c3aed', '#2e1065'],
  ['#db2777', '#500724'],
  ['#0d9488', '#042f2e'],
  ['#ea580c', '#431407'],
  ['#2563eb', '#172554'],
  ['#dc2626', '#450a0a'],
  ['#16a34a', '#052e16'],
  ['#d946ef', '#3b0764'],
  ['#0ea5e9', '#082f49'],
  ['#ca8a04', '#422006'],
  ['#64748b', '#0f172a'],
]

function djb2Hash(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0
  return hash.toString(16).padStart(8, '0')
}

function colorFor(name: string): [string, string] {
  return COLOR_PAIRS[parseInt(djb2Hash(name), 16) % COLOR_PAIRS.length]
}

function matchesFilter(game: Game, query: string, filter: { kind: 'all' | 'dev'; name?: string }): boolean {
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

function idbGet(key: string): Promise<Blob | null> {
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
    } catch {
      res(null)
    }
  })
}

function idbPut(key: string, value: Blob): Promise<void> {
  return new Promise(res => {
    try {
      const q = indexedDB.open('gl-img', 1)
      q.onupgradeneeded = () => {
        q.result.createObjectStore('i')
      }
      q.onsuccess = () => {
        const tr = q.result.transaction('i', 'readwrite')
        const os = tr.objectStore('i')
        os.put(value, key)
        tr.oncomplete = () => res()
        tr.onerror = () => res()
      }
      q.onerror = () => res()
    } catch {
      res()
    }
  })
}

function idbSave(url: string, cacheKey: string) {
  try {
    fetch(url)
      .then(r => {
        if (!r.ok) return
        r.blob()
          .then(b => {
            try {
              idbPut(cacheKey, b)
            } catch {}
          })
          .catch(() => {})
      })
      .catch(() => {})
  } catch {}
}

// ---------------------------------------------------------------------------
// 通用小组件
// ---------------------------------------------------------------------------

function CoverPlaceholder({ name, className = '' }: { name: string; className?: string }) {
  const [colorA, colorB] = colorFor(name)
  const firstChar = Array.from(name.trim())[0] ?? '?'
  return (
    <div
      className={`relative flex h-full w-full items-center justify-center overflow-hidden ${className}`}
      style={{ background: `linear-gradient(135deg, ${colorA}, ${colorB})` }}
    >
      <span
        className="select-none text-[64px] font-bold leading-none text-white/25"
        style={{ textShadow: '0 2px 24px rgba(0,0,0,.35)' }}
      >
        {firstChar}
      </span>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.18),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_90%,rgba(0,0,0,.28),transparent_50%)]" />
    </div>
  )
}

function CoverImage({
  url,
  alt,
  className = '',
  fit = 'cover',
}: {
  url: string
  alt?: string
  className?: string
  /** cover：填满容器（可能裁切）；natural：按图片原始比例完整显示（不裁切、不留空） */
  fit?: 'cover' | 'natural'
}) {
  const [state, setState] = useState(0) // 0=经服务端代理 1=直连 2=失败 3=IndexedDB 缓存
  const [blobUrl, setBlobUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    idbGet(url)
      .then(v => {
        if (v && !cancelled) {
          try {
            setBlobUrl(URL.createObjectURL(v))
            setState(3)
          } catch {}
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [url])

  const src =
    state === 3 ? blobUrl : state === 0 ? `/api/image?url=${encodeURIComponent(url)}` : state === 1 ? url : null

  return (
    <div className={fit === 'natural' ? 'relative w-full' : 'absolute inset-0'}>
      {src && (
        <img
          key={state}
          src={src}
          alt={alt}
          loading="lazy"
          onLoad={() => {
            state === 0 ? idbSave(`/api/image?url=${encodeURIComponent(url)}`, url) : state === 1 && idbSave(url, url)
          }}
          onError={() => {
            if (state === 0) setState(1)
            else if (state === 1)
              idbGet(url)
                .then(v => {
                  if (v) {
                    try {
                      setBlobUrl(URL.createObjectURL(v))
                      setState(3)
                    } catch {
                      setState(2)
                    }
                  } else setState(2)
                })
                .catch(() => setState(2))
            else if (state === 3) setState(2)
          }}
          className={
            fit === 'natural'
              ? `block h-auto w-full ${className}`
              : `h-full w-full object-cover ${className}`
          }
        />
      )}
      {state === 2 && (
        <div className="absolute inset-x-0 bottom-0 flex justify-center pb-2">
          <button
            onClick={e => {
              e.stopPropagation()
              setState(0)
            }}
            title="重新加载封面"
            className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white/80 backdrop-blur transition hover:bg-black/80 hover:text-white"
          >
            封面加载失败 · 重试
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 顶栏 Header
// ---------------------------------------------------------------------------

function Header({
  search,
  onSearch,
  onScan,
  onOpenSettings,
  scanning,
  scraping,
}: {
  search: string
  onSearch: (v: string) => void
  onScan: () => void
  onOpenSettings: () => void
  scanning: boolean
  scraping: boolean
  rootName?: string | null
}) {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  // 挂载后与 document 实际主题同步（首帧由 layout 内联脚本写入，避免与本地状态脱节导致“第一次切换无效”）
  useEffect(() => {
    const sync = () => {
      const cur = document.documentElement.getAttribute('data-theme')
      if (cur === 'light' || cur === 'dark') setTheme(cur)
    }
    sync()
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  const toggleTheme = () => {
    // 切换瞬间禁用全站过渡，避免大量元素同时补间导致卡顿；350ms 后恢复
    const root = document.documentElement
    root.classList.add('theme-switch')
    const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light'
    setTheme(next)
    root.setAttribute('data-theme', next)
    try {
      localStorage.setItem('moeshelf-theme', next)
    } catch {}
    window.setTimeout(() => root.classList.remove('theme-switch'), 350)
  }
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-ink-950/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1880px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <img
            src="/icon.png"
            alt="MoeShelf"
            className="h-10 w-10 rounded-xl object-cover shadow-lg shadow-emerald-500/20"
          />
          <div className="leading-tight">
            <h1 className="bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-lg font-bold text-transparent">
              MoeShelf
            </h1>
            <p className="text-[11px] text-white/40">本地 · 私密 · 自动</p>
          </div>
        </div>
        <div className="order-3 w-full sm:order-none sm:ml-5 sm:w-72 sm:flex-1 sm:max-w-md">
          <div className="relative">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-white/30"
            />
            <input
              value={search}
              onChange={e => onSearch(e.target.value)}
              placeholder="搜索游戏名 / 开发商…"
              className="w-full rounded-full border border-white/10 bg-white/[0.04] py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-white/30 transition focus:border-indigo-400/50 focus:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onScan}
            disabled={scanning || scraping}
            title="重新扫描游戏根目录"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:from-indigo-400 hover:to-indigo-500 disabled:opacity-60"
          >
            <Icon name="refresh" className={`h-5 w-5 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? '正在扫描…' : '扫描游戏'}
          </button>
          <button
            onClick={toggleTheme}
            aria-label="切换亮暗主题"
            title={theme === 'light' ? '切换到暗色' : '切换到亮色'}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-base text-white/60 transition hover:bg-white/[0.06] hover:text-white"
          >
            {theme === 'light' ? '☀️' : '🌙'}
          </button>
          <button
            onClick={onOpenSettings}
            aria-label="设置"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-white/60 transition hover:bg-white/[0.06] hover:text-white"
          >
            <Icon name="settings" className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  )
}

// ---------------------------------------------------------------------------
// 时钟图标（游玩时长用，比文本符号更清晰）
// ---------------------------------------------------------------------------

function ClockIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.2 2" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// 游戏卡片
// ---------------------------------------------------------------------------

function GameCard({
  game,
  onOpen,
  onLaunch,
  onOpenFolder,
  onRescrape,
  onRemove,
  isFav = false,
  onToggleFav = () => {},
  nsfwOff = false,
  onToggleNsfw = () => {},
}: {
  game: Game
  onOpen: () => void
  onLaunch: () => void
  onOpenFolder: () => void
  onRescrape: () => void
  onRemove: () => void
  isFav?: boolean
  onToggleFav?: () => void
  nsfwOff?: boolean
  onToggleNsfw?: () => void
}) {
  const metadata = game.metadata
  const title = displayTitle(game)
  const release = metadata?.released ? formatRelease(metadata.released) : null
  const dev = devName(game)
  const coverUrl = game.customCover ?? metadata?.coverUrl ?? null
  const duration = formatDuration(game.playtimeMinutes)
  const exePath = game.selectedExe ?? game.exeCandidates[0]?.path
  const hasExe = !!exePath
  const nd = game.notDownloaded === true
  const isNsfw = isNsfwGame(game)
  const n18 = nsfwBlur && isNsfw && !nsfwOff

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onOpen()}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.03] transition-all duration-300 hover:-translate-y-1.5 hover:border-indigo-400/40 hover:bg-white/[0.05] hover:shadow-[0_16px_48px_-12px_rgba(99,102,241,0.4)] focus-visible:outline-2 focus-visible:outline-indigo-400"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-ink-800">
        {coverUrl ? (
          <CoverImage
            url={coverUrl}
            alt={title}
            className={`transition-transform duration-500 group-hover:scale-[1.06]${nd ? ' grayscale' : ''}${n18 ? ' r18-blur' : ''}`}
          />
        ) : (
          <CoverPlaceholder name={title} />
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 to-transparent" />
        {nd && <div className="pointer-events-none absolute inset-0 bg-slate-900/40" />}
        {game.completed === true && (
          <div className="pointer-events-none absolute right-2 top-2 z-[2] flex h-7 w-7 items-center justify-center rounded-full bg-black/55 shadow-[0_0_12px_rgba(245,197,66,0.35)] ring-1 ring-amber-200/40 backdrop-blur-md">
            <Icon
              name="check"
              className="h-3.5 w-3.5 text-amber-300 drop-shadow-[0_0_6px_rgba(245,197,66,0.8)]"
              strokeWidth={3}
            />
          </div>
        )}
        <button
          title={isFav ? '取消收藏' : '收藏'}
          aria-label={isFav ? '取消收藏' : '收藏'}
          onClick={e => {
            e.stopPropagation()
            onToggleFav()
          }}
          className="absolute left-2 top-2 z-[1] flex h-7 w-7 items-center justify-center rounded-full text-yellow-400 backdrop-blur transition"
          style={{ color: '#facc15', backgroundColor: 'rgba(0, 0, 0, 0.65)' }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill={isFav ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />
          </svg>
        </button>
        {n18 && (
          <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center">
            <span
              className="text-2xl font-black tracking-widest text-white/85"
              style={{
                fontFamily: "Arial, 'Helvetica Neue', sans-serif",
                fontSize: '17px',
                fontWeight: 800,
                letterSpacing: '0.28em',
                color: '#fff',
                backgroundColor: 'rgba(0,0,0,0.55)',
                padding: '4px 16px 4px 18px',
                borderRadius: '8px',
                boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
              }}
            >
              NSFW
            </span>
          </div>
        )}
        {isNsfw && nsfwBlur && (
          <button
            title={n18 ? '查看封面（取消该游戏的模糊）' : '恢复该游戏的封面模糊'}
            aria-label={n18 ? '取消该游戏的封面模糊' : '恢复该游戏的封面模糊'}
            onClick={e => {
              e.stopPropagation()
              onToggleNsfw()
            }}
            className="absolute bottom-2 left-2 z-[1] flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white/85 backdrop-blur transition hover:bg-indigo-500/90 hover:text-white"
          >
            <Icon name={n18 ? 'eye' : 'eyeOff'} className="h-4 w-4" />
          </button>
        )}
        {game.status === 'scraping' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
            <Spinner className="h-6 w-6" />
          </div>
        )}
        {game.status === 'error' && (
          <span
            className="absolute left-2 top-2 max-w-[70%] truncate rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-medium text-white"
            title={game.error ?? '获取失败'}
          >
            {game.error || '获取失败'}
          </span>
        )}
        {game.status === 'done' && !coverUrl && (
          <span className="absolute left-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white/70">
            暂无封面
          </span>
        )}
        <div className="absolute bottom-2 right-2 flex gap-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
          {nd ? null : (
            <button
              title="重新获取信息"
              aria-label={`重新获取信息 ${title}`}
              onClick={e => {
                e.stopPropagation()
                onRescrape()
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white/85 backdrop-blur transition hover:bg-indigo-500/90 hover:text-white"
            >
              <Icon name="refresh" className="h-4 w-4" />
            </button>
          )}
          <button
            title={nd ? '从列表隐藏' : '从列表移除'}
            aria-label={nd ? `隐藏 ${title}` : `移除 ${title}`}
            onClick={e => {
              e.stopPropagation()
              onRemove()
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white/85 backdrop-blur transition hover:bg-red-500/90 hover:text-white"
          >
            <Icon name="trash" className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3
          className="text-[13px] leading-snug font-semibold text-white/90"
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          title={
            nd
              ? `${title}\n未下载 · 来自网络刮削（VNDB）`
              : `${title}\n识别依据：${game.matchedTypes?.join('、') ?? '手动添加'}（得分 ${game.matchScore ?? '-'}）\n路径：${game.folderPath}`
          }
        >
          {title}
        </h3>
        <p className="truncate text-xs text-white/40">
          {release ?? '发售日未知'}
          {dev ? ` · ${dev}` : ''}
        </p>
        <p className="truncate text-[11px] text-white/25" title={game.folderPath}>
          {nd ? (
            `未下载 · VNDB #${metadata?.vndbId || ''}`
          ) : (
            <span className="inline-flex min-w-0 items-center gap-1">
              {duration ? (
                <span className="inline-flex shrink-0 items-center gap-1 align-middle font-semibold text-emerald-300 [text-shadow:0_0_6px_rgba(52,211,153,0.55)]">
                  <ClockIcon className="h-3 w-3 shrink-0" />
                  {duration}
                </span>
              ) : null}
              {duration ? <span className="shrink-0 text-white/20">·</span> : null}
              <span className="truncate">{game.folderName}</span>
            </span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-1.5 border-t border-white/[0.06] px-3 py-2">
        <button
          onClick={e => {
            e.stopPropagation()
            onLaunch()
          }}
          disabled={!hasExe || nd}
          title={nd ? '该游戏尚未下载到本地' : hasExe ? `启动 ${exePath!.split(/[\\/]/).pop()}` : '未找到可启动的 exe'}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
            nd
              ? 'bg-gradient-to-r from-amber-500/25 to-amber-500/10 text-amber-200'
              : 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-sm hover:from-emerald-400 hover:to-emerald-500 disabled:from-white/10 disabled:to-white/10 disabled:text-white/35'
          }`}
        >
          {/* [FIX] 任务二(a)：未下载时图标改高可见度颜色且不传 fill-current（线条图标禁止 fill） */}
          <Icon
            name={nd ? 'download' : 'play'}
            className={nd ? 'h-3 w-3 shrink-0 text-white/80' : 'h-3 w-3 fill-current'}
          />
          {nd ? '未下载' : hasExe ? '启动' : '无 exe'}
        </button>
        <button
          onClick={e => {
            e.stopPropagation()
            onOpenFolder()
          }}
          title="打开所在文件夹"
          aria-label={`打开 ${title} 所在文件夹`}
          className={`flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06] text-white/60 transition hover:bg-white/[0.1] hover:text-white${nd ? ' hidden' : ''}`}
        >
          <Icon name="folder" className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 搜索结果条目（修正条目 / 手动匹配）
// ---------------------------------------------------------------------------

const CANDIDATE_SOURCES = ['vndb', 'bangumi', 'ymgal', 'cngal', 'moyu']

function SearchCandidateRow({
  c,
  applying,
  onApply,
}: {
  c: SearchCandidate
  applying: string | null
  onApply: (c: SearchCandidate) => void
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] p-2 transition hover:border-indigo-400/30">
      <div className="relative h-11 w-8 shrink-0 overflow-hidden rounded bg-ink-800">
        {c.coverUrl ? <CoverImage url={c.coverUrl} alt={c.title} /> : <CoverPlaceholder name={c.title} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-white/85">{c.title}</p>
        <p className="truncate text-[10px] text-white/35">
          {c.originalTitle && c.originalTitle !== c.title ? `${c.originalTitle} · ` : ''}
          <span className="font-semibold text-white/55">{c.released ? c.released.slice(0, 4) : '日期未知'}</span>
          {c.rating ? ` · ★ ${(c.rating / 10).toFixed(2)}` : ''}
          {c.votecount ? `（${c.votecount.toLocaleString()}票）` : ''}
          {c.developers?.length ? ` · ${c.developers.join('/')}` : ''}
          <span className="ml-1 text-indigo-300/70">
            {SOURCE_LABELS[c.source]} #{c.id}
          </span>
        </p>
      </div>
      <button
        onClick={() => onApply(c)}
        disabled={applying !== null}
        className="shrink-0 rounded-lg bg-emerald-500/90 px-2.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-emerald-400 disabled:opacity-50"
      >
        {applying === c.id ? '应用中…' : '选择'}
      </button>
    </div>
  )
}

function SectionRow({
  active,
  icon,
  label,
  desc,
  onClick,
}: {
  active: boolean
  icon: string
  label: string
  desc: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition ${
        active ? 'bg-indigo-500/15 text-indigo-200' : 'hover:bg-white/[0.05] hover:text-white'
      }`}
    >
      <Icon name={icon} className="h-3.5 w-3.5 shrink-0" />
      <span className="shrink-0 text-xs font-medium">{label}</span>
      <span className="min-w-0 flex-1 truncate text-right text-[10px] text-white/30">{desc}</span>
      <Icon name="plus" className={`h-3 w-3 shrink-0 transition-transform ${active ? 'rotate-45' : ''}`} />
    </button>
  )
}

// ---------------------------------------------------------------------------
// 游戏详情面板
// ---------------------------------------------------------------------------

function GameDetailModal({
  game,
  onClose,
  onRescrape,
  onLaunch,
  onOpenFolder,
  onSetExe,
  onManualMatch,
  onSetCover,
  onSetTitle,
  onSetDev,
  onCharacters,
  onCnDescription,
  onRelocate,
  onSetWebCustom,
  onSetCompleted,
  nsfwOff = false,
  onToggleNsfw = () => {},
}: {
  game: Game | null
  onClose: () => void
  onRescrape: (game: Game, silent?: boolean) => Promise<unknown>
  onLaunch: (game: Game, exePath?: string) => Promise<unknown>
  onOpenFolder: (game: Game) => Promise<unknown>
  onSetExe: (game: Game, path: string) => Promise<unknown>
  onManualMatch: (game: Game, source: string, id: string) => Promise<boolean>
  onSetCover: (game: Game, url: string | null) => Promise<boolean>
  onSetTitle: (game: Game, title: string) => Promise<boolean>
  onSetDev: (game: Game, dev: string) => Promise<boolean>
  onCharacters?: (game: Game, characters: CharacterEntry[]) => void
  onCnDescription?: (game: Game, description: string) => void
  onRelocate: (game: Game, path: string) => Promise<{ ok: boolean; title?: string; error?: string }>
  onSetWebCustom: (hash: string, patch: WebCustomPatch) => void
  onSetCompleted?: (hash: string, completed: boolean) => void
  nsfwOff?: boolean
  onToggleNsfw?: () => void
}) {
  const [rescrapeBusy, setRescrapeBusy] = useState(false)
  const [launchBusy, setLaunchBusy] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  // 设置弹窗：不再分目录，所有项默认展开，点标题可折叠
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [searchSource, setSearchSource] = useState('all')
  const [fixQuery, setFixQuery] = useState('')
  const [fixCandidates, setFixCandidates] = useState<SearchCandidate[] | null>(null)
  const [fixAllResults, setFixAllResults] = useState<SourceGroup[] | null>(null)
  const [fixBusy, setFixBusy] = useState(false)
  const [fixError, setFixError] = useState<string | null>(null)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [coverList, setCoverList] = useState<CoverItem[] | null>(null)
  const [coverLoading, setCoverLoading] = useState(false)
  const [pathInp, setPathInp] = useState('')
  const [pathBusy, setPathBusy] = useState(false)
  const [pathMsg, setPathMsg] = useState('')
  const [coverError, setCoverError] = useState<string | null>(null)
  const [coverUrlInput, setCoverUrlInput] = useState('')
  const [titleInput, setTitleInput] = useState<string | null>(null)
  const [titleBusy, setTitleBusy] = useState(false)
  const [devInput, setDevInput] = useState<string | null>(null)
  const [devBusy, setDevBusy] = useState(false)
  const [, setExeAck] = useState(false)
  const [exeList, setExeList] = useState<ExeItem[] | null>(null)
  const [exeLoading, setExeLoading] = useState(false)
  const [exeError, setExeError] = useState<string | null>(null)
  const [characters, setCharacters] = useState<CharacterEntry[] | null>(null)
  const [charLoading, setCharLoading] = useState(false)
  const [charLoaded, setCharLoaded] = useState(false)
  const [charSource, setCharSource] = useState('bangumi')
  const [charQuery, setCharQuery] = useState('')
  const [charBusy, setCharBusy] = useState(false)
  const [charError, setCharError] = useState<string | null>(null)
  const [charMsg, setCharMsg] = useState<string | null>(null)
  // 防重入：同一游戏的角色/中文简介请求在途时不再重复发起
  const charFetchRef = useRef<string | null>(null)
  const cnFetchRef = useRef<string | null>(null)
  const { push } = useToast()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const doRelocate = async () => {
    if (!game) return
    const target = pathInp.trim()
    if (!target) return
    setPathBusy(true)
    setPathMsg('正在验证路径…')
    const res = await onRelocate(game, target)
    setPathBusy(false)
    if (res.ok) {
      setPathMsg(`已定位到「${res.title}」，正在重新获取信息…`)
      setTimeout(() => setPathMsg(''), 5000)
    } else setPathMsg(res.error || '验证失败')
  }

  const nd = game?.notDownloaded === true
  const metadata = game?.metadata
  const n18 = !!game && nsfwBlur && isNsfwGame(game) && !nsfwOff
  const title = game ? displayTitle(game) : ''
  const officialCnTitle =
    game && metadata?.officialCnTitle && metadata.officialCnTitle !== title ? metadata.officialCnTitle : null
  const coverUrl = game ? game.customCover ?? metadata?.coverUrl ?? undefined : undefined
  const completed = game?.completed === true
  const dev = game ? devName(game) : undefined
  const ratingDisplay = metadata?.rating != null && metadata.rating > 0 ? (metadata.rating / 10).toFixed(2) : null
  const duration = formatDuration(game?.playtimeMinutes)
  const description = metadata?.cnDescription
    ? stripVndbTags(metadata.cnDescription)
    : metadata?.description
      ? stripVndbTags(metadata.description)
      : ''
  const exeCandidates = game?.exeCandidates ?? []
  const currentExe = game ? game.selectedExe ?? exeCandidates[0]?.path ?? null : null
  const exeFileName = currentExe ? currentExe.split(/[\\/]/).pop() : null

  const v = game

  const handleSetTitle: (game: Game, title: string) => Promise<boolean> = nd
    ? (_g, val) => {
        void onSetWebCustom(v?.pathHash ?? '', { customTitle: val })
        return Promise.resolve(true)
      }
    : onSetTitle
  const handleSetCover: (game: Game, url: string | null) => Promise<boolean> = nd
    ? (_g, url) => {
        void onSetWebCustom(v?.pathHash ?? '', { customCover: url ?? undefined })
        return Promise.resolve(true)
      }
    : onSetCover
  const handleSetDev: (game: Game, dev: string) => Promise<boolean> = nd
    ? (_g, val) => {
        void onSetWebCustom(v?.pathHash ?? '', { customDeveloper: val })
        return Promise.resolve(true)
      }
    : onSetDev

  // 角色自动获取
  useEffect(() => {
    if (!game) return
    const existing = game.metadata?.characters
    if (existing) {
      setCharacters(existing)
      setCharLoading(false)
      return
    }
    if (game.metadata) {
      if (charFetchRef.current === game.pathHash) return
      charFetchRef.current = game.pathHash
      setCharLoading(true)
      setCharLoaded(false)
      ;(async () => {
        try {
          const resp = await fetch(
            `/api/characters?name=${encodeURIComponent(game.folderName)}&hash=${encodeURIComponent(game.pathHash)}&title=${encodeURIComponent(game.metadata?.title ?? '')}`,
          )
          const json = await resp.json()
          if (json.ok) {
            setCharacters(json.characters ?? [])
            // 空结果也回写（标记该游戏已查过角色），避免每次打开都重新请求
            onCharacters?.(game, json.characters ?? [])
          } else setCharacters([])
        } catch (e) {
          setCharacters([])
        }
        charFetchRef.current = null
        setCharLoading(false)
        setCharLoaded(true)
      })()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.pathHash, game?.metadata])

  // 中文简介补全
  useEffect(() => {
    if (game?.metadata && game.metadata.cnDescription === undefined) {
      if (cnFetchRef.current === game.pathHash) return
      cnFetchRef.current = game.pathHash
      ;(async () => {
        try {
          const resp = await fetch(
            `/api/cn-description?name=${encodeURIComponent(game.folderName)}&hash=${encodeURIComponent(game.pathHash)}&title=${encodeURIComponent(game.metadata?.title ?? '')}`,
          )
          const json = await resp.json()
          if (json.ok) onCnDescription?.(game, json.description ?? '')
        } catch (e) {}
        cnFetchRef.current = null
      })()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.pathHash, game?.metadata])

  // 设置弹窗默认全部展开：打开时预填搜索框与路径
  useEffect(() => {
    if (!manageOpen) return
    const folder = game?.folderName ?? ''
    if (folder) {
      setFixQuery(q => (q.trim() ? q : folder))
      setCharQuery(q => (q.trim() ? q : folder))
    }
    const folderPath = game?.folderPath ?? ''
    setPathInp(prev => (prev.trim() ? prev : folderPath))
  }, [manageOpen, game?.pathHash, game?.folderName, game?.folderPath])

  if (!v) return null

  const doRescrape = async () => {
    setRescrapeBusy(true)
    try {
      await onRescrape(v)
    } finally {
      setRescrapeBusy(false)
    }
  }

  const doLaunch = async () => {
    if (!launchBusy && currentExe) {
      setLaunchBusy(true)
      try {
        await onLaunch(v, currentExe)
      } finally {
        setLaunchBusy(false)
      }
    }
  }

  const toggleSection = (key: string) => {
    const willExpand = collapsed.has(key)
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    if (!willExpand) return
    if (key === 'title') setTitleInput(displayTitle(v))
    if (key === 'fix' && !fixQuery.trim()) setFixQuery(v.folderName)
    if (key === 'dev') setDevInput(devName(v) ?? '')
    if (key === 'char' && !charQuery.trim()) setCharQuery(v.folderName)
    if (key === 'path') setPathInp(v.folderPath ?? '')
  }

  const runFixSearch = async (query: string) => {
    setFixBusy(true)
    setFixError(null)
    setFixCandidates(null)
    setFixAllResults(null)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30000)
    try {
      const resp = await fetch(`/api/search?source=${searchSource}&q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
      const json = await resp.json()
      if (json.proxyFallback) toastProxyFallback(push)
      if (json.ok) {
        if (json.results) setFixAllResults(json.results ?? [])
        else setFixCandidates(json.candidates ?? [])
      } else setFixError(json.error ?? '搜索失败')
    } catch (e) {
      setFixError('搜索超时或网络错误，请重试或换个数据源')
    } finally {
      clearTimeout(timer)
      setFixBusy(false)
    }
  }

  const doFixSearch = () => {
    const query = fixQuery.trim() || v.folderName
    if (query) void runFixSearch(query)
  }

  const applyCandidate = async (c: SearchCandidate) => {
    setApplyingId(c.id)
    try {
      await onManualMatch(v, c.source, c.id)
    } finally {
      setApplyingId(null)
    }
  }

  const loadCovers = async () => {
    setCoverLoading(true)
    setCoverError(null)
    setCoverList(null)
    try {
      const resp = await fetch(`/api/covers?vndbId=${encodeURIComponent(metadata?.vndbId ?? '')}&current=${encodeURIComponent(coverUrl ?? '')}`)
      const json = await resp.json()
      if (json.proxyFallback) toastProxyFallback(push)
      if (json.ok) setCoverList(json.covers ?? [])
      else setCoverError(json.error ?? '加载失败')
    } catch (e) {
      setCoverError('加载封面列表失败')
    }
    setCoverLoading(false)
  }

  const pickCover = async (url: string | null) => {
    await handleSetCover(v, url)
  }

  const applyCoverUrl = async () => {
    const url = coverUrlInput.trim()
    if (!/^https?:\/\//i.test(url)) {
      setCoverError('请输入以 http(s):// 开头的图片链接')
      return
    }
    setCoverError(null)
    await handleSetCover(v, url)
    setCoverUrlInput('')
  }

  const saveTitle = async () => {
    if (titleInput != null && !titleBusy) {
      setTitleBusy(true)
      try {
        await handleSetTitle(v, titleInput)
      } finally {
        setTitleBusy(false)
      }
    }
  }

  const saveDev = async () => {
    if (devInput != null && !devBusy) {
      setDevBusy(true)
      try {
        await handleSetDev(v, devInput)
      } finally {
        setDevBusy(false)
      }
    }
  }

  const scanExes = async () => {
    if (!v.folderPath) {
      setExeError('路径未知，请先重新扫描获取真实路径')
      return
    }
    setExeLoading(true)
    setExeError(null)
    setExeList(null)
    try {
      const resp = await fetch(`/api/list-exes?path=${encodeURIComponent(v.folderPath)}`)
      const json = await resp.json()
      if (json.ok) setExeList(json.exes ?? [])
      else setExeError(json.error ?? '读取失败')
    } catch (e) {
      setExeError('网络错误')
    }
    setExeLoading(false)
  }

  const pickExe = async (path: string) => {
    await onSetExe(v, path)
    setExeAck(false) // 与原编译产物一致：此处重置 ack 状态后收起面板
  }

  const fetchCharacters = async () => {
    const query = (charQuery || v.folderName).trim()
    if (query && !charBusy) {
      setCharBusy(true)
      setCharError(null)
      setCharMsg(null)
      try {
        const resp = await fetch(`/api/search?source=${charSource}&q=${encodeURIComponent(query)}`)
        const json = await resp.json()
        if (json.ok && json.candidates && json.candidates.length > 0) await applyCharacterEntry(json.candidates[0])
        else setCharError('未找到匹配词条，换个关键词或数据源试试')
      } catch (e) {
        setCharError('搜索超时或网络错误，请重试')
      }
      setCharBusy(false)
    }
  }

  const applyCharacterEntry = async (entry: SearchCandidate) => {
    setCharError(null)
    setCharMsg(null)
    try {
      const resp = await fetch(
        `/api/characters?source=${charSource}&id=${encodeURIComponent(entry.id)}&name=${encodeURIComponent(v.folderName)}&hash=${encodeURIComponent(v.pathHash)}`,
      )
      const json = await resp.json()
      if (json.ok && json.characters?.length) {
        setCharacters(json.characters)
        setCharLoaded(true)
        onCharacters?.(v, json.characters)
        setCharMsg(`已从 ${SOURCE_LABELS[charSource] ?? charSource} 获取 ${json.characters.length} 个角色`)
      } else setCharError('该词条下未找到角色数据，换个词条试试')
    } catch (e) {
      setCharError('拉取失败，请重试')
    }
  }

  const infoChips = (
    <>
      <span className="rounded-lg bg-white/[0.06] px-2 py-1 text-white/70">发售 {formatRelease(metadata?.released)}</span>
      {ratingDisplay && (
        <span className="rounded-lg bg-amber-400/10 px-2 py-1 text-amber-300">
          ★ {ratingDisplay}
          {metadata?.votecount ? `（${metadata.votecount.toLocaleString()}票）` : ''}
        </span>
      )}
      {dev && (
        <span
          className="max-w-[160px] truncate rounded-lg bg-white/[0.06] px-2 py-1 text-white/70"
          title={metadata?.developers?.length ? `刮削到：${metadata.developers.join(' / ')}` : undefined}
        >
          {dev}
          {v.customDeveloper ? '（手动）' : ''}
        </span>
      )}
      {duration && (
        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-1 font-semibold text-emerald-300 [text-shadow:0_0_7px_rgba(52,211,153,0.6)]">
          <ClockIcon className="h-3.5 w-3.5 shrink-0" />
          <span>{duration}</span>
          {v.playSessions ? <span> · {v.playSessions}次</span> : null}
        </span>
      )}
    </>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-900 shadow-2xl animate-scale-in">
        <button
          onClick={() => setManageOpen(v => !v)}
          aria-label="设置"
          title="设置"
          className="absolute right-12 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white/70 backdrop-blur transition hover:bg-black/70 hover:text-white"
        >
          <Icon name="settings" className="h-4 w-4" />
        </button>
        <button
          onClick={onClose}
          aria-label="关闭"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white/70 backdrop-blur transition hover:bg-black/70 hover:text-white"
        >
          <Icon name="x" className="h-4 w-4" />
        </button>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <div className="relative hidden md:flex md:w-72 md:shrink-0 md:flex-col">
              <div className="relative w-full overflow-hidden bg-ink-800 md:rounded-tl-2xl">
                {coverUrl && (
                  <CoverImage url={coverUrl} alt="" className="scale-110 opacity-60 blur-2xl" />
                )}
                {coverUrl ? (
                  <CoverImage url={coverUrl} alt={title} fit="natural" className={`relative ${nd ? 'grayscale' : ''}${n18 ? ' r18-blur' : ''}`} />
                ) : (
                  <CoverPlaceholder name={title} />
                )}
                {nd && <div className="pointer-events-none absolute inset-0 bg-slate-900/40" />}
                {nd && (
                  <span className="absolute left-2 top-2 z-[1] rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white/85 backdrop-blur">
                    未下载
                  </span>
                )}
                {n18 && (
                  <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center">
                    <button
                      title="点击查看封面（取消该游戏的模糊）"
                      aria-label="取消该游戏的封面模糊"
                      onClick={e => {
                        e.stopPropagation()
                        onToggleNsfw()
                      }}
                      className="pointer-events-auto cursor-pointer border-0 text-2xl font-black tracking-widest text-white/85 transition hover:scale-105 hover:bg-black/70"
                      style={{
                        fontFamily: "Arial, 'Helvetica Neue', sans-serif",
                        fontSize: '17px',
                        fontWeight: 800,
                        letterSpacing: '0.28em',
                        color: '#fff',
                        backgroundColor: 'rgba(0,0,0,0.55)',
                        padding: '4px 16px 4px 18px',
                        borderRadius: '8px',
                        boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
                      }}
                    >
                      NSFW
                    </button>
                  </div>
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent" />
                {v.status === 'scraping' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
                    <Spinner className="h-6 w-6" />
                  </div>
                )}
              </div>
              {/* 封面下方信息：评分一行；厂商 + 发售日一行（圆角标签，不同颜色区分） */}
              <div className="shrink-0 space-y-1.5 border-t border-white/[0.07] bg-white/[0.02] px-3 py-2.5 md:rounded-bl-2xl">
                {ratingDisplay && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="rounded-lg bg-amber-400/10 px-2 py-1 text-[11px] text-amber-300">
                      ★ {ratingDisplay}
                      {metadata?.votecount ? `（${metadata.votecount.toLocaleString()}票）` : ''}
                    </span>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {dev && (
                    <span
                      className="max-w-full truncate rounded-lg bg-indigo-500/10 px-2 py-1 text-[11px] text-indigo-300"
                      title={metadata?.developers?.length ? `刮削到：${metadata.developers.join(' / ')}` : undefined}
                    >
                      {dev}
                      {v.customDeveloper ? '（手动）' : ''}
                    </span>
                  )}
                  <span className="rounded-lg bg-white/[0.06] px-2 py-1 text-[11px] text-white/70">
                    发售 {formatRelease(metadata?.released)}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-4 pb-0 md:hidden">
              <div className="relative aspect-[3/4] w-28 shrink-0 overflow-hidden rounded-xl bg-ink-800">
                {coverUrl ? (
                  <CoverImage url={coverUrl} alt={title} className={`${nd ? 'grayscale' : ''}${n18 ? ' r18-blur' : ''}`} />
                ) : (
                  <CoverPlaceholder name={title} />
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent" />
                {n18 && (
                  <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center">
                    <button
                      title="点击查看封面（取消该游戏的模糊）"
                      aria-label="取消该游戏的封面模糊"
                      onClick={e => {
                        e.stopPropagation()
                        onToggleNsfw()
                      }}
                      className="pointer-events-auto cursor-pointer border-0 text-2xl font-black tracking-widest text-white/85 transition hover:scale-105 hover:bg-black/70"
                      style={{
                        fontFamily: "Arial, 'Helvetica Neue', sans-serif",
                        fontSize: '17px',
                        fontWeight: 800,
                        letterSpacing: '0.28em',
                        color: '#fff',
                        backgroundColor: 'rgba(0,0,0,0.55)',
                        padding: '4px 16px 4px 18px',
                        borderRadius: '8px',
                        boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
                      }}
                    >
                      NSFW
                    </button>
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-1.5">
                  <h2 className="text-base font-bold leading-snug text-white">{title}</h2>
                  {!nd && (
                    <button
                      onClick={() => onSetCompleted?.(v.pathHash, !completed)}
                      title={completed ? '标记为未通关' : '标记为已通关'}
                      className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
                        completed
                          ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300'
                          : 'border-white/15 bg-white/[0.04] text-white/45 hover:bg-white/[0.08] hover:text-white/80'
                      }`}
                    >
                      <Icon name="check" className="h-3 w-3" />
                      已通关
                    </button>
                  )}
                  {metadata?.source && (
                    <span className="mt-0.5 shrink-0 rounded-full border border-indigo-400/30 bg-indigo-500/15 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
                      {SOURCE_LABELS[metadata.source]}
                    </span>
                  )}
                  {nd && (
                    <span className="mt-0.5 shrink-0 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/60">
                      未下载
                    </span>
                  )}
                </div>
                {officialCnTitle && <p className="mt-1 text-xs text-emerald-300/90">官方中文标题：{officialCnTitle}</p>}
                {metadata?.originalTitle && metadata.originalTitle !== title && (
                  <p className="mt-0.5 text-xs text-white/40">{metadata.originalTitle}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">{infoChips}</div>
              </div>
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4 sm:p-5">
              <div className="hidden md:block">
                <div className="flex items-start gap-2">
                  <h2 className="text-xl font-bold leading-snug text-white">{title}</h2>
                  {!nd && (
                    <button
                      onClick={() => onSetCompleted?.(v.pathHash, !completed)}
                      title={completed ? '标记为未通关' : '标记为已通关'}
                      className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
                        completed
                          ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300'
                          : 'border-white/15 bg-white/[0.04] text-white/45 hover:bg-white/[0.08] hover:text-white/80'
                      }`}
                    >
                      <Icon name="check" className="h-3 w-3" />
                      已通关
                    </button>
                  )}
                  {metadata?.source && (
                    <span className="mt-0.5 shrink-0 rounded-full border border-indigo-400/30 bg-indigo-500/15 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
                      {SOURCE_LABELS[metadata.source]}
                    </span>
                  )}
                  {nd && (
                    <span className="mt-0.5 shrink-0 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/60">
                      未下载
                    </span>
                  )}
                </div>
                {officialCnTitle && <p className="mt-1 text-xs text-emerald-300/90">官方中文标题：{officialCnTitle}</p>}
                {metadata?.originalTitle && metadata.originalTitle !== title && (
                  <p className="mt-0.5 text-xs text-white/40">{metadata.originalTitle}</p>
                )}
                {duration && (
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-1 font-semibold text-emerald-300 [text-shadow:0_0_7px_rgba(52,211,153,0.6)]">
                      <ClockIcon className="h-3.5 w-3.5 shrink-0" />
                      <span>{duration}</span>
                      {v.playSessions ? <span> · {v.playSessions}次</span> : null}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-col">
                <h3 className="mb-1 flex shrink-0 items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-white/35">
                  简介
                  {metadata?.cnDescription && (
                    <span className="rounded bg-emerald-500/15 px-1 py-0.5 text-[9px] font-normal normal-case text-emerald-300">
                      中文
                    </span>
                  )}
                </h3>
                <div className="h-40 shrink-0 overflow-y-auto rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2">
                  {description ? (
                    <p className="whitespace-pre-line text-sm leading-relaxed text-white/65">{description}</p>
                  ) : (
                    <p className="text-sm text-white/30">暂无简介</p>
                  )}
                </div>
              </div>
              {(charLoading || (characters && characters.length > 0) || charLoaded) && (
                <div className="mt-auto min-h-0 shrink-0">
                  <div className="mb-1.5 flex items-center gap-2">
                    <h3 className="text-[11px] font-medium uppercase tracking-wider text-white/35">主要角色</h3>
                    {charLoading && <Spinner className="h-3 w-3" />}
                    <span className="text-[10px] text-white/25">声优</span>
                  </div>
                  {charLoading && !characters ? (
                    <p className="py-1 text-xs text-white/30">正在获取角色与声优…</p>
                  ) : characters && characters.length > 0 ? (
                    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                      {characters.map((c, i) => (
                        <div key={`${c.name}-${i}`} className="w-20 shrink-0">
                          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-ink-800">
                            {c.image ? <CoverImage url={c.image} alt={c.name} /> : <CoverPlaceholder name={c.name || '?'} />}
                          </div>
                          <p className="mt-1 truncate text-[11px] font-medium text-white/80" title={c.name}>
                            {c.name}
                          </p>
                          <p
                            className="truncate text-[10px] text-white/40"
                            title={c.cv ?? c.role ?? ''}
                          >
                            {c.cv ? `CV: ${c.cv}` : c.role ?? '—'}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="py-1 text-xs text-white/30">
                      未找到角色与声优数据（可在右上角「设置 → 角色 /声优」手动从指定数据源获取）
                    </p>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
        {manageOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4">
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setManageOpen(false)} />
            <div className="relative flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-900 shadow-2xl animate-scale-in">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] px-4 py-3">
                <h3 className="text-sm font-semibold text-white/85">设置</h3>
                <div className="flex items-center gap-2">
                  {!nd && (
                    <button
                      onClick={() => void doRescrape()}
                      disabled={rescrapeBusy || v.status === 'scraping'}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.07] px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/[0.12] hover:text-white disabled:opacity-50"
                    >
                      {rescrapeBusy || v.status === 'scraping' ? (
                        <>
                          <Spinner className="h-3 w-3" /> 获取中…
                        </>
                      ) : (
                        <>
                          <Icon name="refresh" className="h-3 w-3" /> 重新获取信息
                        </>
                      )}
                    </button>
                  )}
                  {metadata?.vndbUrl && (
                    <a
                      href={metadata.vndbUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.07] px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/[0.12] hover:text-white"
                    >
                      VNDB <Icon name="external" className="h-3 w-3" />
                    </a>
                  )}
                  <button
                    onClick={() => setManageOpen(false)}
                    aria-label="关闭设置"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.07] text-white/70 transition hover:bg-white/[0.12] hover:text-white"
                  >
                    <Icon name="x" className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex min-h-0 flex-1">
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <div className="grid gap-2.5 md:grid-cols-2">
                <div className="rounded-xl border border-indigo-400/20 bg-indigo-500/[0.06] px-3 py-2 text-xs text-white/60 md:col-span-2">
                  所有修改即时保存。
                </div>
              <div>
                <SectionRow
                  active={!collapsed.has('title')}
                  icon="book"
                  label="修改标题"
                  desc={v.customTitle ? '已自定义' : '官方中文标题优先'}
                  onClick={() => toggleSection('title')}
                />
                {!collapsed.has('title') && (
                  <div className="mt-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                    <div className="flex gap-1.5">
                      <input
                        value={titleInput ?? displayTitle(v)}
                        onChange={e => setTitleInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !titleBusy && void saveTitle()}
                        placeholder="显示标题（优先级高于官方中文标题）"
                        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-ink-800 px-2.5 py-1.5 text-xs text-white placeholder:text-white/25 focus:border-indigo-400/50 focus:outline-none"
                      />
                      <button
                        onClick={() => void saveTitle()}
                        disabled={titleBusy}
                        className="shrink-0 rounded-lg bg-indigo-500/90 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-400 disabled:opacity-50"
                      >
                        {titleBusy ? '保存中…' : '保存'}
                      </button>
                      {v.customTitle && (
                        <button
                          onClick={() => void handleSetTitle(v, '')}
                          className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-white/50 transition hover:text-white"
                        >
                          恢复自动
                        </button>
                      )}
                    </div>
                    <p className="mt-1.5 text-[10px] text-white/30">显示优先级：手动标题 &gt; 官方中文标题 &gt; 自动标题</p>
                  </div>
                )}
              </div>
              <div>
                <SectionRow
                  active={!collapsed.has('cover')}
                  icon="folder"
                  label="更换封面"
                  desc="自选 VNDB 封面或粘贴链接"
                  onClick={() => toggleSection('cover')}
                />
                {!collapsed.has('cover') && (
                  <div className="mt-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                    {coverLoading ? (
                      <div className="flex items-center justify-center gap-2 py-3 text-xs text-white/40">
                        <Spinner className="h-3.5 w-3.5" /> 正在加载封面列表…
                      </div>
                    ) : coverError ? (
                      <p className="py-1 text-xs text-red-300">{coverError}</p>
                    ) : metadata?.vndbId ? (
                      coverList === null ? (
                        <button
                          onClick={() => void loadCovers()}
                          className="w-full rounded-lg bg-indigo-500/15 px-3 py-2 text-xs font-medium text-indigo-200 transition hover:bg-indigo-500/25"
                        >
                          加载 VNDB 全部封面
                        </button>
                      ) : coverList.length === 0 ? (
                        <p className="py-1 text-xs text-white/35">该游戏没有其他封面</p>
                      ) : (
                        <div className="grid max-h-44 grid-cols-4 gap-2 overflow-y-auto">
                          {coverList.map((c, i) => {
                            const current = (v.customCover ?? coverUrl) === c.url || c.isCurrent === true
                            return (
                              <button
                                key={i}
                                onClick={() => void pickCover(c.url)}
                                className={`relative aspect-[3/4] overflow-hidden rounded-lg bg-ink-800 transition ${
                                  current ? 'ring-2 ring-emerald-400' : 'hover:ring-1 hover:ring-white/30'
                                }`}
                                title={`${c.released ?? ''} ${c.relTitle ?? ''}`}
                              >
                                <CoverImage url={c.url} alt={title} />
                                {current && (
                                  <span className="absolute left-1 top-1 rounded bg-emerald-500/90 px-1 py-0.5 text-[9px] text-white">
                                    当前
                                  </span>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      )
                    ) : (
                      <p className="py-1 text-xs text-white/35">
                        当前条目没有 VNDB 编号，可粘贴图片链接；或先在「修正条目」里匹配到 VNDB
                      </p>
                    )}
                    <div className="mt-2 flex gap-1.5">
                      <input
                        value={coverUrlInput}
                        onChange={e => setCoverUrlInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && void applyCoverUrl()}
                        placeholder="粘贴图片链接 http(s)://…"
                        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-ink-800 px-2.5 py-1.5 text-xs text-white placeholder:text-white/25 focus:border-indigo-400/50 focus:outline-none"
                      />
                      <button
                        onClick={() => void applyCoverUrl()}
                        className="shrink-0 rounded-lg bg-indigo-500/90 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-400"
                      >
                        应用
                      </button>
                      {v.customCover && (
                        <button
                          onClick={() => void pickCover(null)}
                          className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-white/50 transition hover:text-white"
                        >
                          恢复默认
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {!nd && (
                <div>
                  <SectionRow
                    active={!collapsed.has('fix')}
                    icon="search"
                    label="修正条目"
                    desc="匹配错误时从五个数据源重选"
                    onClick={() => toggleSection('fix')}
                  />
                  {!collapsed.has('fix') && (
                    <div className="mt-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <select
                          value={searchSource}
                          onChange={e => {
                            setSearchSource(e.target.value)
                            setFixCandidates(null)
                            setFixAllResults(null)
                          }}
                          className="rounded-lg border border-white/10 bg-ink-800 px-2 py-1.5 text-xs text-white focus:border-indigo-400/50 focus:outline-none"
                        >
                          <option value="all">全部数据源</option>
                          {CANDIDATE_SOURCES.map(s => (
                            <option key={s} value={s}>
                              {SOURCE_LABELS[s]}
                            </option>
                          ))}
                        </select>
                        <input
                          value={fixQuery}
                          onChange={e => setFixQuery(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && !fixBusy && doFixSearch()}
                          placeholder="输入准确的游戏名…"
                          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-ink-800 px-2.5 py-1.5 text-xs text-white placeholder:text-white/25 focus:border-indigo-400/50 focus:outline-none"
                        />
                        <button
                          onClick={doFixSearch}
                          disabled={fixBusy}
                          className="shrink-0 rounded-lg bg-indigo-500/90 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-400 disabled:opacity-50"
                        >
                          {fixBusy ? '搜索中…' : '搜索'}
                        </button>
                      </div>
                      {fixError && <p className="mb-2 mt-2 text-xs text-red-300">{fixError}</p>}
                      {fixBusy && (
                        <div className="flex items-center justify-center gap-2 py-3 text-xs text-white/40">
                          <Spinner className="h-3.5 w-3.5" /> 正在搜索数据源…
                        </div>
                      )}
                      {!fixBusy && searchSource === 'all' && fixAllResults !== null && (fixAllResults.every(g => g.candidates.length === 0) ? (
                        <p className="py-2 text-center text-xs text-white/30">五个数据源都未找到结果，换个关键词试试</p>
                      ) : (
                        <div className="max-h-44 space-y-2 overflow-y-auto">
                          {fixAllResults.map(g =>
                            g.candidates.length === 0 ? null : (
                              <div key={g.source}>
                                <p className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-white/40">
                                  {SOURCE_LABELS[g.source]}
                                  <span className="text-white/25">({g.candidates.length})</span>
                                </p>
                                <div className="space-y-1.5">
                                  {g.candidates.map(c => (
                                    <SearchCandidateRow
                                      key={`${c.source}-${c.id}`}
                                      c={c}
                                      applying={applyingId}
                                      onApply={c => void applyCandidate(c)}
                                    />
                                  ))}
                                </div>
                              </div>
                            ),
                          )}
                          {fixAllResults.some(g => g.timedOut) && (
                            <p className="text-[10px] text-amber-300/60">
                              部分数据源（VNDB/Bangumi）响应超时未返回，可单独切换该源重试
                            </p>
                          )}
                        </div>
                      ))}
                      {!fixBusy && searchSource !== 'all' && fixCandidates !== null && (fixCandidates.length === 0 ? (
                        <p className="py-2 text-center text-xs text-white/30">未找到结果，换个关键词或数据源试试</p>
                      ) : (
                        <div className="max-h-44 space-y-1.5 overflow-y-auto">
                          {fixCandidates.map(c => (
                            <SearchCandidateRow
                              key={`${c.source}-${c.id}`}
                              c={c}
                              applying={applyingId}
                              onApply={c => void applyCandidate(c)}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {!nd && (
                <div>
                  <SectionRow
                    active={!collapsed.has('exe')}
                    icon="play"
                    label="启动程序"
                    desc={
                      exeFileName
                        ? `当前：${exeFileName}`
                        : exeCandidates.length > 0
                          ? `${exeCandidates.length} 个候选，未选择`
                          : '未找到 exe'
                    }
                    onClick={() => toggleSection('exe')}
                  />
                  {!collapsed.has('exe') && (
                    <div className="mt-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                      {v.folderPath ? (
                        exeLoading ? (
                          <div className="flex items-center justify-center gap-2 py-3 text-xs text-white/40">
                            <Spinner className="h-3.5 w-3.5" /> 正在扫描可执行文件…
                          </div>
                        ) : exeError ? (
                          <p className="py-1 text-xs text-red-300">{exeError}</p>
                        ) : exeList === null ? (
                          <button
                            onClick={() => void scanExes()}
                            className="w-full rounded-lg bg-indigo-500/15 px-3 py-2 text-xs font-medium text-indigo-200 transition hover:bg-indigo-500/25"
                          >
                            浏览文件夹内的可执行文件…
                          </button>
                        ) : exeList.length === 0 ? (
                          <p className="py-1 text-xs text-white/35">未找到任何 .exe/.bat/.cmd 文件</p>
                        ) : (
                          <div className="max-h-44 space-y-1 overflow-y-auto">
                            {exeList.map(e => (
                              <button
                                key={e.path}
                                onClick={() => void pickExe(e.path)}
                                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-emerald-500/10 ${
                                  currentExe === e.path ? 'bg-emerald-500/15 text-emerald-200' : 'text-white/70'
                                }`}
                              >
                                <Icon name="play" className="h-3 w-3 shrink-0" />
                                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                                <span className="shrink-0 truncate text-[10px] text-white/30">{e.rel ?? ''}</span>
                                {currentExe === e.path && <span className="text-[10px] text-emerald-300">当前</span>}
                              </button>
                            ))}
                          </div>
                        )
                      ) : (
                        <p className="py-1 text-xs text-amber-300/70">路径未知，请先重新扫描获取真实路径</p>
                      )}
                      <p className="mt-1.5 text-[10px] text-white/30">手动选择后会自动记住，重新扫描也保持</p>
                    </div>
                  )}
                </div>
              )}
              <div>
                <SectionRow
                  active={!collapsed.has('dev')}
                  icon="gamepad"
                  label="厂商 /制作组"
                  desc={
                    v.customDeveloper
                      ? `已手动指定：${v.customDeveloper}`
                      : dev || '未识别到厂商（可手动指定用于左侧分组）'
                  }
                  onClick={() => toggleSection('dev')}
                />
                {!collapsed.has('dev') && (
                  <div className="mt-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                    <div className="flex gap-1.5">
                      <input
                        value={devInput ?? devName(v) ?? ''}
                        onChange={e => setDevInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !devBusy && void saveDev()}
                        placeholder="例如：柚子社 / Key / TYPE-MOON"
                        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-ink-800 px-2.5 py-1.5 text-xs text-white placeholder:text-white/25 focus:border-indigo-400/50 focus:outline-none"
                      />
                      <button
                        onClick={() => void saveDev()}
                        disabled={devBusy}
                        className="shrink-0 rounded-lg bg-indigo-500/90 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-400 disabled:opacity-50"
                      >
                        {devBusy ? '保存中…' : '保存'}
                      </button>
                      {v.customDeveloper && (
                        <button
                          onClick={() => void handleSetDev(v, '')}
                          className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-white/50 transition hover:text-white"
                        >
                          恢复自动
                        </button>
                      )}
                    </div>
                    <p className="mt-1.5 text-[10px] text-white/30">
                      设置后按此厂商归入左侧分类；留空则用刮削到的厂商
                    </p>
                  </div>
                )}
              </div>
              {!nd && (
                <div>
                  <SectionRow
                    active={!collapsed.has('path')}
                    icon="folder"
                    label="修改路径"
                    desc="游戏文件夹被移动或改名后，重新定位"
                    onClick={() => {
                      setPathInp(v.folderPath)
                      toggleSection('path')
                    }}
                  />
                  {!collapsed.has('path') && (
                    <div className="mt-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                      <div className="flex gap-1.5">
                        <input
                          value={pathInp}
                          onChange={e => setPathInp(e.target.value)}
                          placeholder="输入游戏文件夹的完整路径，如 E:/galgame/xxx"
                          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-ink-800 px-2.5 py-1.5 text-xs text-white placeholder:text-white/25 focus:border-indigo-400/50 focus:outline-none"
                        />
                        <button
                          onClick={() => void doRelocate()}
                          disabled={pathBusy}
                          className="shrink-0 rounded-lg bg-indigo-500/90 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-400 disabled:opacity-50"
                        >
                          {pathBusy ? '验证中…' : '验证并应用'}
                        </button>
                      </div>
                      {pathMsg && <p className="mt-1.5 text-[10px] text-white/60">{pathMsg}</p>}
                    </div>
                  )}
                </div>
              )}
              {!nd && (
                <div>
                  <SectionRow
                    active={!collapsed.has('char')}
                    icon="info"
                    label="角色 /声优"
                    desc={
                      characters && characters.length > 0
                        ? `已获取 ${characters.length} 个角色`
                        : '自动匹配失败时，手动从指定数据源获取'
                    }
                    onClick={() => toggleSection('char')}
                  />
                  {!collapsed.has('char') && (
                    <div className="mt-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <select
                          value={charSource}
                          onChange={e => setCharSource(e.target.value)}
                          className="rounded-lg border border-white/10 bg-ink-800 px-2 py-1.5 text-xs text-white focus:border-indigo-400/50 focus:outline-none"
                        >
                          <option value="bangumi">Bangumi</option>
                          <option value="vndb">VNDB</option>
                          <option value="ymgal">YMgal</option>
                          <option value="cngal">CnGal</option>
                        </select>
                        <input
                          value={charQuery}
                          onChange={e => setCharQuery(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && !charBusy && void fetchCharacters()}
                          placeholder="输入准确的游戏名…"
                          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-ink-800 px-2.5 py-1.5 text-xs text-white placeholder:text-white/25 focus:border-indigo-400/50 focus:outline-none"
                        />
                        <button
                          onClick={() => void fetchCharacters()}
                          disabled={charBusy}
                          className="shrink-0 rounded-lg bg-indigo-500/90 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-400 disabled:opacity-50"
                        >
                          {charBusy ? '获取中…' : '获取'}
                        </button>
                      </div>
                      {charError && <p className="mt-1.5 text-[10px] text-red-300">{charError}</p>}
                      {charMsg && <p className="mt-1.5 text-[10px] text-emerald-300">{charMsg}</p>}
                      <p className="mt-1.5 text-[10px] text-white/30">
                        自动匹配不到时，选一个数据源手动获取；成功后立即显示并记住
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
          </div>
        </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 目录选择器
// ---------------------------------------------------------------------------

function DirPicker({
  open,
  onClose,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  onSelect: (path: string) => void
}) {
  const [drives, setDrives] = useState<string[]>([])
  const [current, setCurrent] = useState<string | null>(null)
  const [parent, setParent] = useState<string | null>(null)
  const [dirs, setDirs] = useState<DirItem[]>([])
  const [fileCount, setFileCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [pathInput, setPathInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const navigate = useCallback(async (path: string) => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(`/api/list-dir?path=${encodeURIComponent(path)}`)
      const json = await resp.json()
      if (json.ok) {
        setCurrent(json.current)
        setParent(json.parent)
        setDirs(json.dirs)
        setFileCount(json.fileCount)
        setPathInput(json.current)
      } else {
        setError(json.error ?? '无法读取该目录')
      }
    } catch (e) {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setCurrent(null)
      setParent(null)
      setDirs([])
      setError(null)
      fetch('/api/drives')
        .then(r => r.json())
        .then(json => setDrives(json.drives ?? []))
        .catch(() => setDrives(['C:\\']))
    }
  }, [open])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!open) return null

  const jump = () => {
    const path = pathInput.trim()
    if (path) void navigate(path)
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-900 shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <h2 className="text-sm font-bold text-white">选择游戏根目录</h2>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-full text-white/60 transition hover:bg-white/[0.06] hover:text-white"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
          <input
            value={pathInput}
            onChange={e => setPathInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && jump()}
            placeholder="输入或粘贴路径，回车跳转"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-white placeholder:text-white/25 focus:border-indigo-400/50 focus:outline-none"
          />
          <button
            onClick={jump}
            className="shrink-0 rounded-lg bg-indigo-500/90 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-400"
          >
            跳转
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {error && (
            <div className="m-2 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}
          {!current && (
            <div className="p-2">
              <p className="mb-2 px-1 text-[11px] text-white/40">磁盘</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {drives.map(d => (
                  <button
                    key={d}
                    onClick={() => void navigate(d)}
                    className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left text-sm text-white/80 transition hover:border-indigo-400/40 hover:bg-white/[0.06]"
                  >
                    <Icon name="drive" className="h-4 w-4 shrink-0 text-indigo-300" />
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}
          {current && (
            <div className="p-1">
              <div className="mb-1.5 flex items-center gap-1.5 px-1">
                {parent && (
                  <button
                    onClick={() => void navigate(parent)}
                    title="上一级"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-white/70 transition hover:bg-white/[0.1]"
                  >
                    <Icon name="up" className="h-4 w-4" />
                  </button>
                )}
                <span className="min-w-0 flex-1 truncate text-[11px] text-white/40" title={current}>
                  {current}
                </span>
                <span className="shrink-0 text-[10px] text-white/25">{fileCount} 个文件</span>
              </div>
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-white/40">
                  <Spinner className="h-4 w-4" /> 加载中…
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {dirs.map(d => (
                    <button
                      key={d.path}
                      onClick={() => void navigate(d.path)}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-white/75 transition hover:bg-white/[0.06]"
                    >
                      <Icon name="folder" className="h-3.5 w-3.5 shrink-0 text-indigo-300/80" />
                      <span className="truncate">{d.name}</span>
                    </button>
                  ))}
                  {dirs.length === 0 && (
                    <p className="col-span-full px-1 py-4 text-center text-xs text-white/30">
                      （空目录 / 无子文件夹）
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 px-3.5 py-1.5 text-xs font-medium text-white/70 transition hover:bg-white/[0.06]"
          >
            取消
          </button>
          <button
            onClick={() => current && onSelect(current)}
            disabled={!current || loading}
            className="rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:from-emerald-400 hover:to-emerald-500 disabled:opacity-50"
          >
            选择此目录
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 设置面板
// ---------------------------------------------------------------------------

function SettingsModal({
  open,
  onClose,
  settings,
  onSaveRootPath,
  games,
  favHashes,
  onNsfwBlurChange,
}: {
  open: boolean
  onClose: () => void
  settings: AppSettings
  onSaveRootPath: (path: string) => Promise<boolean>
  games: Game[]
  favHashes: string[]
  onNsfwBlurChange?: () => void
}) {
  const { push } = useToast()
  const [cacheInfo, setCacheInfo] = useState<{ count: number } | null>(null)
  const [cacheClearing, setCacheClearing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [rootInput, setRootInput] = useState('')
  const [rootSaving, setRootSaving] = useState(false)
  const [pickerTarget, setPickerTarget] = useState<string | null>(null)
  const [networkInfo, setNetworkInfo] = useState<{ ips: string[]; port: string } | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [storageInfo, setStorageInfo] = useState<{ dataPath: string; defaultPath: string } | null>(null)
  const [dataPathInput, setDataPathInput] = useState('')
  const [migrating, setMigrating] = useState(false)
  const [uiScale, setUiScale] = useState(100)
  const [proxyInput, setProxyInput] = useState('')
  const [proxyTesting, setProxyTesting] = useState(false)
  const [proxyMsg, setProxyMsg] = useState<string | null>(null)
  const [, setNsfwTick] = useState(0)

  const copyText = async (text: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        push('地址已复制', 'success')
        return
      }
    } catch (e) {}
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      push('地址已复制', 'success')
    } catch (e) {
      push('复制失败，请长按地址手动复制', 'error')
    }
  }

  useEffect(() => {
    setUiScale(parseInt(localStorage.getItem('gl-ui-scale') ?? '100', 10) || 100)
    setProxyInput(settings?.proxy ?? '')
  }, [settings])

  const setScale = (v: number) => {
    localStorage.setItem('gl-ui-scale', String(v))
    document.documentElement.style.fontSize = v + '%'
    setUiScale(v)
    push(`界面缩放已设为 ${v}%（4K 屏建议 125% 以上）`, 'success')
  }

  const saveProxy = async () => {
    const value = proxyInput.trim() || 'http://127.0.0.1:7890'
    if (value && !/^https?:\/\//i.test(value)) {
      push('代理地址需以 http:// 或 https:// 开头', 'error')
      return
    }
    try {
      const resp = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxy: value }),
      })
      const json = await resp.json()
      if (json.ok) {
        setProxyInput(value)
        push(`代理已保存（${value}），刮削/搜索/封面请求将走代理`, 'success')
      } else push(json.error ?? '保存失败', 'error')
    } catch (e) {
      push('保存失败：网络错误', 'error')
    }
  }

  const testProxy = async () => {
    setProxyTesting(true)
    setProxyMsg(null)
    try {
      const resp = await fetch('/api/proxy-test')
      const json = await resp.json()
      if (json.configured) {
        if (json.ok) {
          const names = (json.results ?? [])
            .filter((r: { ok?: boolean }) => r.ok)
            .map((r: { name: string; ms: number }) => `${r.name} ${(r.ms / 1000).toFixed(1)}s`)
            .join('、')
          setProxyMsg(`✅ 代理可用：${names}`)
        } else {
          const names = (json.results ?? []).map((r: { name: string }) => r.name).join('、')
          setProxyMsg(`❌ 无法通过代理访问（${names}），请检查代理地址或节点是否可用`)
        }
      } else setProxyMsg('还没填代理地址，先输入并保存')
    } catch (e) {
      setProxyMsg('❌ 测试失败：网络错误')
    }
    setProxyTesting(false)
  }

  useEffect(() => {
    if (open) {
      setNetworkInfo(null)
      setQrDataUrl(null)
      fetch('/api/network')
        .then(r => r.json())
        .then(json => {
          setNetworkInfo({ ips: json.ips ?? [], port: String(json.port ?? 3000) })
          const ip = json.ips?.[0]
          if (ip) {
            try {
              const qr = QRCode(0, 'M')
              qr.addData(`http://${ip}:${json.port ?? 3000}`)
              qr.make()
              setQrDataUrl(qr.createDataURL(8, 4))
            } catch (e) {}
          }
        })
        .catch(() => setNetworkInfo({ ips: [], port: '3000' }))
    }
  }, [open])

  useEffect(() => {
    if (open) {
      setCacheInfo(null)
      // [任务四] 打开设置时不预填上次的扫描路径，输入框留空、placeholder 提示当前值
      setRootInput('')
      setDataPathInput('')
      fetch('/api/cache')
        .then(r => r.json())
        .then(json => setCacheInfo({ count: json.count ?? 0 }))
        .catch(() => setCacheInfo({ count: 0 }))
      fetch('/api/storage')
        .then(r => r.json())
        .then(json => {
          if (json.ok) {
            setStorageInfo({ dataPath: json.dataPath ?? '', defaultPath: json.defaultPath ?? '' })
            setDataPathInput(json.dataPath ?? '')
          }
        })
        .catch(() => {})
    }
  }, [open, settings])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!open) return null

  const saveRoot = async (input: string) => {
    // [任务四] 输入留空时沿用当前已保存的根目录，不清空；两者都为空才报错
    const value = input.trim() || settings?.rootPath?.trim()
    if (!value) {
      push('请输入根目录路径', 'error')
      return
    }
    setRootSaving(true)
    const ok = await onSaveRootPath(value)
    setRootSaving(false)
    if (ok) setRootInput(value)
  }

  const migrateData = async (input: string) => {
    const value = input.trim()
    if (!value) {
      push('请输入数据目录路径', 'error')
      return
    }
    setMigrating(true)
    try {
      const resp = await fetch('/api/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: value }),
      })
      const json = await resp.json()
      if (json.ok) {
        setStorageInfo({ dataPath: json.dataPath ?? value, defaultPath: json.defaultPath ?? '' })
        setDataPathInput(json.dataPath ?? value)
        push('数据已迁移到新位置，请重启启动器生效', 'success')
      } else push(json.error ?? '更改失败', 'error')
    } catch (e) {
      push('更改失败：网络错误', 'error')
    }
    setMigrating(false)
  }

  const clearCache = async () => {
    if (window.confirm('确定清空全部刮削缓存？下次扫描将重新请求网络。')) {
      setCacheClearing(true)
      try {
        const resp = await fetch('/api/cache', { method: 'DELETE' })
        const json = await resp.json()
        if (json.ok) {
          push('缓存已清空', 'success')
          setCacheInfo({ count: 0 })
        } else push('清空失败，请重试', 'error')
      } catch (e) {
        push('清空失败：网络错误', 'error')
      }
      setCacheClearing(false)
    }
  }

  // ---- [1.5.0] 数据导出/导入 ----
  const exportBackup = async () => {
    setExporting(true)
    try {
      const resp = await fetch('/api/backup?action=export')
      if (!resp.ok) {
        const json = await resp.json().catch(() => null)
        push(json?.error ?? '导出失败，请重试', 'error')
        return
      }
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const cd = resp.headers.get('content-disposition') ?? ''
      const m = cd.match(/filename="?([^";]+)"?/)
      a.href = url
      a.download = m ? m[1] : `moeshelf-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      push('资料库已导出', 'success')
    } catch (e) {
      push('导出失败：网络错误', 'error')
    }
    setExporting(false)
  }

  const importBackup = async (file: File) => {
    setImporting(true)
    try {
      const text = await file.text()
      const resp = await fetch('/api/backup?action=import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: text,
      })
      const json = await resp.json()
      if (json.ok) {
        push(`导入成功：${json.games} 个游戏`, 'success')
        setTimeout(() => window.location.reload(), 1200)
      } else push(json.error ?? '导入失败，请检查文件格式', 'error')
    } catch (e) {
      push('导入失败：文件读取错误', 'error')
    }
    setImporting(false)
  }

  const exportCsv = () => {
    try {
      const rows = games.map(g => ({
        title: displayTitle(g),
        developer: devName(g) || '',
        released: g.metadata?.released || '',
        rating: g.metadata?.rating ? (g.metadata.rating / 10).toFixed(1) : '',
        completed: g.completed === true,
        favorite: favHashes.includes(g.pathHash),
        downloaded: !g.notDownloaded,
        path: g.folderPath || '',
      }))
      const csv = buildCsv(rows)
      downloadCsv(`moeshelf-${new Date().toISOString().slice(0, 10)}.csv`, csv)
      push(`已导出 ${rows.length} 个游戏到 CSV`, 'success')
    } catch (e) {
      push('导出 CSV 失败', 'error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-ink-900 p-6 shadow-2xl animate-scale-in">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">设置</h2>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition hover:bg-white/[0.06] hover:text-white"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4">
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
            <div className="mb-2 text-sm text-white/70">游戏根目录</div>
            <div className="flex gap-2">
              <input
                value={rootInput}
                onChange={e => setRootInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !rootSaving && void saveRoot(rootInput)}
                placeholder={settings?.rootPath ? `当前：${settings.rootPath}（输入新路径或点浏览重新选择）` : '例如：D:\\Galgames'}
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-xs text-white placeholder:text-white/25 focus:border-indigo-400/50 focus:outline-none"
              />
              <button
                onClick={() => setPickerTarget('root')}
                title="浏览目录"
                className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70 transition hover:bg-white/[0.06]"
              >
                浏览…
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-[11px] leading-relaxed text-white/35">
                启动器将扫描该目录下的一级子文件夹作为游戏，保存后自动开始扫描。
              </p>
              <button
                onClick={() => !rootSaving && void saveRoot(rootInput)}
                disabled={rootSaving}
                className="shrink-0 rounded-lg bg-indigo-500/90 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-400 disabled:opacity-60"
              >
                {rootSaving ? '保存中…' : '保存并扫描'}
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
            <div className="mb-2 text-sm text-white/70">数据存储位置</div>
            <p className="mb-2 text-[11px] leading-relaxed text-white/35">
              所有数据（游戏列表 / 刮削缓存 / 游玩时长 / 封面图片 / 设置）都保存在这里，换路径时自动迁移现有数据。
            </p>
            <div className="flex gap-2">
              <input
                value={dataPathInput}
                onChange={e => setDataPathInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !migrating && void migrateData(dataPathInput)}
                placeholder="例如：D:\GalgameData"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-xs text-white placeholder:text-white/25 focus:border-indigo-400/50 focus:outline-none"
              />
              <button
                onClick={() => setPickerTarget('data')}
                title="浏览目录"
                className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70 transition hover:bg-white/[0.06]"
              >
                浏览…
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 flex-1 truncate text-[11px] text-white/30">
                当前：
                {storageInfo?.dataPath ?? '…'}
                {storageInfo && storageInfo.dataPath !== storageInfo.defaultPath ? '（自定义）' : '（默认，启动器目录下）'}
              </p>
              <button
                onClick={() => !migrating && void migrateData(dataPathInput)}
                disabled={migrating || dataPathInput === storageInfo?.dataPath}
                className="shrink-0 rounded-lg bg-indigo-500/90 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-400 disabled:opacity-60"
              >
                {migrating ? '迁移中…' : '更改并迁移'}
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-amber-300/70">更改后需重启启动器生效；迁移只复制不删除旧数据。</p>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
            <div className="mb-2 text-sm text-white/70">NSFW 封面模糊</div>
            <button
              onClick={() => {
                nsfwBlur = !nsfwBlur
                try {
                  localStorage.setItem('gl-nsfw-blur', nsfwBlur ? '1' : '0')
                } catch (e) {}
                setNsfwTick(t => t + 1)
                onNsfwBlurChange?.()
              }}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-xs transition ${
                nsfwBlur
                  ? 'border-indigo-400/60 bg-indigo-500/15 text-white'
                  : 'border-white/10 bg-white/[0.03] text-white/60'
              }`}
            >
              <span>R18 封面自动高斯模糊并显示 NSFW 角标</span>
              <span className="font-medium">{nsfwBlur ? '已开启' : '已关闭'}</span>
            </button>
            <p className="mt-2 text-[11px] leading-relaxed text-white/40">
              按封面图本身判断（VNDB 图片分级）；关闭后恢复显示。
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
            <div className="mb-2 text-sm text-white/70">界面缩放</div>
            <div className="grid grid-cols-4 gap-2">
              {[100, 112, 125, 150].map(v => (
                <button
                  key={v}
                  onClick={() => setScale(v)}
                  className={`rounded-lg border py-2 text-sm font-medium transition ${
                    uiScale === v
                      ? 'border-indigo-400/60 bg-indigo-500/15 text-white'
                      : 'border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06]'
                  }`}
                >
                  {v}%
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-white/35">高 DPI 屏建议调到 125% 以上。</p>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
            <div className="mb-2 text-sm text-white/70">代理服务器（可选）</div>
            <div className="flex gap-2">
              <input
                value={proxyInput}
                onChange={e => setProxyInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && void saveProxy()}
                placeholder="本地代理 http://127.0.0.1:7890（Clash / V2Ray 默认端口）"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-xs text-white placeholder:text-white/25 focus:border-indigo-400/50 focus:outline-none"
              />
              <button
                onClick={() => void saveProxy()}
                className="shrink-0 rounded-lg bg-indigo-500/90 px-3 py-2 text-xs font-medium text-white transition hover:bg-indigo-400"
              >
                保存
              </button>
              <button
                onClick={() => void testProxy()}
                disabled={proxyTesting}
                className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-white/75 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
              >
                {proxyTesting ? '测试中…' : '测试连接'}
              </button>
            </div>
            {proxyMsg && <p className="mt-2 text-[11px] leading-relaxed text-white/55">{proxyMsg}</p>}
            <p className="mt-2 text-[11px] leading-relaxed text-white/35">
              VNDB / Bangumi 服务器在境外，国内直连慢或不稳定；配置本地代理后，刮削、搜索、封面全部走代理。留空则直连。
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
            <div className="mb-2 text-sm text-white/70">局域网访问</div>
            {networkInfo ? (
              <div className="space-y-2">
                {networkInfo.ips.map(ip => {
                  const url = `http://${ip}:${networkInfo.port}`
                  return (
                    <div key={ip} className="flex items-center gap-2">
                      <code className="min-w-0 flex-1 truncate rounded-lg bg-black/40 px-2 py-1.5 text-xs text-indigo-200">
                        {url}
                      </code>
                      <button
                        onClick={() => copyText(url)}
                        className="shrink-0 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-medium text-white/75 transition hover:bg-white/[0.06] hover:text-white"
                      >
                        复制
                      </button>
                    </div>
                  )
                })}
                {qrDataUrl && networkInfo.ips.length > 0 && (
                  <div className="flex items-center gap-3 pt-1">
                    <img src={qrDataUrl} alt="手机扫码访问" className="h-24 w-24 shrink-0 rounded-lg bg-white p-1" />
                    <div className="text-[11px] leading-relaxed text-white/40">
                      同一局域网下，扫扫描二维码（或浏览器输入上方地址）
                      <br />
                      无法连接时：右键「开启局域网访问.bat」以管理员身份运行一次
                      <br />
                      其他设备仅支持添加查看，启动游戏仍在电脑上执行
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-white/35">正在获取本机网络地址…</p>
            )}
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/70">刮削缓存条目</span>
              <span className="font-semibold text-white tabular-nums">{cacheInfo === null ? '…' : cacheInfo.count}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-white/35">
              元数据缓存在服务端 <code className="rounded bg-black/40 px-1 py-0.5">data/cache.json</code>
              ，下次扫描会先命中缓存，避免重复请求网络。
            </p>
            <button
              onClick={clearCache}
              disabled={cacheClearing || (cacheInfo?.count ?? 0) === 0}
              className="mt-3 w-full rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
            >
              {cacheClearing ? '正在清空…' : '清空全部刮削缓存'}
            </button>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
            <div className="mb-2 text-sm text-white/70">数据备份与导出</div>
            <p className="mb-2 text-[11px] leading-relaxed text-white/35">
              每次保存时自动备份到 <code className="rounded bg-black/40 px-1 py-0.5">data/backup</code>
              （保留最近 5 份）；也可手动导出完整资料库或 CSV 列表。
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void exportBackup()}
                disabled={exporting}
                className="shrink-0 rounded-lg bg-indigo-500/90 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-400 disabled:opacity-50"
              >
                {exporting ? '导出中…' : '导出资料'}
              </button>
              <label
                className={`shrink-0 cursor-pointer rounded-lg bg-indigo-500/90 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-400 ${
                  importing ? 'pointer-events-none opacity-50' : ''
                }`}
              >
                {importing ? '导入中…' : '导入资料'}
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) void importBackup(f)
                    e.target.value = ''
                  }}
                />
              </label>
              <button
                onClick={exportCsv}
                className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white/75 transition hover:bg-white/[0.06] hover:text-white"
              >
                导出 CSV
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4 text-xs leading-relaxed text-white/40">
            <p className="mb-1 font-medium text-white/60">说明</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>刮削数据源：VNDB → Bangumi → YMgal → CnGal，按相似度匹配防错配。</li>
              <li>「启动」会直接运行游戏 exe（游戏本体不经过浏览器）。</li>
              <li>本工具仅在你的电脑上运行，不上传任何文件。</li>
            </ul>
          </div>
        </div>
      </div>
      <DirPicker
        open={pickerTarget !== null}
        onClose={() => setPickerTarget(null)}
        onSelect={path => {
          setPickerTarget(null)
          if (pickerTarget === 'data') void migrateData(path)
          else void saveRoot(path)
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// 空状态 / 进度条 / 筛选标签
// ---------------------------------------------------------------------------

function EmptyState({ onOpenSettings, scanning }: { onOpenSettings: () => void; scanning: boolean }) {
  return (
    <div className="flex min-h-[65vh] flex-col items-center justify-center text-center">
      <div className="relative">
        <div className="flex h-24 w-24 items-center justify-center rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-500/20 to-indigo-600/20 backdrop-blur">
          <Icon name="play" className="h-12 w-12 fill-emerald-300 text-emerald-300" />
        </div>
        <div className="absolute -inset-6 -z-10 rounded-full bg-emerald-500/15 blur-3xl" />
      </div>
      <h2 className="mt-8 text-2xl font-bold text-white">一个简单好用的 Galgame 启动器</h2>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-white/50">
        配置你的游戏根目录，应用会自动识别其中的游戏， 自动从 VNDB / Bangumi / YMgal / CnGal 刮削封面与信息，
        点一下就能启动游戏。
      </p>
      <button
        onClick={onOpenSettings}
        disabled={scanning}
        className="mt-8 inline-flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-indigo-600 px-7 py-3.5 text-base font-semibold text-white shadow-xl shadow-emerald-500/25 transition hover:brightness-110 disabled:opacity-60"
      >
        <Icon name="folder" className="h-5 w-5" />
        {scanning ? '正在扫描…' : '配置游戏根目录'}
      </button>
      <p className="mt-6 max-w-sm text-xs leading-relaxed text-white/30">
        需要 Chrome / Edge 浏览器，并确保 Node.js 服务正在本机运行
        <br />
        游戏本体与文件不会被上传或修改
      </p>
    </div>
  )
}

function ProgressToast({ done, total }: { done: number; total: number }) {
  const percent = total ? Math.round((done / total) * 100) : 0
  return (
    <div className="fixed bottom-5 left-1/2 z-40 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-white/10 bg-ink-900/95 px-4 py-3 shadow-2xl backdrop-blur animate-slide-up">
      <div className="flex items-center justify-between text-xs text-white/70">
        <span className="flex items-center gap-2">
          <Spinner className="h-3.5 w-3.5" /> 正在获取游戏信息…
        </span>
        <span className="tabular-nums">
          {done} / {total} · {percent}%
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs transition ${
        active
          ? 'bg-indigo-500/20 font-medium text-indigo-200'
          : 'border border-white/10 text-white/55 hover:bg-white/[0.06] hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// useLibrary —— 数据获取与状态管理（编译产物 J() 内部 IIFE 的完整逻辑）
// ---------------------------------------------------------------------------

function mergeGameSettings(
  game: Game,
  exeMap: Record<string, string>,
  coverMap: Record<string, string>,
  titleMap: Record<string, string>,
  devMap: Record<string, string>,
): Game {
  return {
    ...game,
    selectedExe: exeMap[game.pathHash],
    customCover: coverMap[game.pathHash],
    customTitle: titleMap[game.pathHash],
    customDeveloper: devMap[game.pathHash],
    metadata: null,
    status: 'pending',
  }
}

function useLibrary() {
  const { push } = useToast()
  const [games, setGames] = useState<Game[]>([])
  const [settings, setSettings] = useState<AppSettings>(null)
  const [filterMode, setFilterModeState] = useState('strict')
  const [search, setSearch] = useState('')
  const [selectedHash, setSelectedHash] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scraping, setScraping] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  const queueRef = useRef<Game[]>([])
  const drainingRef = useRef(false)
  const ignorePathsRef = useRef<string[] | null>(null)

  const rootName = useMemo(() => {
    if (!settings?.rootPath) return null
    const parts = settings.rootPath.replace(/[\\/]+$/, '').split(/[\\/]/)
    return parts[parts.length - 1] || settings.rootPath
  }, [settings])

  const selectedGame = useMemo(
    () => games.find(g => g.pathHash === selectedHash) ?? null,
    [games, selectedHash],
  )

  const patchGame = useCallback((pathHash: string, patch: Partial<Game>) => {
    setGames(prev => prev.map(g => (g.pathHash === pathHash ? { ...g, ...patch } : g)))
  }, [])

  const scrapeGame = useCallback(
    async (game: Game, force: boolean, notify = true): Promise<string | null> => {
      patchGame(game.pathHash, { status: 'scraping' })
      const params = new URLSearchParams({
        name: game.folderName,
        folder: game.folderName,
        hash: game.pathHash,
        folderPath: game.folderPath || '',
      })
      if (force) params.set('force', '1')
      try {
        const resp = await fetch(`/api/scrape?${params.toString()}`)
        const json = await resp.json().catch(() => null)
        if (!json) throw Error('响应解析失败')
        if (json.proxyFallback && notify) toastProxyFallback(push)
        if (json.ok && json.success !== false && json.data) {
          patchGame(game.pathHash, { metadata: json.data, status: 'done', error: undefined })
          return null
        }
        const msg = json.error ?? (json.success === false ? '所有数据源均未返回结果' : '获取失败')
        // 只更新状态和错误提示，不清空已有 metadata，避免断网时把旧信息抹掉
        patchGame(game.pathHash, { status: 'error', error: msg })
        return msg
      } catch (e) {
        const msg = '网络请求失败：' + (e instanceof Error ? e.message : String(e))
        patchGame(game.pathHash, { status: 'error', error: msg })
        return msg
      }
    },
    [patchGame, push],
  )

  const enqueueScrape = useCallback(
    async (batch: Game[]) => {
      queueRef.current.push(...batch)
      setProgress(prev => ({ ...prev, total: prev.total + batch.length }))
      if (drainingRef.current) return
      drainingRef.current = true
      setScraping(true)
      let success = 0
      let failed = 0
      const worker = async () => {
        while (queueRef.current.length > 0) {
          const game = queueRef.current.shift()!
          const err = await scrapeGame(game, false, false)
          if (err == null) success++
          else failed++
          setProgress(prev => ({ ...prev, done: prev.done + 1 }))
        }
      }
      await Promise.all(Array.from({ length: Math.min(2, batch.length) }, worker))
      drainingRef.current = false
      setScraping(false)
      if (failed > 0)
        push(`信息获取完成：${success} 个成功，${failed} 个失败（可点卡片重试）`, failed >= success ? 'info' : 'success')
      else push(`信息获取完成：${success} 个游戏已获取元数据`, 'success')
    },
    [scrapeGame, push],
  )

  const saveLibrary = useCallback((list: Game[]) => {
    fetch('/api/library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        games: list.map(g => ({
          folderName: g.folderName,
          folderPath: g.folderPath,
          pathHash: g.pathHash,
          fileCount: g.fileCount,
          exeCandidates: g.exeCandidates,
          matchScore: g.matchScore,
          matchedTypes: g.matchedTypes,
          rootPath: g.rootPath,
          completed: g.completed,
          completedAt: g.completedAt,
        })),
      }),
    }).catch(() => {})
  }, [])

  const updateGames = useCallback(
    (fn: (prev: Game[]) => Game[]) => {
      setGames(prev => {
        const next = fn(prev)
        if (next !== prev) saveLibrary(next)
        return next
      })
    },
    [saveLibrary],
  )

  const setGameCompleted = useCallback(
    (hash: string, completed: boolean) => {
      updateGames(prev =>
        prev.map(g =>
          g.pathHash === hash
            ? completed
              ? { ...g, completed: true, completedAt: new Date().toISOString() }
              : { ...g, completed: false, completedAt: undefined }
            : g,
        ),
      )
    },
    [updateGames],
  )

  const refreshPlaytime = useCallback(async () => {
    try {
      const resp = await fetch('/api/playtime')
      const json = await resp.json()
      if (!json.ok) return
      setGames(prev =>
        prev.map(g => {
          const pt = json.games?.[g.pathHash]
          return pt
            ? { ...g, playtimeMinutes: pt.minutes, lastPlayed: pt.lastPlayed, playSessions: pt.sessions }
            : g
        }),
      )
    } catch (e) {}
  }, [])

  const doScan = useCallback(
    async (
      rootPath: string,
      mode: string,
      exeMap: Record<string, string>,
      coverMap: Record<string, string>,
      titleMap: Record<string, string>,
      devMap: Record<string, string>,
    ) => {
      setScanning(true)
      try {
        const resp = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rootPath, mode }),
        })
        const json = await resp.json()
        if (!json.ok) {
          push(json.error ?? '扫描失败', 'error')
          return
        }
        const scanned = (json.games ?? []).map((g: LibraryGame) =>
          mergeGameSettings({ ...g, rootPath }, exeMap, coverMap, titleMap, devMap),
        )
        if (scanned.length === 0) {
          push(
            `未在「${rootName ?? rootPath}」中找到符合的游戏文件夹（共跳过 ${json.skipped} 个）` +
              (mode === 'strict' ? '，可在设置中切换宽松模式' : ''),
            'info',
          )
          return
        }
        updateGames(prev => {
          const merged = (() => {
            const removed = new Set(Array.isArray(json.removedPaths) ? json.removedPaths : [])
            const map = new Map(prev.map(g => [g.pathHash, g]))
            const scannedHashes = new Set(scanned.map((g: LibraryGame) => g.pathHash))
            // 目录已不存在（被移动/删除）的库条目，扫描后自动移除
            for (const [hash] of map) {
              if (!scannedHashes.has(hash) && removed.has(hash)) map.delete(hash)
            }
            for (const g of scanned) {
              const existing = map.get(g.pathHash)
              if (existing) {
                map.set(g.pathHash, {
                  ...existing,
                  // 目录内容可能已变化，刷新扫描到的这些字段
                  folderName: g.folderName,
                  folderPath: g.folderPath,
                  fileCount: g.fileCount,
                  exeCandidates: g.exeCandidates,
                  matchScore: g.matchScore,
                  matchedTypes: g.matchedTypes,
                  rootPath: g.rootPath,
                  metadata: existing.metadata ?? g.metadata,
                  status: existing.metadata || g.metadata ? 'done' : existing.status,
                  selectedExe: g.selectedExe ?? existing.selectedExe,
                  customCover: g.customCover ?? existing.customCover,
                  customTitle: g.customTitle ?? existing.customTitle,
                  customDeveloper: g.customDeveloper ?? existing.customDeveloper,
                  playtimeMinutes: g.playtimeMinutes ?? existing.playtimeMinutes,
                  lastPlayed: g.lastPlayed ?? existing.lastPlayed,
                  playSessions: g.playSessions ?? existing.playSessions,
                })
              } else {
                map.set(g.pathHash, g)
              }
            }
            return [...map.values()]
          })()
          return merged
        })
        void refreshPlaytime()
        void enqueueScrape(scanned)
      } catch (e) {
        push('扫描失败：无法连接本地服务', 'error')
      } finally {
        setScanning(false)
      }
    },
    [rootName, enqueueScrape, push, refreshPlaytime, updateGames],
  )

  const scan = useCallback(async () => {
    if (!settings?.rootPath) {
      push('请先在设置中配置游戏根目录', 'info')
      return
    }
    await doScan(settings.rootPath, filterMode, settings.exeMap ?? {}, settings.coverMap ?? {}, settings.titleMap ?? {}, settings.devMap ?? {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, filterMode, doScan, push])

  // 初始加载
  useEffect(() => {
    ;(async () => {
      try {
        const [settingsResp, libraryResp, playtimeResp] = await Promise.all([
          fetch('/api/settings'),
          fetch('/api/library'),
          fetch('/api/playtime'),
        ])
        const settingsJson = await settingsResp.json()
        const libraryJson = await libraryResp.json()
        const playtimeJson = await playtimeResp.json()
        const maps =
          settingsJson.ok && settingsJson.settings
            ? settingsJson.settings
            : { exeMap: {}, coverMap: {}, titleMap: {}, devMap: {} }
        if (settingsJson.ok && settingsJson.settings) {
          setSettings(settingsJson.settings)
          setFilterModeState(settingsJson.settings.filterMode)
        }
        if (libraryJson.ok && libraryJson.games && libraryJson.games.length > 0) {
          const loaded = (libraryJson.games as Game[]).map(g => {
            const pt = playtimeJson.games?.[g.pathHash]
            return {
              ...mergeGameSettings(g, maps.exeMap, maps.coverMap, maps.titleMap, maps.devMap),
              metadata: g.metadata,
              status: (g.metadata ? 'done' : 'pending') as GameStatus,
              playtimeMinutes: pt?.minutes,
              lastPlayed: pt?.lastPlayed,
              playSessions: pt?.sessions,
            }
          })
          setGames(loaded)
          const missing = loaded.filter((g: Game) => !g.metadata)
          if (missing.length > 0) void enqueueScrape(missing)
        } else if (settingsJson.ok && settingsJson.settings?.rootPath) {
          await doScan(
            settingsJson.settings.rootPath,
            settingsJson.settings.filterMode,
            maps.exeMap,
            maps.coverMap,
            maps.titleMap,
            maps.devMap,
          )
        }
      } catch (e) {}
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 每 60 秒刷新游玩时长 + 页面可见时刷新
  useEffect(() => {
    const timer = setInterval(() => {
      void refreshPlaytime()
    }, 60000)
    const onVis = () => {
      if (document.visibilityState === 'visible') void refreshPlaytime()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [refreshPlaytime])

  const saveRootPath = useCallback(
    async (path: string): Promise<boolean> => {
      if (!settings) return false
      const next = { ...settings, rootPath: path }
      try {
        const resp = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rootPath: path }),
        })
        const json = await resp.json()
        if (!json.ok) {
          push(json.error ?? '保存失败', 'error')
          return false
        }
        setSettings(next)
        await doScan(path, filterMode, next.exeMap ?? {}, next.coverMap ?? {}, next.titleMap ?? {}, next.devMap ?? {})
        return true
      } catch (e) {
        push('保存失败：网络错误', 'error')
        return false
      }
    },
    [settings, filterMode, doScan, push],
  )

  const setFilterMode = useCallback(
    (mode: string) => {
      if (!settings) return
      setFilterModeState(mode)
      const next = { ...settings, filterMode: mode }
      setSettings(next)
      fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filterMode: mode }),
      }).catch(() => {})
      if (next.rootPath) {
        push('已切换识别模式，正在重新扫描…', 'info')
        void doScan(next.rootPath, mode, next.exeMap ?? {}, next.coverMap ?? {}, next.titleMap ?? {}, next.devMap ?? {})
      }
    },
    [settings, doScan, push],
  )

  const launch = useCallback(
    async (game: Game, exePath?: string) => {
      if (!game.folderPath) {
        push(`「${game.folderName}」路径未知，请先重新扫描获取真实路径`, 'error')
        return
      }
      const exe = exePath ?? game.selectedExe ?? game.exeCandidates[0]?.path
      if (!exe) {
        push(`「${game.folderName}」未找到可启动的 exe（可打开文件夹手动运行）`, 'error')
        return
      }
      try {
        const resp = await fetch('/api/launch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ exePath: exe, hash: game.pathHash }),
        })
        const json = await resp.json()
        if (json.ok) push(`已启动「${game.folderName}」`, 'success')
        else push(json.error ?? '启动失败', 'error')
      } catch (e) {
        push('启动失败：网络错误', 'error')
      }
    },
    [push],
  )

  const openFolder = useCallback(
    async (game: Game) => {
      if (!game.folderPath) {
        push(`「${game.folderName}」路径未知，请先重新扫描`, 'error')
        return
      }
      try {
        await fetch('/api/open-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: game.folderPath }),
        })
      } catch (e) {
        push('打开目录失败', 'error')
      }
    },
    [push],
  )

  const setGameExe = useCallback(
    async (game: Game, path: string) => {
      if (!settings) return
      setGames(prev => prev.map(g => (g.pathHash === game.pathHash ? { ...g, selectedExe: path } : g)))
      const next = { ...settings, exeMap: { ...(settings.exeMap ?? {}), [game.pathHash]: path } }
      setSettings(next)
      try {
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ exeMap: next.exeMap }),
        })
        push(`已设为默认启动程序：${path.split(/[\\/]/).pop()}`, 'success')
      } catch (e) {
        push('保存启动程序失败', 'error')
      }
    },
    [settings, push],
  )

  const setGameCover = useCallback(
    async (game: Game, url: string | null): Promise<boolean> => {
      if (!settings) return false
      setGames(prev =>
        prev.map(g => (g.pathHash === game.pathHash ? { ...g, customCover: url != null ? url : undefined } : g)),
      )
      const coverMap = { ...(settings.coverMap ?? {}) }
      if (url) coverMap[game.pathHash] = url
      else delete coverMap[game.pathHash]
      setSettings({ ...settings, coverMap })
      try {
        const resp = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ coverMap }),
        })
        const json = await resp.json()
        if (!json.ok) throw Error(json.error ?? '保存失败')
        push(url ? '封面已更换' : '已恢复默认封面', 'success')
        return true
      } catch (e) {
        push('保存封面失败', 'error')
        return false
      }
    },
    [settings, push],
  )

  const setCustomTitle = useCallback(
    async (game: Game, title: string): Promise<boolean> => {
      if (!settings) return false
      const value = title.trim()
      setGames(prev =>
        prev.map(g => (g.pathHash === game.pathHash ? { ...g, customTitle: value || undefined } : g)),
      )
      const titleMap = { ...(settings.titleMap ?? {}) }
      if (value) titleMap[game.pathHash] = value
      else delete titleMap[game.pathHash]
      setSettings({ ...settings, titleMap })
      try {
        const resp = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ titleMap }),
        })
        const json = await resp.json()
        if (!json.ok) throw Error(json.error ?? '保存失败')
        push(value ? '标题已更新' : '已恢复自动标题', 'success')
        return true
      } catch (e) {
        push('保存标题失败', 'error')
        return false
      }
    },
    [settings, push],
  )

  const setCustomDeveloper = useCallback(
    async (game: Game, dev: string): Promise<boolean> => {
      if (!settings) return false
      const value = dev.trim()
      setGames(prev =>
        prev.map(g => (g.pathHash === game.pathHash ? { ...g, customDeveloper: value || undefined } : g)),
      )
      const devMap = { ...(settings.devMap ?? {}) }
      if (value) devMap[game.pathHash] = value
      else delete devMap[game.pathHash]
      setSettings({ ...settings, devMap })
      try {
        const resp = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ devMap }),
        })
        const json = await resp.json()
        if (!json.ok) throw Error(json.error ?? '保存失败')
        push(value ? `厂商已设为「${value}」` : '已恢复自动厂商', 'success')
        return true
      } catch (e) {
        push('保存厂商失败', 'error')
        return false
      }
    },
    [settings, push],
  )

  const setGameCharacters = useCallback(
    (game: Game, chars: CharacterEntry[]) => {
      if (game.metadata) patchGame(game.pathHash, { metadata: { ...game.metadata, characters: chars } })
    },
    [patchGame],
  )

  const setCnDescription = useCallback(
    (game: Game, description: string) => {
      if (game.metadata) patchGame(game.pathHash, { metadata: { ...game.metadata, cnDescription: description } })
    },
    [patchGame],
  )

  const relocate = useCallback(
    async (game: Game, newPath: string) => {
      try {
        const oldHash = game.pathHash
        const resp = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rootPath: game.rootPath || '',
            mode: 'strict',
            path: newPath,
            oldHash,
            oldFolderName: game.folderName,
          }),
        })
        const json = await resp.json()
        if (!json.ok || !json.game) return { ok: false, error: json.error || '该路径未识别为游戏' }
        const recognized = json.game
        updateGames(prev =>
          prev.map(g =>
            g.pathHash === oldHash
              ? {
                  ...g,
                  folderName: recognized.folderName,
                  folderPath: recognized.folderPath,
                  pathHash: recognized.pathHash,
                  fileCount: recognized.fileCount,
                  exeCandidates: recognized.exeCandidates,
                  matchScore: recognized.matchScore,
                  matchedTypes: recognized.matchedTypes,
                  selectedExe: (() => {
                    const oldBase = g.selectedExe?.split(/[\\/]/).pop()
                    const match = recognized.exeCandidates.find(
                      (e: { name?: string; path?: string }) => e.name === oldBase
                    )
                    return match?.path ?? recognized.exeCandidates[0]?.path
                  })(),
                  status: 'pending',
                }
              : g,
          ),
        )
        // 保持详情弹窗打开（pathHash 已变化，旧 selectedHash 会失配）
        setSelectedHash(recognized.pathHash)
        // 服务端已迁移 exe/cover/title/dev 映射与 playtime；同步 settings 状态
        fetch('/api/settings')
          .then(r => r.json())
          .then(s => {
            if (s.ok && s.settings) setSettings(s.settings)
          })
          .catch(() => {})
        void refreshPlaytime()
        setTimeout(() => {
          fetch(
            `/api/scrape?name=${encodeURIComponent(recognized.folderName)}&folder=${encodeURIComponent(recognized.folderName)}&hash=${recognized.pathHash}&enrich=1`,
          )
            .then(r => r.json())
            .then(json => {
              if (json.ok && json.data)
                patchGame(recognized.pathHash, { metadata: json.data, status: 'done', error: undefined })
            })
            .catch(() => {})
        }, 300)
        return { ok: true, title: recognized.folderName }
      } catch (err) {
        return { ok: false, error: '网络错误：' + String(err) }
      }
    },
    [updateGames, patchGame, refreshPlaytime],
  )

  const rescrape = useCallback(
    async (game: Game, silent?: boolean) => {
      const err = await scrapeGame(game, true, !silent)
      if (!silent)
        push(
          err == null ? `「${game.folderName}」元数据已更新` : `「${game.folderName}」获取失败：${err}`,
          err == null ? 'success' : 'error',
        )
    },
    [scrapeGame, push],
  )

  const removeGame = useCallback(
    (hash: string) => {
      updateGames(prev => {
        const next = prev.filter(g => g.pathHash !== hash)
        const removed = prev.find(g => g.pathHash === hash)
        if (removed && removed.folderPath) {
          let ignore = ignorePathsRef.current ?? ((settings && (settings.ignorePaths as string[])) || [])
          ignore = ignore.filter(p => p !== removed.folderPath)
          ignore.push(removed.folderPath)
          ignorePathsRef.current = ignore
          fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ignorePaths: ignore }),
          }).catch(() => {})
        }
        return next
      })
      setSelectedHash(prev => (prev === hash ? null : prev))
    },
    [updateGames, settings],
  )

  const manualMatch = useCallback(
    async (game: Game, source: string, id: string): Promise<boolean> => {
      const params = new URLSearchParams({
        name: game.folderName,
        folder: game.folderName,
        hash: game.pathHash,
        source,
        id,
      })
      try {
        const resp = await fetch(`/api/scrape?${params.toString()}`)
        const json = await resp.json()
        if (json.proxyFallback) toastProxyFallback(push)
        if (json.ok && json.data) {
          patchGame(game.pathHash, { metadata: json.data, status: 'done', error: undefined })
          push(`已应用「${json.data.title}」的元数据`, 'success')
          return true
        }
        push(json.error ?? '手动修正失败', 'error')
        return false
      } catch (e) {
        push('手动修正失败：网络错误', 'error')
        return false
      }
    },
    [patchGame, push],
  )

  return {
    games,
    rootName,
    search,
    setSearch,
    selectedHash,
    setSelectedHash,
    selectedGame,
    scanning,
    scraping,
    progress,
    settings,
    filterMode,
    saveRootPath,
    setFilterMode,
    scan,
    launch,
    openFolder,
    setGameExe,
    rescrape,
    removeGame,
    manualMatch,
    setGameCover,
    setGameCharacters,
    setCnDescription,
    setCustomTitle,
    setCustomDeveloper,
    setGameCompleted,
    relocate,
  }
}

// 左侧栏稳定子组件（定义在组件外，避免每次 Page 渲染都重新挂载导致滚动位置跳动）
function DevDot({ name }: { name: string }) {
  return (
    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorFor(name)[0] }} />
  )
}

function SidebarItem({
  id,
  name,
  countLabel,
  active,
  onClick,
}: {
  id: string
  name: string
  countLabel: string | number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition ${
        active ? 'bg-indigo-500/15 font-medium text-indigo-200' : 'text-white/55 hover:bg-white/[0.05] hover:text-white'
      }`}
    >
      <DevDot name={name} />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <span className="text-[11px] tabular-nums text-white/30">{countLabel}</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// 页面默认导出
// ---------------------------------------------------------------------------

export default function Page() {
  const lib = useLibrary()
  const { push } = useToast()
  // 单游戏 NSFW 模糊开关：nsfwOff 集合中的游戏即使 NSFW 也不模糊（localStorage 持久化）
  const [nsfwOff, setNsfwOff] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('gl-nsfw-blur-off') || '[]'))
    } catch (e) {
      return new Set()
    }
  })
  const toggleNsfwBlur = useCallback(
    (game: Game) => {
      const key = game.pathHash
      const wasOff = nsfwOff.has(key)
      const next = new Set(nsfwOff)
      if (wasOff) next.delete(key)
      else next.add(key)
      setNsfwOff(next)
      try {
        localStorage.setItem('gl-nsfw-blur-off', JSON.stringify([...next]))
      } catch (e) {}
      push(
        wasOff ? '已恢复「' + displayTitle(game) + '」的封面模糊' : '已对「' + displayTitle(game) + '」关闭封面模糊',
        wasOff ? 'info' : 'success',
      )
    },
    [nsfwOff, push],
  )
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [, setNsfwTick] = useState(0)
  const [filter, setFilter] = useState<{ kind: 'all' | 'dev'; name?: string }>({ kind: 'all' })
  const [sortMode, setSortMode] = useState('title')
  const [devSortDesc, setDevSortDesc] = useState(false)
  const [companyData, setCompanyData] = useState<Record<string, CompanyInfo | null>>({})
  const [companyBusy, setCompanyBusy] = useState<Record<string, boolean>>({})
  const [webSel, setWebSel] = useState<Game | null>(null)
  const [showFavOnly, setShowFavOnly] = useState(false)
  const [favs, setFavs] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('gl-favs') || '[]') || []
    } catch (e) {
      return []
    }
  })
  const retriedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const scale = parseInt(localStorage.getItem('gl-ui-scale') ?? '100', 10) || 100
    document.documentElement.style.fontSize = scale + '%'
  }, [])

  const companies = useMemo(() => {
    const map = new Map<string, number>()
    for (const g of lib.games) {
      const dev = normalizeDev(devName(g))
      map.set(dev, (map.get(dev) ?? 0) + 1)
    }
    return [...map.entries()].sort((a, b) => (devSortDesc ? -1 : 1) * a[0].localeCompare(b[0], 'zh-Hans-CN'))
  }, [lib.games, devSortDesc])

  const recent = useMemo(
    () =>
      lib.games
        .filter(g => g.lastPlayed)
        .sort((a, b) => new Date(b.lastPlayed!).getTime() - new Date(a.lastPlayed!).getTime())
        .slice(0, 5),
    [lib.games],
  )

  const totalMinutes = useMemo(() => lib.games.reduce((acc, g) => acc + (g.playtimeMinutes || 0), 0), [lib.games])

  const completedGames = useMemo(
    () =>
      lib.games
        .filter(g => g.completed === true)
        .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
    [lib.games],
  )

  const query = lib.search.trim().toLowerCase()

  const sortedGames = useMemo(() => {
    const list = [...lib.games].sort((a, b) =>
      sortMode === 'release'
        ? (b.metadata?.released || '0000').localeCompare(a.metadata?.released || '0000') ||
          displayTitle(a).localeCompare(displayTitle(b), 'zh-Hans-CN')
        : displayTitle(a).localeCompare(displayTitle(b), 'zh-Hans-CN'),
    )
    // 收藏游戏始终置顶；「仅显示收藏」时非收藏游戏会被过滤隐藏
    return list.filter(g => favs.includes(g.pathHash)).concat(list.filter(g => !favs.includes(g.pathHash)))
  }, [lib.games, sortMode, favs, showFavOnly])

  const visibleCount = useMemo(
    () =>
      lib.games.filter(
        g => matchesFilter(g, query, filter) && (!showFavOnly || favs.includes(g.pathHash)),
      ).length,
    [lib.games, query, filter, showFavOnly, favs],
  )

  const normKey = (s?: string) =>
    (s || '').trim().toLowerCase().replace(/[\s\-_・·!！?？:：,，.。'’"“”()（）[\]【】]/g, '')

  const webSearchMatch = (w: Game, q: string) => {
    if (!q) return true
    const title = displayTitle(w).toLowerCase()
    const original = (w.metadata?.originalTitle || '').toLowerCase()
    const devs = ((w.metadata?.developers || []) as string[]).join(' ').toLowerCase()
    return title.includes(q) || original.includes(q) || w.folderName.toLowerCase().includes(q) || devs.includes(q)
  }

  const fetchCompany = async (name: string, force?: boolean, notify = true) => {
    if (companyBusy[name]) return
    setCompanyBusy(prev => ({ ...prev, [name]: true }))
    try {
      const localGames = lib.games.filter(g => normalizeDev(devName(g)) === name)
      const vids = localGames.map(g => g.metadata && g.metadata.vndbId).filter(Boolean) as string[]
      let dev0: string | null = null
      for (const g of localGames) {
        const ds = g.metadata && (g.metadata.developers as string[] | undefined)
        if (Array.isArray(ds) && ds.length) {
          dev0 = ds[0]
          break
        }
      }
      // 优先用当前公司桶名查询（含用户手动指定的厂商名），
      // 避免“把 ATRI 手动归到 FrontWing 后，未下载列表仍按刮削的枕社拉取”。
      const term = name
      let resp = await fetch(
        `/api/scrape?company=${encodeURIComponent(term)}&name=${encodeURIComponent(name)}&vndbIds=${vids.join(',')}${
          force ? '&force=1' : ''
        }`,
      )
      let json = await resp.json().catch(() => null)
      if (json && json.ok && json.cached && !force && (!json.games || !json.games.length)) {
        resp = await fetch(
          `/api/scrape?company=${encodeURIComponent(term)}&name=${encodeURIComponent(name)}&vndbIds=${vids.join(',')}&force=1`,
        )
        json = await resp.json().catch(() => null)
      }
      // 桶名在 VNDB 上查不到时，回退到本地刮削记录里的开发商标记
      if (
        json &&
        json.ok &&
        Array.isArray(json.games) &&
        json.games.length === 0 &&
        dev0 &&
        dev0 !== name
      ) {
        resp = await fetch(
          `/api/scrape?company=${encodeURIComponent(dev0)}&name=${encodeURIComponent(name)}&vndbIds=${vids.join(',')}&force=1`,
        )
        json = await resp.json().catch(() => null)
      }
      if (json && json.proxyFallback && notify) toastProxyFallback(push)
      if (!json || !json.ok || !Array.isArray(json.games)) {
        setCompanyData(prev => ({ ...prev, [name]: null }))
        return
      }
      let webCustom: Record<string, WebCustomPatch> = {}
      let hiddenArr: string[] = []
      try {
        webCustom = JSON.parse(localStorage.getItem('gl-web-custom') || '{}') || {}
      } catch (e) {}
      try {
        hiddenArr = JSON.parse(localStorage.getItem('gl-web-hidden') || '[]') || []
      } catch (e) {}
      const hiddenSet = new Set(hiddenArr)
      const idSet = new Set<string>()
      const keySet = new Set<string>()
      for (const g of localGames) {
        if (g.metadata && g.metadata.vndbId) idSet.add(g.metadata.vndbId)
        for (const t of [
          displayTitle(g),
          g.folderName,
          g.metadata && g.metadata.title,
          g.metadata && g.metadata.originalTitle,
          ...(g.metadata && (g.metadata.aliases as string[]) ? (g.metadata.aliases as string[]) : []),
        ]) {
          if (t) keySet.add(normKey(String(t)))
        }
      }
      const webGames: Game[] = (json.games as GameMetadata[])
        .filter((v: GameMetadata) => {
          if (v.vndbId && idSet.has(v.vndbId)) return false
          const titles = [v.title, v.originalTitle, ...(v.aliases || [])].filter(Boolean) as string[]
          return !titles.some(t => keySet.has(normKey(t)))
        })
        .filter((v: GameMetadata) => !hiddenSet.has('web-' + (v.vndbId || '')))
        .map((v: GameMetadata) => ({
          pathHash: 'web-' + (v.vndbId || Math.random().toString(36).slice(2, 8)),
          folderName: v.title || '未知游戏',
          folderPath: '',
          fileCount: 0,
          exeCandidates: [],
          selectedExe: undefined,
          customCover: (webCustom['web-' + (v.vndbId || '')] || {}).customCover,
          customTitle: (webCustom['web-' + (v.vndbId || '')] || {}).customTitle,
          customDeveloper: (webCustom['web-' + (v.vndbId || '')] || {}).customDeveloper,
          matchScore: 0,
          matchedTypes: ['web'],
          rootPath: '',
          savedAt: new Date().toISOString(),
          notDownloaded: true,
          status: 'done' as GameStatus,
          metadata: {
            ...v,
            title: v.cnTitle || v.title,
            originalTitle: v.alttitle || undefined,
            source: 'vndb',
            scrapedAt: new Date().toISOString(),
          },
        }))
      for (const g of localGames) {
        if (g.metadata && !g.metadata.officialCnTitle && g.metadata.vndbId) {
          const w = (json.games as GameMetadata[]).find(
            (x: GameMetadata) => x.vndbId === g.metadata!.vndbId && x.cnTitle,
          )
          if (w && w.cnTitle) cnMap[g.metadata.vndbId] = w.cnTitle
        }
      }
      for (const g of localGames) {
        if (g.metadata && g.metadata.vndbId) {
          const w = (json.games as GameMetadata[]).find((x: GameMetadata) => x.vndbId === g.metadata!.vndbId)
          if (w && (w.sexual || 0) > 0.5) nsfwMap[g.metadata.vndbId] = 2
        }
      }
      setCompanyData(prev => ({
        ...prev,
        [name]: { local: localGames.length, total: localGames.length + webGames.length, games: webGames },
      }))
    } catch (e) {
      setCompanyData(prev => ({ ...prev, [name]: null }))
    } finally {
      setCompanyBusy(prev => ({ ...prev, [name]: false }))
    }
  }

  const setWebCustom = (hash: string, patch: WebCustomPatch) => {
    let all: Record<string, WebCustomPatch> = {}
    try {
      all = JSON.parse(localStorage.getItem('gl-web-custom') || '{}') || {}
    } catch (e) {}
    all[hash] = Object.assign({}, all[hash], patch)
    try {
      localStorage.setItem('gl-web-custom', JSON.stringify(all))
    } catch (e) {}
    setWebSel(w => (w && w.pathHash === hash ? Object.assign({}, w, patch) : w))
    setCompanyData(prev => {
      const out: Record<string, CompanyInfo | null> = {}
      for (const key of Object.keys(prev)) {
        const cd = prev[key]
        out[key] =
          cd && Array.isArray(cd.games)
            ? Object.assign({}, cd, { games: cd.games.map(w => (w.pathHash === hash ? Object.assign({}, w, patch) : w)) })
            : cd
      }
      return out
    })
  }

  const hideWebGame = (hash: string) => {
    let all: string[] = []
    try {
      all = JSON.parse(localStorage.getItem('gl-web-hidden') || '[]') || []
    } catch (e) {}
    if (!all.includes(hash)) {
      all.push(hash)
      try {
        localStorage.setItem('gl-web-hidden', JSON.stringify(all))
      } catch (e) {}
    }
    setWebSel(w => (w && w.pathHash === hash ? null : w))
    setCompanyData(prev => {
      const out: Record<string, CompanyInfo | null> = {}
      for (const key of Object.keys(prev)) {
        const cd = prev[key]
        out[key] =
          cd && Array.isArray(cd.games)
            ? Object.assign({}, cd, {
                total: cd.local + cd.games.filter(w => w.pathHash !== hash).length,
                games: cd.games.filter(w => w.pathHash !== hash),
              })
            : cd
      }
      return out
    })
  }

  const toggleFav = (hash: string) => {
    setFavs(prev => {
      const next = prev.includes(hash) ? prev.filter(h => h !== hash) : [...prev, hash]
      try {
        localStorage.setItem('gl-favs', JSON.stringify(next))
      } catch (e) {}
      return next
    })
  }

  const webList =
    filter.kind === 'dev' && companyData[filter.name!] && Array.isArray(companyData[filter.name!]!.games)
      ? (() => {
          const list = companyData[filter.name!]!
            .games.filter(w => webSearchMatch(w, query) && (!showFavOnly || favs.includes(w.pathHash)))
            .sort((a, b) =>
              sortMode === 'release'
                ? (b.metadata?.released || '0000').localeCompare(a.metadata?.released || '0000')
                : displayTitle(a).localeCompare(displayTitle(b), 'zh-Hans-CN'),
            )
          return list.filter(w => favs.includes(w.pathHash)).concat(list.filter(w => !favs.includes(w.pathHash)))
        })()
      : null

  // 会社未下载列表预取（3 个并发 worker）
  useEffect(() => {
    const names = companies.map(c => c[0]).filter(n => n !== '未分类')
    let stop = false
    let i = 0
    const worker = async () => {
      while (i < names.length && !stop) {
        const name = names[i++]
        if (!companyData[name] && !companyBusy[name]) {
          try {
            await fetchCompany(name, false, false)
          } catch (e) {}
        }
      }
    }
    void Promise.all([worker(), worker(), worker()])
    return () => {
      stop = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies])

  // 获取失败自动重试（前 10 个，双 worker，无依赖数组：每次渲染后检查）
  useEffect(() => {
    if (!lib.games.length) return
    const fails = lib.games
      .filter(g => g.status === 'error' && !retriedRef.current.has(g.pathHash))
      .slice(0, 10)
    if (!fails.length) return
    fails.forEach(g => retriedRef.current.add(g.pathHash))
    let i = 0
    let stop = false
    const worker = async () => {
      while (i < fails.length && !stop) {
        const g = fails[i++]
        try {
          await lib.rescrape(g, true)
        } catch (e) {}
      }
    }
    void Promise.all([worker(), worker()])
    return () => {
      stop = true
    }
  })

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-ink-950" />
        <div className="absolute -top-40 left-1/2 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-indigo-600/20 blur-[140px]" />
        <div className="absolute -left-40 top-1/3 h-[400px] w-[400px] rounded-full bg-fuchsia-600/10 blur-[120px]" />
        <div className="absolute -right-40 bottom-0 h-[400px] w-[500px] rounded-full bg-violet-700/10 blur-[130px]" />
      </div>
      <Header
        search={lib.search}
        onSearch={lib.setSearch}
        onScan={() => void lib.scan()}
        onOpenSettings={() => setSettingsOpen(true)}
        scanning={lib.scanning}
        scraping={lib.scraping}
        rootName={lib.rootName}
      />
      <main className="mx-auto max-w-[1880px] px-4 pb-28 pt-6 sm:px-6 lg:h-[calc(100vh-67px)] lg:overflow-hidden lg:pb-0">
        {lib.games.length === 0 ? (
          <EmptyState onOpenSettings={() => setSettingsOpen(true)} scanning={lib.scanning} />
        ) : (
          <div className="lg:grid lg:h-full lg:grid-cols-[210px_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)_220px] lg:gap-6">
            <aside className="hidden lg:block max-h-[calc(100vh-91px)] overflow-y-auto overscroll-contain">
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-2">
                <SidebarItem
                  id="all"
                  name="全部游戏"
                  countLabel={lib.games.length}
                  active={filter.kind === 'all'}
                  onClick={() => setFilter({ kind: 'all' })}
                />
                <div className="my-1.5 h-px bg-white/[0.06]" />
                <div className="flex items-center justify-between px-2.5 pb-1 pt-1.5">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-white/25">厂商</p>
                  {Object.keys(companyData).length < companies.length && (
                    <span className="text-[10px] text-white/40">
                      获取中 {Object.keys(companyData).length}/{companies.length}
                    </span>
                  )}
                  <span className="flex items-center gap-0.5">
                    <span className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-white/25">名称</span>
                    <button
                      title={devSortDesc ? '降序（点击切换为升序）' : '升序（点击切换为降序）'}
                      onClick={() => setDevSortDesc(e => !e)}
                      className="flex h-5 w-5 items-center justify-center rounded-md text-white/45 transition hover:bg-white/[0.08] hover:text-white"
                    >
                      <Icon
                        name="up"
                        className={`h-3 w-3 transition-transform ${devSortDesc ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </span>
                </div>
                <div className="max-h-[calc(100vh-240px)] space-y-0.5 overflow-y-auto overscroll-contain pr-0.5">
                  {companies.map(([name, count]) => {
                    const label =
                      companyData[name] && typeof companyData[name]!.total === 'number'
                        ? `${count}/${companyData[name]!.total}`
                        : String(count)
                    return (
                      <SidebarItem
                        key={`dev-${name}`}
                        id={`dev-${name}`}
                        name={name}
                        countLabel={label}
                        active={filter.kind === 'dev' && filter.name === name}
                        onClick={() => {
                          setFilter({ kind: 'dev', name })
                          if (!companyData[name]) void fetchCompany(name)
                        }}
                      />
                    )
                  })}
                </div>
              </div>
            </aside>
            <section className="lg:h-full lg:overflow-y-auto lg:overscroll-contain lg:pb-10">
              <div className="mb-4 space-y-1.5 lg:hidden">
                <div className="flex gap-2 overflow-x-auto pb-0.5">
                  <FilterChip active={filter.kind === 'all'} onClick={() => setFilter({ kind: 'all' })}>
                    全部 {lib.games.length}
                  </FilterChip>
                  {companies.map(([name, count]) => {
                    const label =
                      companyData[name] && typeof companyData[name]!.total === 'number'
                        ? `${count}/${companyData[name]!.total}`
                        : String(count)
                    return (
                      <FilterChip
                        key={name}
                        active={filter.kind === 'dev' && filter.name === name}
                        onClick={() => {
                          setFilter({ kind: 'dev', name })
                          if (!companyData[name]) void fetchCompany(name)
                        }}
                      >
                        {name} {label}
                      </FilterChip>
                    )
                  })}
                </div>
              </div>
              <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-white/35">
                <span className="font-medium text-white/55">
                  {filter.kind === 'all' ? '' : filter.kind === 'dev' ? `厂商：${filter.name}` : ''}
                </span>
                {lib.scraping && <span>· 获取信息中…</span>}
                <span className="ml-auto flex flex-wrap items-center gap-1.5">
                  <span className="flex items-center gap-0.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-0.5">
                    <button
                      title="游戏排序"
                      onClick={() => setSortMode('title')}
                      className={`rounded-md px-2 py-0.5 text-[11px] transition ${
                        sortMode === 'title' ? 'bg-indigo-500/20 font-medium text-indigo-200' : 'text-white/45 hover:text-white'
                      }`}
                    >
                      名称
                    </button>
                    <button
                      title="游戏排序"
                      onClick={() => setSortMode('release')}
                      className={`rounded-md px-2 py-0.5 text-[11px] transition ${
                        sortMode === 'release' ? 'bg-indigo-500/20 font-medium text-indigo-200' : 'text-white/45 hover:text-white'
                      }`}
                    >
                      发售日
                    </button>
                  </span>
                  <button
                    title={showFavOnly ? '显示全部游戏' : '仅显示收藏'}
                    onClick={() => setShowFavOnly(e => !e)}
                    className="flex h-6 w-6 items-center justify-center rounded-lg border transition"
                    style={
                      showFavOnly
                        ? {
                            color: '#facc15',
                            borderColor: 'rgba(250, 204, 21, 0.5)',
                            backgroundColor: 'rgba(250, 204, 21, 0.15)',
                          }
                        : {
                            color: 'rgba(250, 204, 21, 0.8)',
                            borderColor: 'rgba(255, 255, 255, 0.06)',
                            backgroundColor: 'rgba(255, 255, 255, 0.02)',
                          }
                    }
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill={showFavOnly ? 'currentColor' : 'none'}
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-3.5 w-3.5"
                    >
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />
                    </svg>
                  </button>
                </span>
              </div>
              {visibleCount === 0 && (!webList || webList.length === 0) ? (
                <div className="py-24 text-center text-sm text-white/40">
                  {lib.search ? `没有匹配「${lib.search}」的游戏` : '该分组下暂无游戏'}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-5">
                  {sortedGames.map(g => (
                    <div
                      key={g.pathHash}
                      className={
                        matchesFilter(g, query, filter) &&
                        (!showFavOnly || favs.includes(g.pathHash))
                          ? ''
                          : 'hidden'
                      }
                    >
                      <GameCard
                        game={g}
                        onOpen={() => lib.setSelectedHash(g.pathHash)}
                        onLaunch={() => void lib.launch(g)}
                        onOpenFolder={() => void lib.openFolder(g)}
                        onRescrape={() => void lib.rescrape(g)}
                        onRemove={() => lib.removeGame(g.pathHash)}
                        isFav={favs.includes(g.pathHash)}
                        onToggleFav={() => toggleFav(g.pathHash)}
                        nsfwOff={nsfwOff.has(g.pathHash)}
                        onToggleNsfw={() => toggleNsfwBlur(g)}
                      />
                    </div>
                  ))}
                  {webList && webList.length > 0 && (
                    <>
                      <div className="col-span-full mt-3 flex items-center gap-2.5 text-[11px] text-white/40">
                        <span className="h-px flex-1 bg-white/[0.08]" />
                        未下载 · {webList.length}
                        <button
                          title="重新获取该会社的未下载列表"
                          onClick={() => void fetchCompany(filter.name!, true)}
                          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-white/45 transition hover:bg-white/[0.08] hover:text-white"
                        >
                          <Icon name="refresh" className="h-3 w-3" />
                          刷新
                        </button>
                        <span className="h-px flex-1 bg-white/[0.08]" />
                      </div>
                      {webList.map(w => (
                        <div key={w.pathHash}>
                          <GameCard
                            game={w}
                            onOpen={() => setWebSel(w)}
                            onLaunch={() => {}}
                            onOpenFolder={() => {}}
                            onRescrape={() => {}}
                            onRemove={() => hideWebGame(w.pathHash)}
                            isFav={favs.includes(w.pathHash)}
                            onToggleFav={() => toggleFav(w.pathHash)}
                            nsfwOff={nsfwOff.has(w.pathHash)}
                            onToggleNsfw={() => toggleNsfwBlur(w)}
                          />
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
              {filter.kind === 'dev' && (!webList || webList.length === 0) && (
                <div className="col-span-full mt-2 flex flex-col items-center gap-2 py-8">
                  <p className="text-xs text-white/35">
                    {companyData[filter.name!] === null
                      ? '未下载游戏加载失败，请检查网络或代理设置后重试'
                      : companyData[filter.name!] && Array.isArray(companyData[filter.name!]!.games) && companyData[filter.name!]!.games.length === 0
                        ? '未找到该会社的其他未下载游戏'
                        : '正在获取该会社的未下载列表…'}
                  </p>
                  <button
                    title="重新获取该会社的未下载列表"
                    onClick={() => void fetchCompany(filter.name!, true)}
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-500/15 px-3 py-1.5 text-xs font-medium text-indigo-300 transition hover:bg-indigo-500/25"
                  >
                    <Icon name="refresh" className="h-3 w-3" />
                    重新获取
                  </button>
                </div>
              )}
            </section>
            <aside className="hidden xl:block max-h-[calc(100vh-91px)] overflow-y-auto overscroll-contain">
              <div className="space-y-3">
                <div className="rounded-2xl border border-indigo-400/20 bg-indigo-500/10 p-4">
                  <p className="text-[11px] text-indigo-200/60">总计游玩时长</p>
                  <p className="mt-1 text-2xl font-bold leading-none text-indigo-200">{formatDurationCompact(totalMinutes)}</p>
                </div>
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <p className="mb-2 text-[11px] text-white/40">最近启动</p>
                  {recent.length ? (
                    <div className="max-h-[220px] space-y-0.5 overflow-y-auto overscroll-contain pr-0.5">
                    {recent.map(g => (
                      <div
                        key={g.pathHash}
                        className="group flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.06]"
                      >
                        <button
                          onClick={() => lib.setSelectedHash(g.pathHash)}
                          className="min-w-0 flex-1 truncate text-left text-xs text-white/75 transition group-hover:text-white"
                          title={displayTitle(g)}
                        >
                          {displayTitle(g)}
                        </button>
                        <span className="shrink-0 text-[10px] text-white/30">{relativeTime(g.lastPlayed)}</span>
                        <button
                          onClick={() => void lib.launch(g)}
                          title={"启动 " + displayTitle(g)}
                          aria-label={"启动 " + displayTitle(g)}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.05] text-white/55 transition hover:bg-emerald-500/90 hover:text-white"
                        >
                          <Icon name="play" className="h-3 w-3 fill-current" />
                        </button>
                      </div>
                    ))}
                    </div>
                  ) : (
                    <p className="py-2 text-center text-xs text-white/25">暂无启动记录</p>
                  )}
                </div>
                <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-3">
                  <p className="mb-2 text-[11px] text-amber-200/60">已通关 {completedGames.length}</p>
                  {completedGames.length ? (
                    <div className="max-h-[280px] space-y-0.5 overflow-y-auto overscroll-contain pr-0.5">
                      {completedGames.map((g, i) => (
                        <button
                          key={g.pathHash}
                          onClick={() => lib.setSelectedHash(g.pathHash)}
                          className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/[0.06]"
                          title={displayTitle(g)}
                        >
                          <span className="relative h-8 w-6 shrink-0 overflow-hidden rounded bg-ink-800">
                            {g.customCover ?? g.metadata?.coverUrl ? (
                              <CoverImage url={g.customCover ?? g.metadata!.coverUrl!} alt="" />
                            ) : (
                              <CoverPlaceholder name={displayTitle(g)} />
                            )}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-xs text-white/75 group-hover:text-white">
                            {displayTitle(g)}
                          </span>
                          <span className="shrink-0 text-[10px] tabular-nums text-amber-200/40">#{i + 1}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="py-2 text-center text-xs text-white/25">暂无已通关游戏</p>
                  )}
                </div>
              </div>
            </aside>
          </div>
        )}
      </main>
      {lib.scraping && <ProgressToast done={lib.progress.done} total={lib.progress.total} />}
      <GameDetailModal
        game={lib.selectedGame || webSel}
        nsfwOff={nsfwOff.has((lib.selectedGame || webSel)?.pathHash ?? '')}
        onToggleNsfw={() => {
          const g = lib.selectedGame || webSel
          if (g) toggleNsfwBlur(g)
        }}
        onClose={() => {
          lib.setSelectedHash(null)
          setWebSel(null)
        }}
        onRescrape={lib.rescrape}
        onLaunch={lib.launch}
        onOpenFolder={lib.openFolder}
        onSetExe={lib.setGameExe}
        onManualMatch={lib.manualMatch}
        onCharacters={lib.setGameCharacters}
        onCnDescription={lib.setCnDescription}
        onSetCover={lib.setGameCover}
        onSetTitle={lib.setCustomTitle}
        onSetDev={lib.setCustomDeveloper}
        onSetCompleted={lib.setGameCompleted}
        onRelocate={lib.relocate}
        onSetWebCustom={setWebCustom}
        key={(lib.selectedGame || webSel)?.pathHash ?? 'none'}
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={lib.settings}
        onSaveRootPath={lib.saveRootPath}
        games={lib.games}
        favHashes={favs}
        onNsfwBlurChange={() => setNsfwTick(t => t + 1)}
      />
    </div>
  )
}
