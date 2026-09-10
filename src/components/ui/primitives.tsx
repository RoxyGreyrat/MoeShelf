'use client'

// 由 page.tsx 拆分而来（行为与拆分前逐字一致，仅位置与导入变化）

import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { Icon } from '@/components/icons'
import { SOURCE_LABELS, colorFor, idbGet, idbSave, type SearchCandidate } from '@/lib/ui-shared'

// ---------------------------------------------------------------------------

export function CoverPlaceholder({ name, className = '' }: { name: string; className?: string }) {
  const [colorA, colorB] = colorFor(name)
  const firstChar = Array.from(name.trim())[0] ?? '?'
  return (
    <div
      className={`relative flex h-full w-full items-center justify-center overflow-hidden ${className}`}
      style={{ background: `linear-gradient(135deg, ${colorA}, ${colorB})` }}
    >
      <span
        className="select-none text-[4rem] font-bold leading-none text-white/25"
        style={{ textShadow: '0 2px 24px rgba(0,0,0,.35)' }}
      >
        {firstChar}
      </span>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.18),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_90%,rgba(0,0,0,.28),transparent_50%)]" />
    </div>
  )
}


// ---------------------------------------------------------------------------
// 通用小组件
export function CoverImage({
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
            className="rounded-full bg-black/60 px-2 py-0.5 text-[0.75rem] text-on-overlay/80 backdrop-blur transition hover:bg-black/80 hover:text-white"
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


// ---------------------------------------------------------------------------

export function ClockIcon({ className = '' }: { className?: string }) {
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


// ---------------------------------------------------------------------------

const CANDIDATE_SOURCES = ['vndb', 'bangumi', 'ymgal', 'cngal', 'moyu']

export function SearchCandidateRow({
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
        <p className="truncate text-[0.8125rem] font-medium text-white/85">{c.title}</p>
        <p className="truncate text-[0.75rem] text-on-overlay/35">
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
        className="shrink-0 rounded-lg bg-emerald-500/90 px-2.5 py-1.5 text-[0.6875rem] font-medium text-white transition hover:bg-emerald-400 disabled:opacity-50"
      >
        {applying === c.id ? '应用中…' : '选择'}
      </button>
    </div>
  )
}


// ---------------------------------------------------------------------------
// 搜索结果条目（修正条目 / 手动匹配）
export function SectionRow({
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
      <span className="shrink-0 text-[0.8125rem] font-medium">{label}</span>
      <span className="min-w-0 flex-1 truncate text-right text-[0.75rem] text-quaternary">{desc}</span>
      <Icon name="plus" className={`h-3 w-3 shrink-0 transition-transform ${active ? 'rotate-45' : ''}`} />
    </button>
  )
}

// ---------------------------------------------------------------------------
// 游戏详情面板
// ---------------------------------------------------------------------------

