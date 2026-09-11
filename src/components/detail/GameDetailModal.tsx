'use client'

// 由 page.tsx 拆分而来（行为与拆分前逐字一致，仅位置与导入变化）

import { useEffect, useRef, useState } from 'react'
import { Icon, Spinner } from '@/components/icons'
import { useToast } from '@/components/toast'
import { CoverImage, CoverPlaceholder } from '@/components/ui/primitives'
import {
  ACT_GROUPS,
  ACT_SECTIONS,
  CANDIDATE_SOURCES,
  DESC_SOURCES,
  SOURCE_LABELS,
  devName,
  displayTitle,
  formatDuration,
  formatRelease,
  isNsfwBlurEnabled,
  isNsfwGame,
  stripVndbTags,
  toastProxyFallback,
  type CharacterEntry,
  type CoverItem,
  type ExeItem,
  type Game,
  type SearchCandidate,
  type SourceGroup,
  type WebCustomPatch,
} from '@/lib/ui-shared'
import { ClockIcon, SearchCandidateRow, SectionRow } from '@/components/ui/primitives'

export function GameDetailModal({
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
  onCnDescription?: (game: Game, description: string, source?: string) => void
  onRelocate: (game: Game, path: string) => Promise<{ ok: boolean; title?: string; error?: string }>
  onSetWebCustom: (hash: string, patch: WebCustomPatch) => void
  onSetCompleted?: (hash: string, completed: boolean) => void
  nsfwOff?: boolean
  onToggleNsfw?: () => void
}) {
  const [rescrapeBusy, setRescrapeBusy] = useState(false)
  const [launchBusy, setLaunchBusy] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [searchSource, setSearchSource] = useState('all')
  const [fixQuery, setFixQuery] = useState('')
  const [fixCandidates, setFixCandidates] = useState<SearchCandidate[] | null>(null)
  const [fixAllResults, setFixAllResults] = useState<SourceGroup[] | null>(null)
  const [fixBusy, setFixBusy] = useState(false)
  const [fixError, setFixError] = useState<string | null>(null)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [coverList, setCoverList] = useState<CoverItem[] | null>(null)
  const [coverLoading, setCoverLoading] = useState(false)
  const [coverSort, setCoverSort] = useState<'date' | 'res'>('date')
  const [coverShowAll, setCoverShowAll] = useState(false)
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
  const n18 = !!game && isNsfwBlurEnabled() && isNsfwGame(game) && !nsfwOff
  const title = game ? displayTitle(game) : ''
  const officialCnTitle =
    game && metadata?.officialCnTitle && metadata.officialCnTitle !== title ? metadata.officialCnTitle : null
  const coverUrl = game ? game.customCover ?? metadata?.coverUrl ?? undefined : undefined
  const completed = game?.completed === true
  const dev = game ? devName(game) : undefined
  const ratingDisplay = metadata?.rating != null && metadata.rating > 0 ? (metadata.rating / 10).toFixed(2) : null
  const duration = formatDuration(game?.playtimeMinutes)
  // 简介原文（用来填编辑框，别用裁剪过的显示版本，否则一编辑就把换行/方括号弄丢）
  const rawDescription = metadata?.cnDescription ?? metadata?.description ?? ''
  // 手动改过的简介原样显示；抓来的先去 VNDB 标签（保留换行）
  const description =
    metadata?.cnDescriptionSource === 'manual'
      ? metadata?.cnDescription ?? ''
      : metadata?.cnDescription
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
          if (json.ok) onCnDescription?.(game, json.description ?? '', json.source ?? undefined)
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

  // 设置面板改为「左侧分组导航 + 右侧内容」：同时只展开一个分组
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(['cover', 'fix', 'exe', 'dev', 'path', 'char']),
  )

  const toggleSection = (key: string) => {
    const willExpand = collapsed.has(key)
    // 已经展开的分组再点一次不收起（设置面板是单选导航，收起会让右侧空着）
    if (!willExpand) return
    setCollapsed(new Set(ACT_SECTIONS.filter(k => k !== key)))
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

  // 封面列表排序：最新发行（接口默认顺序）/ 最高分辨率
  const coversSorted: CoverItem[] = (() => {
    const list = coverList ?? []
    if (coverSort === 'date') return list
    return [...list].sort(
      (a, b) =>
        (b.dims?.[0] ?? 0) * (b.dims?.[1] ?? 0) - (a.dims?.[0] ?? 0) * (a.dims?.[1] ?? 0),
    )
  })()
  const COVER_PREVIEW_N = 6
  const coversShown = coverShowAll ? coversSorted : coversSorted.slice(0, COVER_PREVIEW_N)

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

  const [detailTab, setDetailTab] = useState<'intro' | 'characters'>('intro')
  // 简介折叠：默认只显示 14 行，避免长简介把弹窗顶到高度上限、左栏留一大片空白
  const [descOpen, setDescOpen] = useState(false)
  const [descOverflow, setDescOverflow] = useState(false)
  const descRef = useRef<HTMLParagraphElement>(null)
  // 简介：手动编辑 + 手动指定来源
  const [descEditing, setDescEditing] = useState(false)
  const [descDraft, setDescDraft] = useState('')
  const [descSourceMenu, setDescSourceMenu] = useState(false)
  const [descBusy, setDescBusy] = useState(false)
  // 换游戏时收起 / 退出编辑
  useEffect(() => {
    setDescOpen(false)
    setDescEditing(false)
    setDescSourceMenu(false)
    setCoverShowAll(false)
    setCoverSort('date')
  }, [game?.pathHash])
  // 折叠态下量一次是否真的溢出，只有真的溢出才挂「展开全部」
  useEffect(() => {
    if (descOpen || descEditing || detailTab !== 'intro') return
    const el = descRef.current
    if (!el) return
    const id = window.requestAnimationFrame(() => setDescOverflow(el.scrollHeight > el.clientHeight + 1))
    return () => window.cancelAnimationFrame(id)
  }, [description, descOpen, descEditing, detailTab])

  const descSource = metadata?.cnDescriptionSource
  const descSourceLabel =
    descSource === 'manual' ? '手动' : descSource ? SOURCE_LABELS[descSource] ?? descSource : '自动'

  /** 保存手动编辑的简介（source='manual'，重新刮削不会覆盖） */
  const saveCnDescription = async () => {
    if (!game) return
    setDescBusy(true)
    try {
      const text = descDraft.trim()
      const resp = await fetch('/api/cn-description', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: game.folderName, hash: game.pathHash, description: text, source: 'manual' }),
      })
      const json = await resp.json().catch(() => null)
      if (!resp.ok || !json?.ok) throw new Error(json?.error ?? '保存失败')
      onCnDescription?.(game, text, 'manual')
      setDescEditing(false)
      push(text ? '简介已保存（标记为手动，重新刮削不会覆盖）' : '已清空简介', 'success')
    } catch (e) {
      push(e instanceof Error ? e.message : '保存失败', 'error')
    } finally {
      setDescBusy(false)
    }
  }

  /** 手动指定来源重新抓取；source 为空 = 走自动顺序 */
  const refetchCnDescription = async (source: '' | (typeof DESC_SOURCES)[number]) => {
    if (!game) return
    setDescSourceMenu(false)
    setDescBusy(true)
    try {
      const qs = new URLSearchParams({
        name: game.folderName,
        hash: game.pathHash,
        title: game.metadata?.title ?? '',
      })
      if (source) qs.set('source', source)
      else qs.set('force', '1')
      const resp = await fetch(`/api/cn-description?${qs.toString()}`)
      const json = await resp.json().catch(() => null)
      if (!json?.ok) throw new Error(json?.error ?? '获取失败')
      if (!json.description) {
        push(
          source ? `${SOURCE_LABELS[source] ?? source} 没有取到中文简介，已保留原内容` : '没有取到中文简介',
          'info',
        )
        return
      }
      const hit = typeof json.source === 'string' && json.source ? json.source : source || undefined
      onCnDescription?.(game, json.description, hit)
      push(`简介已更新（${hit ? SOURCE_LABELS[hit] ?? hit : '自动'}）`, 'success')
    } catch (e) {
      push(e instanceof Error ? e.message : '获取失败', 'error')
    } finally {
      setDescBusy(false)
    }
  }

  const infoChips = (
    <>
      <span className="rounded-lg bg-sunken px-2 py-1 text-secondary">发售 {formatRelease(metadata?.released)}</span>
      {ratingDisplay && (
        <span className="rounded-lg bg-warn-soft px-2 py-1 text-warn">
          ★ {ratingDisplay}
          {metadata?.votecount ? `（${metadata.votecount.toLocaleString()}票）` : ''}
        </span>
      )}
      {dev && (
        <span
          className="max-w-[160px] truncate rounded-lg bg-sunken px-2 py-1 text-secondary"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      {/* ②A：高度按内容自适应，上限 92vh；内容短的标签页弹窗就矮下来，不再留大片空白 */}
      <div className="relative flex max-h-[92vh] min-h-0 w-full max-w-6xl flex-col overflow-hidden radius-2xl border border-strong bg-surface-1 shadow-token-lg animate-scale-in">
        {/* 顶部：标题 + 元数据 + 主操作（主操作不再藏在设置面板里） */}
        <div className="flex shrink-0 flex-wrap items-start gap-x-3 gap-y-2 border-b border-hairline px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="min-w-0 text-[1.25rem] font-bold leading-snug text-primary">{title}</h2>
              {nd ? (
                <span className="radius-xs bg-sunken px-1.5 py-0.5 text-[0.6875rem] text-tertiary">未下载</span>
              ) : (
                <button
                  onClick={() => onSetCompleted?.(v.pathHash, !completed)}
                  title={completed ? '标记为未通关' : '标记为已通关'}
                  className={`radius-xs px-1.5 py-0.5 text-[0.6875rem] font-medium transition ${
                    completed
                      ? 'bg-success-soft text-success'
                      : 'bg-sunken text-tertiary hover:bg-hoverable hover:text-primary'
                  }`}
                >
                  {completed ? '✓ 已通关' : '标记通关'}
                </button>
              )}
            </div>
            <p className="mt-0.5 truncate text-[0.8125rem] text-tertiary" title={officialCnTitle ?? metadata?.originalTitle ?? ''}>
              {officialCnTitle ? `官方中文标题：${officialCnTitle}` : metadata?.originalTitle && metadata.originalTitle !== title ? metadata.originalTitle : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={() => void doLaunch()}
              disabled={nd || !currentExe || launchBusy}
              title={nd ? '该游戏尚未下载到本地' : currentExe ? '启动游戏' : '未找到可启动的 exe'}
              className="btn btn-md btn-success"
            >
              {launchBusy ? <Spinner className="h-4 w-4" /> : <Icon name="play" className="h-4 w-4 fill-current" />}
              {nd ? '未下载' : '启动'}
            </button>
            <button
              onClick={() => onOpenFolder?.(v)}
              disabled={nd}
              title="打开所在文件夹"
              aria-label="打开所在文件夹"
              className="btn btn-md btn-soft px-2.5"
            >
              <Icon name="folder" className="h-4 w-4" />
            </button>
            <button
              onClick={() => void doRescrape()}
              disabled={nd || rescrapeBusy || v.status === 'scraping'}
              title="重新从数据源获取信息"
              aria-label="重新获取信息"
              className="btn btn-md btn-soft px-2.5"
            >
              {rescrapeBusy || v.status === 'scraping' ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <Icon name="refresh" className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={() => setManageOpen(true)}
              title="更多设置：手动匹配、封面、可执行文件、标题与厂商"
              aria-label="更多设置"
              className="btn btn-md btn-soft px-2.5"
            >
              <Icon name="settings" className="h-4 w-4" />
            </button>
            <button onClick={onClose} aria-label="关闭" title="关闭" className="icon-btn h-9 w-9 radius-pill">
              <Icon name="x" className="h-[1.125rem] w-[1.125rem]" />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
          {/* ③B：左栏只保留封面 + 关键信息（路径与启动文件已移到右栏），不再需要下滑 */}
          <div className="flex min-h-0 shrink-0 flex-col overflow-y-auto border-hairline p-4 md:w-[22rem] md:self-stretch md:border-r">
            <div className="relative mx-auto w-full max-w-[16rem] overflow-hidden radius-lg bg-surface-3">
              {coverUrl ? (
                <CoverImage
                  url={coverUrl}
                  alt={title}
                  fit="natural"
                  className={`${nd ? 'grayscale' : ''}${n18 ? ' r18-blur' : ''}`}
                />
              ) : (
                <div className="aspect-[3/4] w-full">
                  <CoverPlaceholder name={title} />
                </div>
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
                    className="pointer-events-auto radius-sm text-on-overlay"
                    style={{
                      fontSize: '0.9375rem',
                      fontWeight: 800,
                      letterSpacing: '0.22em',
                      backgroundColor: 'rgba(0,0,0,0.6)',
                      padding: '5px 14px 5px 18px',
                    }}
                  >
                    NSFW
                  </button>
                </div>
              )}
              {v.status === 'scraping' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
                  <Spinner className="h-6 w-6" />
                </div>
              )}
            </div>

            {/* 关键信息：评分 / 厂商 / 发售日 / 时长 / 游玩次数（mt-auto：贴到左栏底部，把多余高度让成中间留白） */}
            <div className="mt-auto grid grid-cols-2 gap-1.5 pt-4">
              <div className="panel-flat px-2.5 py-2">
                <p className="text-[0.6875rem] text-quaternary">评分</p>
                <p className="mt-0.5 truncate text-[0.875rem] font-semibold text-warn" title={metadata?.votecount ? `${metadata.votecount.toLocaleString()} 票` : ''}>
                  {ratingDisplay ? `★ ${ratingDisplay}` : '—'}
                </p>
              </div>
              <div className="panel-flat px-2.5 py-2">
                <p className="text-[0.6875rem] text-quaternary">发售日</p>
                <p className="mt-0.5 truncate text-[0.875rem] font-semibold text-primary">
                  {formatRelease(metadata?.released)}
                </p>
              </div>
              <div className="panel-flat col-span-2 px-2.5 py-2">
                <p className="text-[0.6875rem] text-quaternary">厂商</p>
                <p
                  className="mt-0.5 truncate text-[0.875rem] font-semibold text-primary"
                  title={metadata?.developers?.length ? `刮削到：${metadata.developers.join(' / ')}` : undefined}
                >
                  {dev ?? '未知'}
                  {v.customDeveloper ? '（手动）' : ''}
                </p>
              </div>
              <div className="panel-flat col-span-2 flex items-center gap-3 px-2.5 py-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <ClockIcon className="h-3.5 w-3.5 shrink-0 text-success" />
                  <span className="text-[0.875rem] font-semibold text-primary">{duration ?? '暂无记录'}</span>
                </span>
                {v.playSessions ? (
                  <span className="shrink-0 text-[0.75rem] text-tertiary">{v.playSessions} 次游玩</span>
                ) : null}
                <span className="ml-auto shrink-0 text-[0.75rem] text-quaternary">
                  {v.fileCount ? `${v.fileCount} 个文件` : ''}
                </span>
              </div>
            </div>

            {/* 路径与可执行文件已移到右栏（③B），此处不再重复 */}
          </div>

          {/* 右栏：简介 / 角色与声优，用标签页切换（不再套两层滚动） */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center gap-2 border-b border-hairline px-4 py-2 sm:px-5">
              <span className="segment">
                <button
                  onClick={() => setDetailTab('intro')}
                  className={`segment-item ${detailTab === 'intro' ? 'segment-item-active' : ''}`}
                >
                  简介
                  {metadata?.cnDescription ? <span className="ml-1 text-[0.6875rem] text-success">中文</span> : null}
                </button>
                <button
                  onClick={() => setDetailTab('characters')}
                  className={`segment-item ${detailTab === 'characters' ? 'segment-item-active' : ''}`}
                >
                  角色与声优
                  {characters && characters.length > 0 ? (
                    <span className="ml-1 text-[0.6875rem] text-quaternary">{characters.length}</span>
                  ) : charLoading ? (
                    <Spinner className="ml-1 h-3 w-3" />
                  ) : null}
                </button>
              </span>
              {/* 简介：手动选源 + 手动编辑（铅笔）。只在「简介」页签出现 */}
              {detailTab === 'intro' && (
                <div className="relative flex items-center gap-1">
                  <button
                    onClick={() => setDescSourceMenu(v => !v)}
                    disabled={descBusy}
                    title="选择中文简介的来源（会重新抓取）"
                    className="btn btn-sm btn-soft gap-1 px-2 text-[0.75rem]"
                  >
                    {descSourceLabel}
                    {descBusy ? (
                      <Spinner className="h-3 w-3" />
                    ) : (
                      <Icon name="down" className="h-3 w-3" />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      if (descEditing) {
                        setDescEditing(false)
                        return
                      }
                      setDescDraft(rawDescription)
                      setDescEditing(true)
                    }}
                    disabled={descBusy}
                    title={descEditing ? '取消编辑' : '手动修改简介'}
                    aria-label={descEditing ? '取消编辑' : '手动修改简介'}
                    className="icon-btn h-7 w-7"
                  >
                    <Icon name={descEditing ? 'x' : 'pencil'} className="h-3.5 w-3.5" />
                  </button>
                  {descSourceMenu && (
                    <>
                      <div className="fixed inset-0 z-[1]" onClick={() => setDescSourceMenu(false)} />
                      <div className="absolute left-0 top-8 z-[2] w-52 overflow-hidden radius-md border border-strong bg-surface-1 py-1 shadow-token-lg">
                        <button
                          onClick={() => void refetchCnDescription('')}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.8125rem] text-secondary transition hover:bg-hoverable hover:text-primary"
                        >
                          自动（推荐顺序）
                          {!descSource ? <Icon name="check" className="ml-auto h-3.5 w-3.5 text-accent" /> : null}
                        </button>
                        <div className="my-1 h-px bg-hairline" />
                        {DESC_SOURCES.map(s => (
                          <button
                            key={s}
                            onClick={() => void refetchCnDescription(s)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.8125rem] text-secondary transition hover:bg-hoverable hover:text-primary"
                          >
                            {SOURCE_LABELS[s] ?? s}
                            {descSource === s ? <Icon name="check" className="ml-auto h-3.5 w-3.5 text-accent" /> : null}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
              {metadata?.vndbUrl && (
                <a
                  href={metadata.vndbUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto inline-flex items-center gap-1 text-[0.8125rem] text-tertiary transition hover:text-primary"
                >
                  {metadata.source ? SOURCE_LABELS[metadata.source] ?? 'VNDB' : 'VNDB'}
                  <Icon name="external" className="h-3 w-3" />
                </a>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
              {detailTab === 'intro' ? (
                descEditing ? (
                  <div className="flex h-full min-h-0 flex-col gap-2">
                    <textarea
                      value={descDraft}
                      onChange={e => setDescDraft(e.target.value)}
                      placeholder="粘贴或撰写简介…"
                      spellCheck={false}
                      className="min-h-0 w-full flex-1 resize-none radius-md border border-strong bg-sunken px-3 py-2 text-[0.9375rem] leading-relaxed text-primary outline-none transition focus:border-accent-soft"
                    />
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <button onClick={() => void saveCnDescription()} disabled={descBusy} className="btn btn-sm btn-primary">
                        {descBusy ? <Spinner className="h-3.5 w-3.5" /> : null}
                        保存
                      </button>
                      <button onClick={() => setDescEditing(false)} disabled={descBusy} className="btn btn-sm btn-soft">
                        取消
                      </button>
                      <span className="text-[0.75rem] text-quaternary">保存后标记为「手动」，重新刮削不会覆盖</span>
                    </div>
                  </div>
                ) : description ? (
                  <>
                    {/* 折叠行数写死在类名里：Tailwind 只能扫描到字面量，不能拼字符串 */}
                    <p
                      ref={descRef}
                      className={`prose-cn whitespace-pre-line ${descOpen ? '' : 'line-clamp-[14]'}`}
                    >
                      {description}
                    </p>
                    {descOverflow || descOpen ? (
                      <button
                        onClick={() => setDescOpen(v => !v)}
                        className="mt-2 text-[0.8125rem] font-medium text-accent transition hover:underline"
                      >
                        {descOpen ? '收起' : '展开全部'}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
                    <p className="text-[0.9375rem] text-tertiary">暂无简介</p>
                    <button onClick={() => void doRescrape()} disabled={rescrapeBusy} className="btn btn-sm btn-soft">
                      <Icon name="refresh" className="h-3.5 w-3.5" />
                      重新获取信息
                    </button>
                  </div>
                )
              ) : (
                <div className="space-y-4">
                  {characters && characters.length > 0 ? (
                    <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">
                      {characters.map((c, i) => (
                        <div key={`${c.name}-${i}`} className="min-w-0">
                          <div className="relative aspect-[3/4] w-full overflow-hidden radius-lg bg-surface-3">
                            {c.image ? <CoverImage url={c.image} alt={c.name} /> : <CoverPlaceholder name={c.name || '?'} />}
                          </div>
                          <p className="mt-1.5 truncate text-[0.875rem] font-medium text-primary" title={c.name}>
                            {c.name}
                          </p>
                          <p className="truncate text-[0.8125rem] text-tertiary" title={c.cv ?? c.role ?? ''}>
                            {c.cv ? `CV: ${c.cv}` : c.role ?? '—'}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : charLoading ? (
                    <p className="text-[0.9375rem] text-tertiary">正在获取角色与声优…</p>
                  ) : (
                    <p className="text-[0.9375rem] text-tertiary">
                      未找到角色与声优数据，可在「设置 → 角色与声优」里换个数据源手动获取。
                    </p>
                  )}
                </div>
              )}
            </div>
            {/* ③B：路径与启动文件搬到右栏底部，与标签页内容一起滚动 */}
            <div className="shrink-0 space-y-2 border-t border-hairline px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem]">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Icon name="folder" className="h-3.5 w-3.5 shrink-0 text-quaternary" />
                  <span className="min-w-0 truncate text-tertiary" title={v.folderPath}>
                    {v.folderPath || '路径未知'}
                  </span>
                </span>
                <button
                  onClick={() => onOpenFolder?.(v)}
                  disabled={nd}
                  className="shrink-0 text-accent transition hover:underline disabled:opacity-40"
                >
                  打开文件夹
                </button>
                {v.fileCount ? (
                  <span className="shrink-0 text-quaternary">{v.fileCount} 个文件</span>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem]">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Icon name="play" className="h-3.5 w-3.5 shrink-0 text-quaternary" />
                  <span className="text-tertiary">启动文件</span>
                  <span className="min-w-0 truncate font-medium text-secondary" title={currentExe ?? ''}>
                    {currentExe ? currentExe.split(/[\\/]/).pop() : '未设置'}
                  </span>
                </span>
                {exeLoading ? (
                  <span className="shrink-0 text-quaternary">正在读取…</span>
                ) : exeError ? (
                  <span className="shrink-0 text-danger">{exeError}</span>
                ) : !nd ? (
                  <button
                    onClick={() => void scanExes()}
                    className="shrink-0 text-accent transition hover:underline"
                  >
                    {exeList ? '收起列表' : '更换'}
                  </button>
                ) : null}
              </div>
              {exeList && !exeLoading && (
                <div className="flex flex-wrap gap-1.5">
                  {exeList.length ? (
                    exeList.map(exe => (
                      <button
                        key={exe.path}
                        onClick={() => void pickExe(exe.path)}
                        className={`chip h-7 max-w-[16rem] text-[0.75rem] ${
                          exe.path === currentExe ? 'chip-active' : ''
                        }`}
                        title={exe.path}
                      >
                        <Icon name="play" className="h-3 w-3 shrink-0" />
                        <span className="truncate">{exe.name}</span>
                      </button>
                    ))
                  ) : (
                    <span className="text-[0.8125rem] text-quaternary">目录下没有找到 exe</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        {manageOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4">
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setManageOpen(false)} />
            <div className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden radius-2xl border border-strong bg-surface-1 shadow-token-lg animate-scale-in">
              <div className="flex shrink-0 items-center gap-2 border-b border-hairline px-4 py-3">
                <h3 className="text-[1rem] font-semibold text-primary">高级设置</h3>
                <span className="min-w-0 truncate text-[0.8125rem] text-tertiary">· {title}</span>
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => setManageOpen(false)}
                    aria-label="关闭设置"
                    className="icon-btn h-8 w-8 radius-pill"
                  >
                    <Icon name="x" className="h-4 w-4" />
                  </button>
                </span>
              </div>
              <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
                {/* 左：分组导航 */}
                <div className="shrink-0 border-b border-hairline p-2 sm:w-56 sm:border-b-0 sm:border-r">
                  <div className="flex gap-1 overflow-x-auto sm:block sm:space-y-2 sm:overflow-visible">
                    {ACT_GROUPS.map(g => (
                      <div key={g.title} className="sm:block">
                        <p className="hidden px-2.5 pb-1 pt-1.5 section-label sm:block">{g.title}</p>
                        <div className="flex gap-1 sm:block sm:space-y-0.5">
                          {g.items.map(item => {
                            const active = !collapsed.has(item.key)
                            return (
                              <button
                                key={item.key}
                                onClick={() => toggleSection(item.key)}
                                aria-current={active ? 'true' : undefined}
                                className={`flex shrink-0 items-center gap-2 radius-sm px-2.5 py-1.5 text-left text-[0.8125rem] transition sm:w-full ${
                                  active
                                    ? 'bg-accent-soft font-semibold text-accent'
                                    : 'text-secondary hover:bg-hoverable hover:text-primary'
                                }`}
                              >
                                <Icon name={item.icon} className="h-3.5 w-3.5 shrink-0" />
                                <span className="whitespace-nowrap">{item.label}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 hidden px-2.5 pb-1 text-[0.75rem] leading-relaxed text-quaternary sm:block">
                    所有修改即时保存
                  </p>
                </div>
                {/* 右：当前分组内容 */}
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
                  <div className="space-y-2.5">
                <div>
                <SectionRow
                  active={!collapsed.has('title')}
                  icon="book"
                  label="修改标题"
                  desc={v.customTitle ? '已自定义' : '官方中文标题优先'}
                  onClick={() => toggleSection('title')}
                />
                {!collapsed.has('title') && (
                  <div className="mt-1.5 panel-flat p-2.5">
                    <div className="flex gap-1.5">
                      <input
                        value={titleInput ?? displayTitle(v)}
                        onChange={e => setTitleInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !titleBusy && void saveTitle()}
                        placeholder="显示标题（优先级高于官方中文标题）"
                        className="min-w-0 flex-1 field h-8 px-2.5"
                      />
                      <button
                        onClick={() => void saveTitle()}
                        disabled={titleBusy}
                        className="btn btn-sm btn-primary shrink-0"
                      >
                        {titleBusy ? '保存中…' : '保存'}
                      </button>
                      {v.customTitle && (
                        <button
                          onClick={() => void handleSetTitle(v, '')}
                          className="btn btn-sm btn-ghost shrink-0 border-0"
                        >
                          恢复自动
                        </button>
                      )}
                    </div>
                    <p className="mt-1.5 text-[0.75rem] text-quaternary">显示优先级：手动标题 &gt; 官方中文标题 &gt; 自动标题</p>
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
                  <div className="mt-1.5 panel-flat p-2.5">
                    {coverLoading ? (
                      <div>
                        <p className="pb-2 text-[0.75rem] text-tertiary">正在加载封面列表…</p>
                        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                          {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i}>
                              <div className="aspect-[3/4] w-full animate-pulse radius-md bg-surface-3" />
                              <div className="mt-1 h-3 w-2/3 animate-pulse radius-xs bg-surface-3" />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : coverError ? (
                      <div className="flex items-center gap-2 py-1">
                        <p className="min-w-0 flex-1 text-[0.8125rem] text-danger">{coverError}</p>
                        <button onClick={() => void loadCovers()} className="btn btn-sm btn-soft shrink-0">
                          重试
                        </button>
                      </div>
                    ) : metadata?.vndbId ? (
                      coverList === null ? (
                        <button
                          onClick={() => void loadCovers()}
                          className="btn btn-sm btn-soft w-full"
                        >
                          加载 VNDB 全部封面
                        </button>
                      ) : coverList.length === 0 ? (
                        <p className="py-1 text-[0.8125rem] text-quaternary">该游戏没有其他封面</p>
                      ) : (
                        <div>
                          {/* 工具条：数量 + 排序 */}
                          <div className="flex flex-wrap items-center gap-2 pb-2">
                            <span className="text-[0.75rem] text-quaternary">
                              共 {coverList.length} 张
                              {coverList.length > COVER_PREVIEW_N && !coverShowAll
                                ? ` · 先显示 ${COVER_PREVIEW_N} 张`
                                : ''}
                            </span>
                            <span className="segment ml-auto">
                              <button
                                onClick={() => setCoverSort('date')}
                                className={`segment-item ${coverSort === 'date' ? 'segment-item-active' : ''}`}
                              >
                                最新发行
                              </button>
                              <button
                                onClick={() => setCoverSort('res')}
                                className={`segment-item ${coverSort === 'res' ? 'segment-item-active' : ''}`}
                              >
                                最高分辨率
                              </button>
                            </span>
                          </div>
                          {/* 网格：跟随弹窗自身滚动，不再套一层 max-h 滚动区 */}
                          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                            {coversShown.map(c => {
                              const current = (v.customCover ?? coverUrl) === c.url || c.isCurrent === true
                              const res = c.dims ? `${c.dims[0]}×${c.dims[1]}` : '尺寸未知'
                              const date = c.released && c.released !== 'TBA' ? c.released : '发行日未定'
                              return (
                                <button
                                  key={c.url}
                                  onClick={() => void pickCover(c.url)}
                                  title={`${date} ${c.relTitle ?? ''}`.trim()}
                                  className="group/cv min-w-0 text-left"
                                >
                                  <span
                                    className={`relative block aspect-[3/4] w-full overflow-hidden radius-md bg-surface-3 transition ${
                                      current
                                        ? 'shadow-[inset_0_0_0_2px_var(--success)]'
                                        : 'group-hover/cv:shadow-[inset_0_0_0_1px_var(--line-1)]'
                                    }`}
                                  >
                                    {/* 兜底：图没加载出来时显示占位，而不是一个黑洞 */}
                                    <CoverPlaceholder name={title} />
                                    <CoverImage url={c.url} alt={title} />
                                    {current && (
                                      <span className="absolute left-1.5 top-1.5 radius-xs bg-success px-1.5 py-0.5 text-[0.6875rem] font-medium text-on-overlay shadow-token-xs">
                                        当前
                                      </span>
                                    )}
                                  </span>
                                  <span className="mt-1 block truncate text-[0.75rem] text-tertiary" title={res}>
                                    <span className={current ? 'font-medium text-success' : ''}>{res}</span>
                                    <span className="text-quaternary"> · {date}</span>
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                          {!coverShowAll && coversSorted.length > COVER_PREVIEW_N && (
                            <button
                              onClick={() => setCoverShowAll(true)}
                              className="btn btn-sm btn-soft mt-2.5 w-full"
                            >
                              显示全部 {coversSorted.length} 张
                            </button>
                          )}
                          {coverShowAll && coversSorted.length > COVER_PREVIEW_N && (
                            <button
                              onClick={() => setCoverShowAll(false)}
                              className="btn btn-sm btn-ghost mt-2.5 w-full border-0"
                            >
                              收起
                            </button>
                          )}
                        </div>
                      )
                    ) : (
                      <p className="py-1 text-[0.8125rem] text-quaternary">
                        当前条目没有 VNDB 编号，可粘贴图片链接；或先在「修正条目」里匹配到 VNDB
                      </p>
                    )}
                    <div className="mt-2 flex gap-1.5">
                      <input
                        value={coverUrlInput}
                        onChange={e => setCoverUrlInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && void applyCoverUrl()}
                        placeholder="粘贴图片链接 http(s)://…"
                        className="min-w-0 flex-1 field h-8 px-2.5"
                      />
                      <button
                        onClick={() => void applyCoverUrl()}
                        className="btn btn-sm btn-primary shrink-0"
                      >
                        应用
                      </button>
                      {v.customCover && (
                        <button
                          onClick={() => void pickCover(null)}
                          className="btn btn-sm btn-ghost shrink-0 border-0"
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
                    <div className="mt-1.5 panel-flat p-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <select
                          value={searchSource}
                          onChange={e => {
                            setSearchSource(e.target.value)
                            setFixCandidates(null)
                            setFixAllResults(null)
                          }}
                          className="field h-8 w-auto px-2"
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
                          className="min-w-0 flex-1 field h-8 px-2.5"
                        />
                        <button
                          onClick={doFixSearch}
                          disabled={fixBusy}
                          className="btn btn-sm btn-primary shrink-0"
                        >
                          {fixBusy ? '搜索中…' : '搜索'}
                        </button>
                      </div>
                      {fixError && <p className="mb-2 mt-2 text-[0.8125rem] text-danger">{fixError}</p>}
                      {fixBusy && (
                        <div className="flex items-center justify-center gap-2 py-3 text-[0.8125rem] text-tertiary">
                          <Spinner className="h-3.5 w-3.5" /> 正在搜索数据源…
                        </div>
                      )}
                      {!fixBusy && searchSource === 'all' && fixAllResults !== null && (fixAllResults.every(g => g.candidates.length === 0) ? (
                        <p className="py-2 text-center text-[0.8125rem] text-quaternary">五个数据源都未找到结果，换个关键词试试</p>
                      ) : (
                        <div className="max-h-44 space-y-2 overflow-y-auto">
                          {fixAllResults.map(g =>
                            g.candidates.length === 0 ? null : (
                              <div key={g.source}>
                                <p className="mb-1 flex items-center gap-1.5 text-[0.75rem] font-medium text-tertiary">
                                  {SOURCE_LABELS[g.source]}
                                  <span className="text-quaternary">({g.candidates.length})</span>
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
                            <p className="text-[0.75rem] text-warn">
                              部分数据源（VNDB/Bangumi）响应超时未返回，可单独切换该源重试
                            </p>
                          )}
                        </div>
                      ))}
                      {!fixBusy && searchSource !== 'all' && fixCandidates !== null && (fixCandidates.length === 0 ? (
                        <p className="py-2 text-center text-[0.8125rem] text-quaternary">未找到结果，换个关键词或数据源试试</p>
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
                    <div className="mt-1.5 panel-flat p-2.5">
                      {v.folderPath ? (
                        exeLoading ? (
                          <div className="flex items-center justify-center gap-2 py-3 text-[0.8125rem] text-tertiary">
                            <Spinner className="h-3.5 w-3.5" /> 正在扫描可执行文件…
                          </div>
                        ) : exeError ? (
                          <p className="py-1 text-[0.8125rem] text-danger">{exeError}</p>
                        ) : exeList === null ? (
                          <button
                            onClick={() => void scanExes()}
                            className="btn btn-sm btn-soft w-full"
                          >
                            浏览文件夹内的可执行文件…
                          </button>
                        ) : exeList.length === 0 ? (
                          <p className="py-1 text-[0.8125rem] text-quaternary">未找到任何 .exe/.bat/.cmd 文件</p>
                        ) : (
                          <div className="max-h-44 space-y-1 overflow-y-auto">
                            {exeList.map(e => (
                              <button
                                key={e.path}
                                onClick={() => void pickExe(e.path)}
                                className={`flex w-full items-center gap-2 radius-sm px-2 py-1.5 text-left text-[0.8125rem] transition hover:bg-hoverable ${
                                  currentExe === e.path ? 'bg-success-soft text-success' : 'text-secondary'
                                }`}
                              >
                                <Icon name="play" className="h-3 w-3 shrink-0" />
                                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                                <span className="shrink-0 truncate text-[0.75rem] text-quaternary">{e.rel ?? ''}</span>
                                {currentExe === e.path && <span className="text-[0.75rem] text-success">当前</span>}
                              </button>
                            ))}
                          </div>
                        )
                      ) : (
                        <p className="py-1 text-[0.8125rem] text-warn">路径未知，请先重新扫描获取真实路径</p>
                      )}
                      <p className="mt-1.5 text-[0.75rem] text-quaternary">手动选择后会自动记住，重新扫描也保持</p>
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
                  <div className="mt-1.5 panel-flat p-2.5">
                    <div className="flex gap-1.5">
                      <input
                        value={devInput ?? devName(v) ?? ''}
                        onChange={e => setDevInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !devBusy && void saveDev()}
                        placeholder="例如：柚子社 / Key / TYPE-MOON"
                        className="min-w-0 flex-1 field h-8 px-2.5"
                      />
                      <button
                        onClick={() => void saveDev()}
                        disabled={devBusy}
                        className="btn btn-sm btn-primary shrink-0"
                      >
                        {devBusy ? '保存中…' : '保存'}
                      </button>
                      {v.customDeveloper && (
                        <button
                          onClick={() => void handleSetDev(v, '')}
                          className="btn btn-sm btn-ghost shrink-0 border-0"
                        >
                          恢复自动
                        </button>
                      )}
                    </div>
                    <p className="mt-1.5 text-[0.75rem] text-quaternary">
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
                    <div className="mt-1.5 panel-flat p-2.5">
                      <div className="flex gap-1.5">
                        <input
                          value={pathInp}
                          onChange={e => setPathInp(e.target.value)}
                          placeholder="输入游戏文件夹的完整路径，如 E:/galgame/xxx"
                          className="min-w-0 flex-1 field h-8 px-2.5"
                        />
                        <button
                          onClick={() => void doRelocate()}
                          disabled={pathBusy}
                          className="btn btn-sm btn-primary shrink-0"
                        >
                          {pathBusy ? '验证中…' : '验证并应用'}
                        </button>
                      </div>
                      {pathMsg && <p className="mt-1.5 text-[0.75rem] text-tertiary">{pathMsg}</p>}
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
                    <div className="mt-1.5 panel-flat p-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <select
                          value={charSource}
                          onChange={e => setCharSource(e.target.value)}
                          className="field h-8 w-auto px-2"
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
                          className="min-w-0 flex-1 field h-8 px-2.5"
                        />
                        <button
                          onClick={() => void fetchCharacters()}
                          disabled={charBusy}
                          className="btn btn-sm btn-primary shrink-0"
                        >
                          {charBusy ? '获取中…' : '获取'}
                        </button>
                      </div>
                      {charError && <p className="mt-1.5 text-[0.75rem] text-danger">{charError}</p>}
                      {charMsg && <p className="mt-1.5 text-[0.75rem] text-success">{charMsg}</p>}
                      <p className="mt-1.5 text-[0.75rem] text-quaternary">
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

