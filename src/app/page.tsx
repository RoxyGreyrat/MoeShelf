'use client'

// 模块 5867 整页组件 —— 从编译产物 .next/static/chunks/app/page-a8f2c3d4e5b6.js 逐段重建。
// 所有 className 字符串、fetch 调用、状态流转、条件渲染与编译产物一致；
// 任务二图标修复点以「[FIX]」注释标出。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import QRCode from 'qrcode-generator'
import { Icon, Spinner } from '@/components/icons'
import { useToast } from '@/components/toast'
import { ClockIcon, CoverImage, CoverPlaceholder } from '@/components/ui/primitives'
import { GameDetailModal } from '@/components/detail/GameDetailModal'
import { SettingsModal } from '@/components/settings/SettingsModal'
import { buildCsv, downloadCsv } from '@/lib/csv'
import {
  ACT_GROUPS,
  ACT_SECTIONS,
  cnMap,
  isNsfwBlurEnabled,
  nsfwMap,
  DENSITY_LABEL,
  PAGE_STEP,
  SOURCE_LABELS,
  colorFor,
  devName,
  displayTitle,
  formatDuration,
  formatDurationCompact,
  formatRelease,
  idbGet,
  idbSave,
  isNsfwGame,
  matchesFilter,
  normalizeDev,
  setNsfwBlurEnabled,
  relativeTime,
  stripVndbTags,
  toastProxyFallback,
  type AppSettings,
  type CompanyInfo,
  type CoverItem,
  type ExeItem,
  type Game,
  type CharacterEntry,
  type DirItem,
  type GameMetadata,
  type GameStatus,
  type LibraryGame,
  type WebCustomPatch,
  type SearchCandidate,
  type SourceGroup,
} from '@/lib/ui-shared'

// ---------------------------------------------------------------------------
// IndexedDB 封面缓存（含 window.indexedDB 特性检测与失败兜底）
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
    <header className="sticky top-0 z-40 h-[var(--header-h-mobile,var(--header-h))] border-b border-hairline bg-glass backdrop-blur-xl sm:h-[var(--header-h)]">
      <div className="mx-auto flex h-full max-w-[var(--content-max)] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:flex-nowrap sm:gap-y-0 sm:px-6 sm:py-0">
        <div className="flex min-w-0 items-center gap-2.5">
          <img
            src="/icon.png"
            alt="MoeShelf"
            className="h-9 w-9 shrink-0 radius-md object-cover shadow-token-sm"
          />
          <div className="hidden leading-tight sm:block">
            <h1 className="text-[1.0625rem] font-bold tracking-tight text-primary">MoeShelf</h1>
            <p className="text-[0.75rem] text-tertiary">本地 · 私密 · 自动</p>
          </div>
        </div>
        <div className="order-last w-full sm:order-none sm:ml-4 sm:w-72 sm:flex-1 sm:max-w-md">
          <div className="relative">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3.5 top-1/2 h-[1.125rem] w-[1.125rem] -translate-y-1/2 text-quaternary"
            />
            <input
              value={search}
              onChange={e => onSearch(e.target.value)}
              placeholder="搜索游戏名 / 开发商…"
              className="field h-10 radius-pill pl-10 pr-4"
            />
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onScan}
            disabled={scanning || scraping}
            title="重新扫描游戏根目录"
            className="btn btn-sm btn-primary sm:btn-md"
          >
            <Icon name="refresh" className={`h-[1.125rem] w-[1.125rem] ${scanning ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{scanning ? '正在扫描…' : '扫描游戏'}</span>
          </button>
          <button
            onClick={toggleTheme}
            aria-label="切换亮暗主题"
            title={theme === 'light' ? '切换到暗色' : '切换到亮色'}
            className="icon-btn h-10 w-10 radius-pill"
          >
            <Icon name={theme === 'light' ? 'moon' : 'sun'} className="h-5 w-5" />
          </button>
          <button
            onClick={onOpenSettings}
            aria-label="设置"
            className="icon-btn h-10 w-10 radius-pill"
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
  const [menuOpen, setMenuOpen] = useState(false)
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
  const n18 = isNsfwBlurEnabled() && isNsfw && !nsfwOff

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onOpen()}
      className={`group relative flex cursor-pointer flex-col overflow-hidden radius-lg border bg-surface-1 transition-all duration-[var(--dur)] hover:-translate-y-1 hover:shadow-token-md ${
        nd ? 'border-dashed border-strong' : 'border-hairline hover:border-accent-soft'
      }`}
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-surface-3">
        {coverUrl ? (
          <CoverImage
            url={coverUrl}
            alt={title}
            className={`transition-transform duration-500 group-hover:scale-[1.06]${nd ? ' grayscale' : ''}${n18 ? ' r18-blur' : ''}`}
          />
        ) : (
          <CoverPlaceholder name={title} />
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
        {nd && <div className="pointer-events-none absolute inset-0 bg-slate-900/35" />}
        {game.completed === true && (
          <div className="pointer-events-none absolute right-2 top-2 z-[2] flex h-7 w-7 items-center justify-center radius-pill bg-overlay shadow-[0_0_14px_rgba(245,197,66,0.3)] ring-1 ring-amber-200/45 backdrop-blur-md">
            <Icon
              name="check"
              className="h-3.5 w-3.5 text-amber-300"
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
          className={`overlay-btn absolute left-2 top-2 z-[1] h-7 w-7 ${
            isFav ? 'opacity-100' : 'opacity-70 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100'
          }`}
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
            className={`h-4 w-4 ${isFav ? 'text-amber-300' : ''}`}
          >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />
          </svg>
        </button>
        {n18 && (
          <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center">
            <span
              className="radius-sm text-on-overlay"
              style={{
                fontSize: '0.9375rem',
                fontWeight: 800,
                letterSpacing: '0.22em',
                backgroundColor: 'rgba(0,0,0,0.6)',
                padding: '5px 14px 5px 18px',
                boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
              }}
            >
              NSFW
            </span>
          </div>
        )}
        {isNsfw && isNsfwBlurEnabled() && (
          <button
            title={n18 ? '查看封面（取消该游戏的模糊）' : '恢复该游戏的封面模糊'}
            aria-label={n18 ? '取消该游戏的封面模糊' : '恢复该游戏的封面模糊'}
            onClick={e => {
              e.stopPropagation()
              onToggleNsfw()
            }}
            className="overlay-btn absolute bottom-2 left-2 z-[1] h-8 w-8"
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
            className="absolute left-2 top-11 max-w-[70%] truncate radius-pill bg-red-500/90 px-2 py-0.5 text-[0.6875rem] font-medium text-white shadow-token-xs"
            title={game.error ?? '获取失败'}
          >
            {game.error || '获取失败'}
          </span>
        )}
        {game.status === 'done' && !coverUrl && (
          <span className="absolute left-2 top-11 radius-pill bg-overlay px-2 py-0.5 text-[0.6875rem] text-on-overlay-dim backdrop-blur">
            暂无封面
          </span>
        )}
        {/* 封面上的操作浮层已移除：重新获取 / 打开文件夹 / 移除统一放到卡片底栏，避免与底部按钮重复 */}

        {/* 移动端菜单 */}
        <div className="absolute bottom-2 right-2 sm:hidden">
          <button
            title="更多操作"
            aria-label={`更多操作 ${title}`}
            aria-expanded={menuOpen}
            onClick={e => {
              e.stopPropagation()
              setMenuOpen(v => !v)
            }}
            className="overlay-btn h-9 w-9"
          >
            <Icon name="more" className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div
              className="absolute bottom-11 right-0 z-[3] w-40 overflow-hidden radius-md border border-strong bg-surface-1 py-1 shadow-token-lg"
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => {
                  setMenuOpen(false)
                  onOpen()
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.8125rem] text-secondary transition hover:bg-hoverable hover:text-primary"
              >
                <Icon name="info" className="h-3.5 w-3.5" />
                查看详情
              </button>
              {nd ? null : (
                <>
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      onOpenFolder()
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.8125rem] text-secondary transition hover:bg-hoverable hover:text-primary"
                  >
                    <Icon name="folder" className="h-3.5 w-3.5" />
                    打开文件夹
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      onRescrape()
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.8125rem] text-secondary transition hover:bg-hoverable hover:text-primary"
                  >
                    <Icon name="refresh" className="h-3.5 w-3.5" />
                    重新获取信息
                  </button>
                </>
              )}
              <button
                onClick={() => {
                  setMenuOpen(false)
                  onRemove()
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.8125rem] text-danger transition hover:bg-danger-soft"
              >
                <Icon name="trash" className="h-3.5 w-3.5" />
                {nd ? '从列表隐藏' : '从列表移除'}
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 px-[var(--card-pad)] pb-2.5 pt-2.5">
        <h3
          className="text-[length:var(--card-title)] font-semibold leading-[1.35] text-primary"
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          title={
            nd
              ? `${title}\n未下载 · 来自网络刮削（VNDB）`
              : `${title}\n识别依据：${game.matchedTypes?.join('、') ?? '手动添加'}（得分 ${game.matchScore ?? '-'}）\n路径：${game.folderPath}`
          }
        >
          {title}
        </h3>
        <p className="truncate text-secondary" style={{ fontSize: 'calc(var(--card-title) - 0.0625rem)' }}>
          {release ?? '发售日未知'}
          {dev ? ` · ${dev}` : ''}
        </p>
        <p className="truncate text-[length:var(--card-line)] text-tertiary" title={game.folderPath}>
          {nd ? (
            `未下载 · VNDB #${metadata?.vndbId || ''}`
          ) : (
            <span className="inline-flex min-w-0 items-center gap-1">
              {duration ? (
                <span className="inline-flex shrink-0 items-center gap-1 radius-xs bg-success-soft px-1.5 py-[2px] font-semibold text-success">
                  <ClockIcon className="h-3 w-3 shrink-0" />
                  {duration}
                </span>
              ) : null}
              <span className="truncate">{game.folderName}</span>
            </span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-1.5 border-t border-hairline px-3 py-2.5">
        <button
          onClick={e => {
            e.stopPropagation()
            onLaunch()
          }}
          disabled={!hasExe || nd}
          title={nd ? '该游戏尚未下载到本地' : hasExe ? `启动 ${exePath!.split(/[\\/]/).pop()}` : '未找到可启动的 exe'}
          className={`btn btn-sm flex-1 ${
            nd ? 'bg-warn-soft text-warn' : 'btn-success'
          }`}
        >
          {/* [FIX] 任务二(a)：未下载时图标改高可见度颜色且不传 fill-current（线条图标禁止 fill） */}
          <Icon
            name={nd ? 'download' : 'play'}
            className={nd ? 'h-3.5 w-3.5 shrink-0' : 'h-3.5 w-3.5 fill-current'}
          />
          {nd ? '未下载' : hasExe ? '启动' : '无 exe'}
        </button>
        <button
          onClick={e => {
            e.stopPropagation()
            onOpenFolder()
          }}
          disabled={nd}
          title="打开所在文件夹"
          aria-label={`打开 ${title} 所在文件夹`}
          className={`icon-btn h-8 w-8 bg-sunken${nd ? ' hidden' : ''}`}
        >
          <Icon name="folder" className="h-4 w-4" />
        </button>
        <button
          onClick={e => {
            e.stopPropagation()
            onRescrape()
          }}
          disabled={nd}
          title="重新获取信息"
          aria-label={`重新获取信息 ${title}`}
          className={`icon-btn h-8 w-8 bg-sunken${nd ? ' hidden' : ''}`}
        >
          <Icon name="refresh" className="h-4 w-4" />
        </button>
        <button
          onClick={e => {
            e.stopPropagation()
            onRemove()
          }}
          title={nd ? '从列表隐藏' : '从列表移除'}
          aria-label={nd ? `隐藏 ${title}` : `移除 ${title}`}
          className="icon-btn h-8 w-8 bg-sunken hover:!bg-danger-soft hover:!text-danger"
        >
          <Icon name="trash" className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function EmptyState({ onOpenSettings, scanning }: { onOpenSettings: () => void; scanning: boolean }) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="relative">
        <div className="flex h-20 w-20 items-center justify-center radius-2xl border border-hairline bg-accent-soft">
          <Icon name="book" className="h-9 w-9 text-accent" />
        </div>
      </div>
      <h2 className="mt-6 text-[1.5rem] font-bold tracking-tight text-primary">把你的 Galgame 收藏摆上书架</h2>
      <p className="mt-3 max-w-lg text-[0.9375rem] leading-relaxed text-secondary">
        选一个游戏根目录，自动识别其中的作品，并从 VNDB / Bangumi / YMgal / CnGal 抓取封面与中文信息。
        全部数据都留在本机。
      </p>
      <div className="mt-6 grid w-full max-w-2xl grid-cols-1 gap-3 text-left sm:grid-cols-3">
        {[
          { icon: 'folder', title: '选择目录', desc: '指向存放游戏的文件夹' },
          { icon: 'refresh', title: '自动识别', desc: '扫描子目录与主程序' },
          { icon: 'search', title: '抓取信息', desc: '封面、发售日、简介、时长' },
        ].map(step => (
          <div key={step.title} className="panel-flat flex items-start gap-2.5 p-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center radius-sm bg-accent-soft">
              <Icon name={step.icon} className="h-3.5 w-3.5 text-accent" />
            </span>
            <span className="min-w-0">
              <span className="block text-[0.8125rem] font-semibold text-primary">{step.title}</span>
              <span className="block text-[0.75rem] leading-snug text-tertiary">{step.desc}</span>
            </span>
          </div>
        ))}
      </div>
      <button onClick={onOpenSettings} disabled={scanning} className="btn btn-lg btn-primary mt-7">
        <Icon name="folder" className="h-[1.125rem] w-[1.125rem]" />
        {scanning ? '正在扫描…' : '配置游戏根目录'}
      </button>
      <p className="mt-5 text-[0.8125rem] leading-relaxed text-quaternary">
        游戏本体与文件不会被上传或修改
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 加载骨架（首次进入时按当前密度铺满一屏，避免空白闪烁）
// ---------------------------------------------------------------------------

function CardSkeleton() {
  return (
    <div className="overflow-hidden radius-lg border border-hairline bg-surface-1">
      <div className="aspect-[3/4] w-full skeleton" />
      <div className="flex flex-col gap-2 px-[var(--card-pad)] pb-2.5 pt-2.5">
        <div className="h-3.5 w-[85%] radius-xs skeleton" />
        <div className="h-3 w-[60%] radius-xs skeleton" />
        <div className="h-3 w-[45%] radius-xs skeleton" />
      </div>
      <div className="flex items-center gap-1.5 border-t border-hairline px-3 py-2.5">
        <div className="h-8 flex-1 radius-sm skeleton" />
        <div className="h-8 w-8 radius-sm skeleton" />
      </div>
    </div>
  )
}

function GridSkeleton({
  count = 12,
  density,
  className = '',
}: {
  count?: number
  density: 'compact' | 'cozy' | 'large'
  className?: string
}) {
  return (
    <div
      className={`grid min-w-0 density-${density} ${className}`}
      style={{
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--density-min)), 1fr))',
        columnGap: 'var(--density-gap)',
        rowGap: 'calc(var(--density-gap) * 1.2)',
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  )
}

function ProgressToast({ done, total }: { done: number; total: number }) {
  const percent = total ? Math.round((done / total) * 100) : 0
  return (
    <div className="fixed bottom-5 left-1/2 z-40 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-white/10 bg-ink-900/95 px-4 py-3 shadow-2xl backdrop-blur animate-slide-up">
      <div className="flex items-center justify-between text-[0.8125rem] text-secondary">
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
    <button onClick={onClick} className={`chip shrink-0 ${active ? 'chip-active' : ''}`}>
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
  // 首次加载是否完成（完成前显示骨架屏，避免先闪一下整屏空白）
  const [loaded, setLoaded] = useState(false)

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
      } catch (e) {
      } finally {
        setLoaded(true)
      }
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
    loaded,
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
    <span className="h-2 w-2 shrink-0 radius-pill" style={{ background: colorFor(name)[0] }} />
  )
}

// ---------------------------------------------------------------------------
// 左侧导航（全部 / 收藏 / 已通关 / 厂商；厂商可搜索、可只看本地、可折叠）
// ---------------------------------------------------------------------------

function RailSectionLabel({
  icon,
  label,
  right,
}: {
  icon: string
  label: string
  right?: ReactNode
}) {
  return (
    <p className="flex items-center gap-1.5 px-2.5 pb-1.5 pt-2 section-label">
      <Icon name={icon} className="h-3.5 w-3.5" />
      {label}
      {right ? <span className="ml-auto flex items-center gap-0.5">{right}</span> : null}
    </p>
  )
}

function LeftRail({
  games,
  companies,
  companyData,
  filter,
  setFilter,
  devSortDesc,
  setDevSortDesc,
  favs,
  completedGames,
  totalMinutes,
  showFavOnly,
  onToggleFavOnly,
  compact,
  onToggleCompact,
}: {
  games: Game[]
  companies: [string, number][]
  companyData: Record<string, CompanyInfo | null>
  filter: { kind: 'all' | 'dev'; name?: string }
  setFilter: (f: { kind: 'all' | 'dev'; name?: string }) => void
  devSortDesc: boolean
  setDevSortDesc: React.Dispatch<React.SetStateAction<boolean>>
  favs: string[]
  completedGames: Game[]
  totalMinutes: number
  showFavOnly: boolean
  onToggleFavOnly: () => void
  compact: boolean
  onToggleCompact: () => void
}) {
  const [devQuery, setDevQuery] = useState('')
  const [showAllDevs, setShowAllDevs] = useState(false)

  const shown = useMemo(() => {
    const q = devQuery.trim().toLowerCase()
    let list = companies
    if (q) list = list.filter(([name]) => name.toLowerCase().includes(q))
    return list
  }, [companies, devQuery])

  const visible = showAllDevs || devQuery.trim() ? shown : shown.slice(0, 18)
  const hiddenCount = shown.length - visible.length

  // 折叠态：只剩图标条
  if (compact) {
    return (
      <div className="panel flex flex-col items-center gap-1 p-1.5">
        <button
          onClick={onToggleCompact}
          title="展开侧栏"
          aria-label="展开侧栏"
          className="icon-btn h-9 w-9"
        >
          <Icon name="panelLeft" className="h-4 w-4" />
        </button>
        <button
          onClick={() => setFilter({ kind: 'all' })}
          title={`全部游戏（${games.length}）`}
          aria-label="全部游戏"
          className={`icon-btn h-9 w-9 ${filter.kind === 'all' ? 'bg-accent-soft text-accent' : ''}`}
        >
          <Icon name="layers" className="h-4 w-4" />
        </button>
        <div className="my-1 h-px w-6 bg-hairline" />
        {companies.slice(0, 24).map(([name]) => (
          <button
            key={name}
            onClick={() => setFilter({ kind: 'dev', name })}
            title={name}
            aria-label={`厂商 ${name}`}
            className={`icon-btn h-9 w-9 ${
              filter.kind === 'dev' && filter.name === name ? 'bg-accent-soft' : ''
            }`}
          >
            <DevDot name={name} />
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="panel p-2">
      <div className="space-y-0.5">
        <SidebarItem
          id="all"
          name="全部游戏"
          label="全部游戏"
          icon="layers"
          countLabel={games.length}
          active={filter.kind === 'all' && !showFavOnly}
          onClick={() => {
            setFilter({ kind: 'all' })
            if (showFavOnly) onToggleFavOnly()
          }}
        />
        <SidebarItem
          id="fav"
          name="我的收藏"
          label="我的收藏"
          icon="star"
          countLabel={favs.length}
          active={showFavOnly}
          onClick={onToggleFavOnly}
          title="只看收藏的游戏（收藏在列表中始终置顶）"
          muted={favs.length === 0}
        />
      </div>

      <div className="my-1.5 h-px bg-hairline" />

      <RailSectionLabel
        icon="gamepad"
        label="厂商"
        right={
          <>
            <span className="text-[0.6875rem] font-normal normal-case text-quaternary">
              {devQuery ? `${shown.length} 项` : devSortDesc ? '降序' : '升序'}
            </span>
            <button
              title={devSortDesc ? '当前降序，点击切换为升序' : '当前升序，点击切换为降序'}
              onClick={() => setDevSortDesc(e => !e)}
              className="icon-btn h-5 w-5"
            >
              <Icon name="up" className={`h-3 w-3 transition-transform ${devSortDesc ? 'rotate-180' : ''}`} />
            </button>
          </>
        }
      />
      <div className="relative mb-1.5">
        <Icon
          name="search"
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-quaternary"
        />
        <input
          value={devQuery}
          onChange={e => setDevQuery(e.target.value)}
          placeholder="筛选厂商…"
          className="field h-8 radius-sm pl-8 pr-2.5 text-[0.8125rem]"
        />
      </div>

      {/* ②A：去掉「全部厂商 / 仅当前」两个语义不清的按钮 —— 搜索框 + 列表底部的「还有 N 个厂商」已经够用 */}
      {showAllDevs && (
        <div className="mb-1.5 px-0.5">
          <button
            onClick={() => setShowAllDevs(false)}
            className="chip h-6 px-2 text-[0.75rem]"
            title="只显示常见的 18 个厂商"
          >
            收起厂商列表
          </button>
        </div>
      )}

      <div className="max-h-[calc(100vh-var(--header-h)-19rem)] space-y-0.5 overflow-y-auto overscroll-contain pr-0.5">
        {visible.map(([name, count]) => {
          const info = companyData[name]
          const label = info && typeof info.total === 'number' ? `${count}/${info.total}` : String(count)
          return (
            <SidebarItem
              key={`dev-${name}`}
              id={`dev-${name}`}
              name={name}
              label={name}
              countLabel={label}
              active={filter.kind === 'dev' && filter.name === name}
              onClick={() => setFilter({ kind: 'dev', name })}
              loading={info === null}
              title={
                info && typeof info.total === 'number'
                  ? `${name}\n本地 ${count} 个 · VNDB 上该会社共 ${info.total} 个作品`
                  : `${name}\n本地 ${count} 个`
              }
            />
          )
        })}
        {hiddenCount > 0 && (
          <button
            onClick={() => setShowAllDevs(true)}
            className="w-full radius-sm px-2.5 py-1.5 text-left text-[0.8125rem] text-tertiary transition hover:bg-hoverable hover:text-primary"
          >
            还有 {hiddenCount} 个厂商 · 展开
          </button>
        )}
        {shown.length === 0 && (
          <p className="px-2.5 py-3 text-center text-[0.8125rem] text-quaternary">
            没有匹配「{devQuery}」的厂商
          </p>
        )}
      </div>

      <div className="my-1.5 h-px bg-hairline" />

      <button
        onClick={onToggleCompact}
        className="mt-2 flex w-full items-center justify-center gap-1.5 radius-sm py-1.5 text-[0.75rem] text-quaternary transition hover:bg-hoverable hover:text-primary"
        title="收起侧栏，把宽度让给卡片"
      >
        <Icon name="panelLeft" className="h-3.5 w-3.5" />
        收起侧栏
      </button>
    </div>
  )
}

function SidebarItem({
  id,
  name,
  label,
  icon,
  countLabel,
  active,
  onClick,
  title,
  loading,
  muted,
}: {
  id: string
  name: string
  label: string
  icon?: string
  countLabel: string | number
  active: boolean
  onClick: () => void
  title?: string
  loading?: boolean
  muted?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title ?? label}
      className={`flex w-full items-center gap-2 radius-sm px-2.5 py-1.5 text-left text-[0.8125rem] transition ${
        active
          ? 'bg-accent-soft font-semibold text-accent'
          : `hover:bg-hoverable hover:text-primary ${muted ? 'text-quaternary' : 'text-secondary'}`
      }`}
    >
      {icon ? (
        <Icon name={icon} className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <DevDot name={name} />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {loading ? (
        <Spinner className="h-3 w-3 shrink-0" />
      ) : (
        <span className="shrink-0 text-[0.75rem] tabular-nums text-quaternary">{countLabel}</span>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// 页面默认导出
// ---------------------------------------------------------------------------

export default function Page() {
  const lib = useLibrary()
  const { push } = useToast()
  // 自定义滚动条：原生 ::-webkit-scrollbar 不支持 transition，这里隐藏原生条并在每个滚动容器里注入可淡入淡出的指示条
  useEffect(() => {
    const holders = new WeakMap<HTMLElement, HTMLDivElement>()
    const timers = new WeakMap<HTMLElement, number>()

    const update = (el: HTMLElement, bar: HTMLDivElement) => {
      const { scrollHeight, clientHeight, scrollTop } = el
      if (scrollHeight <= clientHeight + 1) {
        bar.style.opacity = '0'
        return
      }
      const h = Math.max(28, (clientHeight / scrollHeight) * clientHeight)
      const top = (scrollTop / (scrollHeight - clientHeight)) * (clientHeight - h)
      bar.style.height = h + 'px'
      bar.style.top = top + 'px'
    }

    const refreshers = new WeakMap<HTMLElement, () => void>()

    const attach = (el: HTMLElement) => {
      const existing = holders.get(el)
      if (existing && existing.isConnected) return
      if (!/auto|scroll/.test(getComputedStyle(el).overflowY)) return
      el.classList.add('ms-noscroll')
      const holder = document.createElement('div')
      holder.setAttribute('aria-hidden', 'true')
      holder.style.cssText = 'position:sticky;top:0;height:0;z-index:20;pointer-events:none'
      const bar = document.createElement('div')
      bar.className = 'ms-bar'
      bar.style.cssText = 'position:absolute;right:0;width:6px;border-radius:999px;opacity:0;transition:opacity 0.3s ease-out'
      holder.appendChild(bar)
      el.insertBefore(holder, el.firstChild)
      holders.set(el, holder)
      refreshers.set(el, () => update(el, bar))
      update(el, bar)
      el.addEventListener(
        'scroll',
        () => {
          update(el, bar)
          bar.style.opacity = '1'
          const t = timers.get(el)
          if (t) window.clearTimeout(t)
          timers.set(el, window.setTimeout(() => { bar.style.opacity = '0' }, 900))
        },
        { passive: true },
      )
      const ro = new ResizeObserver(() => update(el, bar))
      ro.observe(el)
    }

    const scan = () => {
      document
        .querySelectorAll<HTMLElement>('[class*="overflow-y-auto"], [class*="overflow-auto"], [class*="overflow-y-scroll"]')
        .forEach(el => {
          const refresh = refreshers.get(el)
          if (refresh && holders.get(el)?.isConnected) refresh()
          else attach(el)
        })
    }

    let scheduled = false
    const schedule = () => {
      if (scheduled) return
      scheduled = true
      requestAnimationFrame(() => {
        scheduled = false
        scan()
      })
    }

    scan()
    const mo = new MutationObserver(schedule)
    mo.observe(document.body, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [])

  // 滚动时给根元素加标记（原生滚动条场景下滚动时出现、静止后淡出）
  useEffect(() => {
    let timer: number | undefined
    const onScroll = () => {
      const root = document.documentElement
      if (!root.classList.contains('ms-scrolling')) root.classList.add('ms-scrolling')
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => root.classList.remove('ms-scrolling'), 900)
    }
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true })
      if (timer) window.clearTimeout(timer)
    }
  }, [])

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
  // 卡片密度（紧凑 / 舒适 / 大图）：影响网格最小宽度与卡片字号，localStorage 记忆
  const [density, setDensity] = useState<'compact' | 'cozy' | 'large'>('cozy')
  // 左侧栏折叠态（把宽度让给卡片）
  const [railCompact, setRailCompact] = useState(false)
  // 右栏「最近启动 / 已通关」切换
  const [asideTab, setAsideTab] = useState<'recent' | 'completed'>('recent')
  // 移动端：厂商筛选是否展开
  const [chipExpand, setChipExpand] = useState(false)
  // ③B：只看本地已有的游戏（隐藏厂商视图里「未下载」的卡片）
  const [hideWeb, setHideWeb] = useState(false)
  // 滚动超过一屏后显示「回到顶部」
  const [showBackTop, setShowBackTop] = useState(false)

  useEffect(() => {
    const onScroll = () => setShowBackTop(window.scrollY > 800)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  // 列表分页：首屏只挂载 PAGE_STEP 张卡，避免 189 张卡片一次性渲染（实测网格高 18684px）
  const [visibleLimit, setVisibleLimit] = useState(PAGE_STEP)
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
    const d = localStorage.getItem('gl-card-density')
    if (d === 'compact' || d === 'cozy' || d === 'large') setDensity(d)
    if (localStorage.getItem('gl-rail-compact') === '1') setRailCompact(true)
  }, [])

  const toggleRailCompact = useCallback(() => {
    setRailCompact(prev => {
      const next = !prev
      try {
        localStorage.setItem('gl-rail-compact', next ? '1' : '0')
      } catch (e) {}
      return next
    })
  }, [])

  const changeDensity = useCallback((next: 'compact' | 'cozy' | 'large') => {
    setDensity(next)
    setVisibleLimit(PAGE_STEP)
    try {
      localStorage.setItem('gl-card-density', next)
    } catch (e) {}
  }, [])

  // 切换筛选 / 搜索 / 收藏视图时回到顶部并重置分页（原实现切换厂商后仍停在上一组的滚动位置）
  useEffect(() => {
    setVisibleLimit(PAGE_STEP)
    if (typeof window === 'undefined') return
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [filter, lib.search, showFavOnly, sortMode])

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

  // 还有多少个厂商的「未下载作品清单」在后台补全（顶部工具条用它做轻量进度提示）
  const fetchingCompanies = useMemo(
    () => companies.reduce((n, [name]) => (companyData[name] ? n : n + 1), 0),
    [companies, companyData],
  )

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

  // 当前筛选（厂商 + 搜索 + 仅收藏）下真正要展示的列表：
  // 必须先筛选再切页 —— 否则分页额度会被「不匹配、只是 display:none」的卡片占掉，
  // 表现为：柚子社 13 个游戏只渲染出 3 个（其余散落在前 60 名之外，压根没进 DOM）。
  const filteredGames = useMemo(
    () =>
      sortedGames.filter(
        g =>
          matchesFilter(g, query, filter) &&
          (!showFavOnly || favs.includes(g.pathHash)) &&
          (!hideWeb || !g.notDownloaded),
      ),
    [sortedGames, query, filter, showFavOnly, favs, hideWeb],
  )
  const pagedGames = useMemo(() => filteredGames.slice(0, visibleLimit), [filteredGames, visibleLimit])

  // ③B：本地游戏数（用于「只看本地已有的」开关的显示判断）
  const localVisibleCount = useMemo(
    () => sortedGames.filter(g => !g.notDownloaded && matchesFilter(g, query, filter)).length,
    [sortedGames, query, filter],
  )

  const matchingCount = useMemo(() => {
    let n = 0
    for (let i = 0; i < sortedGames.length; i++) {
      const g = sortedGames[i]
      if (matchesFilter(g, query, filter) && (!showFavOnly || favs.includes(g.pathHash))) n++
    }
    return n
  }, [sortedGames, query, filter, showFavOnly, favs])

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
        <div className="absolute inset-0 bg-surface-0" />
        <div className="absolute -top-48 left-1/2 h-[420px] w-[820px] -translate-x-1/2 radius-pill bg-indigo-600/10 blur-[150px]" />
        <div className="absolute -left-40 top-1/3 h-[360px] w-[360px] radius-pill bg-fuchsia-600/[0.07] blur-[130px]" />
        <div className="absolute -right-40 bottom-0 h-[360px] w-[460px] radius-pill bg-violet-700/[0.07] blur-[140px]" />
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
      <main className="mx-auto max-w-[var(--content-max)] px-4 pb-24 pt-5 sm:px-6">
        {!lib.loaded && lib.games.length === 0 ? (
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 lg:[grid-template-columns:var(--rail-w)_minmax(0,1fr)] xl:[grid-template-columns:var(--rail-w)_minmax(0,1fr)_var(--aside-w)]">
            <div className="hidden lg:block">
              <div className="panel p-2">
                <div className="mb-2 h-16 radius-md skeleton" />
                <div className="space-y-1.5">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-7 radius-sm skeleton" />
                  ))}
                </div>
              </div>
            </div>
            <GridSkeleton count={12} density={density} />
            <div className="hidden xl:block">
              <div className="panel p-3">
                <div className="mb-3 h-14 radius-md skeleton" />
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-5 radius-xs skeleton" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : lib.games.length === 0 ? (
          <EmptyState onOpenSettings={() => setSettingsOpen(true)} scanning={lib.scanning} />
        ) : (
          <div
            className={`grid grid-cols-1 gap-x-6 gap-y-4 density-${density} ${
              railCompact
                ? 'lg:[grid-template-columns:3.25rem_minmax(0,1fr)] xl:[grid-template-columns:3.25rem_minmax(0,1fr)_var(--aside-w)]'
                : 'lg:[grid-template-columns:var(--rail-w)_minmax(0,1fr)] xl:[grid-template-columns:var(--rail-w)_minmax(0,1fr)_var(--aside-w)]'
            }`}
          >
            {/* 吸顶线取「顶栏高度 + 1px 边框」：与侧栏在页面里的自然位置对齐，
                滚动时不会先跟着移动几像素再钉住（此前用 0.75rem，缩放后会有约 8px 位移） */}
            <aside className="hidden lg:sticky lg:top-[calc(var(--header-h)+1px)] lg:block lg:max-h-[calc(100vh-var(--header-h)-0.5rem)] lg:self-start lg:overflow-y-auto overscroll-contain">
              <LeftRail
                games={lib.games}
                companies={companies}
                companyData={companyData}
                filter={filter}
                setFilter={next => {
                  setFilter(next)
                  if (next.kind === 'dev' && next.name && !companyData[next.name]) void fetchCompany(next.name)
                }}
                devSortDesc={devSortDesc}
                setDevSortDesc={setDevSortDesc}
                favs={favs}
                completedGames={completedGames}
                totalMinutes={totalMinutes}
                showFavOnly={showFavOnly}
                onToggleFavOnly={() => setShowFavOnly(v => !v)}
                compact={railCompact}
                onToggleCompact={toggleRailCompact}
              />
            </aside>
            <section className="min-w-0">
              <div className="mb-3 space-y-1.5 lg:hidden">
                <div className="flex gap-2 overflow-x-auto pb-0.5">
                  <FilterChip active={filter.kind === 'all'} onClick={() => setFilter({ kind: 'all' })}>
                    全部 {lib.games.length}
                  </FilterChip>
                  {filter.kind === 'dev' && (
                    <FilterChip active onClick={() => {}}>
                      {filter.name}
                    </FilterChip>
                  )}
                  {favs.length > 0 && (
                    <FilterChip
                      active={showFavOnly}
                      onClick={() => setShowFavOnly(v => !v)}
                    >
                      ★ 收藏 {favs.length}
                    </FilterChip>
                  )}
                  <FilterChip active={chipExpand} onClick={() => setChipExpand(v => !v)}>
                    {chipExpand ? '收起厂商' : `厂商 · ${companies.length}`}
                  </FilterChip>
                </div>
                {chipExpand && (
                  <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto overscroll-contain pr-0.5">
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
                            setChipExpand(false)
                            if (!companyData[name]) void fetchCompany(name)
                          }}
                        >
                          {name} {label}
                        </FilterChip>
                      )
                    })}
                  </div>
                )}
              </div>
              {/* 吸顶工具条：结果数 + 排序 + 仅收藏 + 密度（滚动时始终可见） */}
              <div className="sticky top-[var(--header-h-mobile,var(--header-h))] z-20 mb-3 flex flex-wrap items-center gap-2 border-b border-hairline bg-surface-0 py-2 sm:top-[var(--header-h)] sm:flex-nowrap sm:gap-3">
                <div className="flex min-w-0 items-baseline gap-2">
                  <h2 className="truncate text-[0.9375rem] font-semibold text-primary">
                    {filter.kind === 'dev' ? filter.name : '全部游戏'}
                  </h2>
                  <span className="shrink-0 text-[0.8125rem] tabular-nums text-tertiary">
                    {matchingCount > pagedGames.length ? (
                      <>
                        已显示 {pagedGames.length} / {matchingCount} 个
                      </>
                    ) : (
                      <>{matchingCount} 个</>
                    )}
                  </span>
                  {lib.scraping ? (
                    <span className="hidden shrink-0 items-center gap-1.5 text-[0.8125rem] text-accent sm:inline-flex">
                      <Spinner className="h-3 w-3" /> 获取信息中 {lib.progress.done}/{lib.progress.total}
                    </span>
                  ) : fetchingCompanies > 0 ? (
                    <span
                      className="hidden shrink-0 items-center gap-1.5 text-[0.8125rem] text-quaternary sm:inline-flex"
                      title="正在后台补齐各厂商的未下载作品数量"
                    >
                      <Spinner className="h-3 w-3" /> 补齐厂商 {companies.length - fetchingCompanies}/{companies.length}
                    </span>
                  ) : null}
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <span className="segment">
                    <button
                      title="按名称排序"
                      onClick={() => setSortMode('title')}
                      className={`segment-item ${sortMode === 'title' ? 'segment-item-active' : ''}`}
                    >
                      名称
                    </button>
                    <button
                      title="按发售日排序"
                      onClick={() => setSortMode('release')}
                      className={`segment-item ${sortMode === 'release' ? 'segment-item-active' : ''}`}
                    >
                      发售日
                    </button>
                  </span>
                  <button
                    title={showFavOnly ? '显示全部游戏' : '仅显示收藏'}
                    aria-pressed={showFavOnly}
                    onClick={() => setShowFavOnly(e => !e)}
                    className={`icon-btn hidden h-8 w-8 border sm:flex ${
                      showFavOnly ? 'border-accent-soft bg-accent-soft text-warn' : 'border-hairline bg-sunken'
                    }`}
                  >
                    <Icon name="star" className="h-4 w-4" />
                  </button>
                  <span
                    className="segment"
                    title="卡片密度"
                    data-density-group={density}
                  >
                    {(['compact', 'cozy', 'large'] as const).map(d => (
                      <button
                        key={d}
                        title={`卡片密度：${DENSITY_LABEL[d]}`}
                        onClick={() => changeDensity(d)}
                        className={`segment-item ${density === d ? 'segment-item-active' : ''}`}
                      >
                        <span className="hidden md:inline">{DENSITY_LABEL[d]}</span>
                        <span className="md:hidden">{DENSITY_LABEL[d].slice(0, 1)}</span>
                      </button>
                    ))}
                  </span>
                </div>
              </div>
              {matchingCount === 0 && (!webList || webList.length === 0) ? (
                <div className="py-24 text-center text-[0.875rem] text-tertiary">
                  {lib.search ? `没有匹配「${lib.search}」的游戏` : '该分组下暂无游戏'}
                </div>
              ) : (
                <div
                  className="grid min-w-0 justify-start"
                  style={{
                    gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, var(--density-min)), 1fr))`,
                    columnGap: 'var(--density-gap)',
                    rowGap: 'calc(var(--density-gap) * 1.2)',
                  }}
                >
                  {pagedGames.map(g => (
                    <div key={g.pathHash}>
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
                  {matchingCount > 0 && (
                    <div className="col-span-full mt-1 flex items-center gap-3 text-[0.75rem] text-quaternary">
                      <span className="h-px flex-1 bg-hairline" />
                      <span className="shrink-0" title={hideWeb ? '已隐藏未下载的作品' : `本地已有 ${localVisibleCount} 个`}>
                        本地已有 · {localVisibleCount}
                      </span>
                      {hideWeb ? (
                        <button
                          onClick={() => setHideWeb(false)}
                          className="shrink-0 text-accent transition hover:underline"
                          title="把该会社在 VNDB 上、你还没下载的作品也显示出来"
                        >
                          显示未下载的作品
                        </button>
                      ) : null}
                      <span className="h-px flex-1 bg-hairline" />
                    </div>
                  )}
                  {!hideWeb && webList && webList.length > 0 && (
                    <>
                      <div className="col-span-full mt-1 flex items-center gap-3 text-[0.75rem] text-quaternary">
                        <span className="h-px flex-1 bg-hairline" />
                        <span className="shrink-0" title="来自 VNDB 的该会社作品，你本地还没有">
                          未下载 · {webList.length}
                        </span>
                        <button
                          onClick={() => setHideWeb(true)}
                          className="shrink-0 text-accent transition hover:underline"
                          title="隐藏这些未下载的卡片，只看本地已有的"
                        >
                          只看本地已有的
                        </button>
                        <button
                          title="重新获取该会社的未下载列表"
                          onClick={() => void fetchCompany(filter.name!, true)}
                          className="icon-btn h-6 shrink-0 gap-1 px-1.5 text-[0.75rem]"
                        >
                          <Icon name="refresh" className="h-3 w-3" />
                          刷新
                        </button>
                        <span className="h-px flex-1 bg-hairline" />
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
                  {matchingCount > visibleLimit && (
                    <div className="col-span-full flex flex-col items-center gap-2 pt-2">
                      <button
                        onClick={() => setVisibleLimit(n => n + PAGE_STEP)}
                        className="btn btn-md btn-soft"
                      >
                        再显示 {Math.min(PAGE_STEP, matchingCount - visibleLimit)} 个
                        <span className="text-tertiary">
                          （剩余 {matchingCount - visibleLimit}）
                        </span>
                      </button>
                      <button
                        onClick={() => setVisibleLimit(matchingCount)}
                        className="text-[0.8125rem] text-tertiary underline decoration-dotted underline-offset-4 transition hover:text-primary"
                      >
                        一次显示全部 {matchingCount} 个
                      </button>
                    </div>
                  )}
                </div>
              )}
              {filter.kind === 'dev' && (!webList || webList.length === 0) && (
                <div className="mt-2 flex flex-col items-center gap-2 py-8">
                  <p className="text-[0.8125rem] text-tertiary">
                    {companyData[filter.name!] === null
                      ? '未下载游戏加载失败，请检查网络或代理设置后重试'
                      : companyData[filter.name!] && Array.isArray(companyData[filter.name!]!.games) && companyData[filter.name!]!.games.length === 0
                        ? '未找到该会社的其他未下载游戏'
                        : '正在获取该会社的未下载列表…'}
                  </p>
                  <button
                    title="重新获取该会社的未下载列表"
                    onClick={() => void fetchCompany(filter.name!, true)}
                    className="btn btn-sm bg-accent-soft text-accent"
                  >
                    <Icon name="refresh" className="h-3.5 w-3.5" />
                    重新获取
                  </button>
                </div>
              )}
            </section>
            <aside className="hidden xl:sticky xl:top-[calc(var(--header-h)+1px)] xl:block xl:max-h-[calc(100vh-var(--header-h)-0.5rem)] xl:self-start xl:overflow-y-auto overscroll-contain">
              <div className="space-y-3">
                {/* 统计摘要：三个数字一行，替掉原来「三块盒子叠起来」的松散结构 */}
                <div className="panel overflow-hidden">
                  <div className="px-4 py-3">
                    <p className="section-label">总计游玩时长</p>
                    <p className="mt-1 text-[1.75rem] font-bold leading-none tabular-nums text-primary">
                      {formatDurationCompact(totalMinutes)}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 border-t border-hairline">
                    <div className="px-3 py-2.5">
                      <p className="section-label">游戏</p>
                      <p className="mt-0.5 text-[0.9375rem] font-semibold tabular-nums text-primary">
                        {lib.games.length}
                      </p>
                    </div>
                    <div className="border-l border-hairline px-3 py-2.5">
                      <p className="section-label">通关</p>
                      <p className="mt-0.5 text-[0.9375rem] font-semibold tabular-nums text-warn">
                        {completedGames.length}
                      </p>
                    </div>
                    <div className="border-l border-hairline px-3 py-2.5">
                      <p className="section-label">收藏</p>
                      <p className="mt-0.5 text-[0.9375rem] font-semibold tabular-nums text-accent">
                        {favs.length}
                      </p>
                    </div>
                  </div>
                </div>
                {/* 最近启动 / 已通关 合到一块，用分段控件切换：不再各占一块、各自滚动 */}
                <div className="panel overflow-hidden">
                  <div className="flex items-center gap-2 border-b border-hairline px-3 py-2">
                    <span className="segment max-w-full flex-nowrap">
                      <button
                        onClick={() => setAsideTab('recent')}
                        title="按最近启动时间排序"
                        className={`segment-item whitespace-nowrap ${asideTab === 'recent' ? 'segment-item-active' : ''}`}
                      >
                        最近
                      </button>
                      <button
                        onClick={() => setAsideTab('completed')}
                        title={`已通关 ${completedGames.length} 个`}
                        className={`segment-item whitespace-nowrap ${asideTab === 'completed' ? 'segment-item-active' : ''}`}
                      >
                        已通关 {completedGames.length}
                      </button>
                    </span>
                  </div>
                  <div className="p-2">
                    {asideTab === 'recent' ? (
                      recent.length ? (
                        <div className="max-h-[380px] space-y-0.5 overflow-y-auto overscroll-contain pr-0.5">
                          {recent.map(g => (
                            <div
                              key={g.pathHash}
                              className="group flex w-full cursor-pointer items-center gap-2 radius-sm px-2 py-1.5 transition hover:bg-hoverable"
                            >
                              <button
                                onClick={() => lib.setSelectedHash(g.pathHash)}
                                className="min-w-0 flex-1 truncate text-left text-[0.8125rem] text-secondary transition group-hover:text-primary"
                                title={displayTitle(g)}
                              >
                                {displayTitle(g)}
                              </button>
                              <span className="shrink-0 text-[0.75rem] tabular-nums text-quaternary">
                                {relativeTime(g.lastPlayed)}
                              </span>
                              <button
                                onClick={() => void lib.launch(g)}
                                title={'启动 ' + displayTitle(g)}
                                aria-label={'启动 ' + displayTitle(g)}
                                className="icon-btn h-6 w-6 shrink-0 bg-sunken hover:!bg-success-soft hover:!text-success"
                              >
                                <Icon name="play" className="h-3 w-3 fill-current" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="py-3 text-center text-[0.8125rem] text-quaternary">暂无启动记录</p>
                      )
                    ) : completedGames.length ? (
                      <div className="max-h-[380px] space-y-0.5 overflow-y-auto overscroll-contain pr-0.5">
                        {completedGames.map((g, i) => (
                          <button
                            key={g.pathHash}
                            onClick={() => lib.setSelectedHash(g.pathHash)}
                            className="group flex w-full items-center gap-2 radius-sm px-2 py-1.5 text-left transition hover:bg-hoverable"
                            title={displayTitle(g)}
                          >
                            <span className="relative h-8 w-6 shrink-0 overflow-hidden radius-xs bg-surface-3">
                              {g.customCover ?? g.metadata?.coverUrl ? (
                                <CoverImage url={g.customCover ?? g.metadata!.coverUrl!} alt="" />
                              ) : (
                                <CoverPlaceholder name={displayTitle(g)} />
                              )}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-secondary group-hover:text-primary">
                              {displayTitle(g)}
                            </span>
                            <span className="shrink-0 text-[0.75rem] tabular-nums text-quaternary">#{i + 1}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="py-3 text-center text-[0.8125rem] text-quaternary">暂无已通关游戏</p>
                    )}
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}
      </main>
      {lib.scraping && <ProgressToast done={lib.progress.done} total={lib.progress.total} />}
      {/* 回到顶部：滚动一屏后出现（移动端与长列表都用得上） */}
      {showBackTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="回到顶部"
          title="回到顶部"
          className="fixed bottom-5 right-4 z-40 flex h-11 w-11 items-center justify-center radius-pill border border-strong bg-surface-1 text-secondary shadow-token-md transition hover:text-primary sm:right-6"
        >
          <Icon name="arrowUp" className="h-5 w-5" />
        </button>
      )}
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
