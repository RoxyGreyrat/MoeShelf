'use client'

// 由 page.tsx 拆分而来（行为与拆分前逐字一致，仅位置与导入变化）

import { useCallback, useEffect, useState } from 'react'
import { Icon, Spinner } from '@/components/icons'
import type { DirItem } from '@/lib/ui-shared'

export function DirPicker({
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
          <h2 className="text-[0.9375rem] font-bold text-white">选择游戏根目录</h2>
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
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[0.8125rem] text-white placeholder:text-white/25 focus:border-indigo-400/50 focus:outline-none"
          />
          <button
            onClick={jump}
            className="btn btn-sm btn-primary shrink-0"
          >
            跳转
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {error && (
            <div className="m-2 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-[0.8125rem] text-danger">
              {error}
            </div>
          )}
          {!current && (
            <div className="p-2">
              <p className="mb-2 px-1 text-[0.6875rem] text-white/40">磁盘</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {drives.map(d => (
                  <button
                    key={d}
                    onClick={() => void navigate(d)}
                    className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left text-[0.9375rem] text-white/80 transition hover:border-indigo-400/40 hover:bg-white/[0.06]"
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
                <span className="min-w-0 flex-1 truncate text-[0.6875rem] text-white/40" title={current}>
                  {current}
                </span>
                <span className="shrink-0 text-[0.75rem] text-quaternary">{fileCount} 个文件</span>
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
                      className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[0.8125rem] text-white/75 transition hover:bg-white/[0.06]"
                    >
                      <Icon name="folder" className="h-3.5 w-3.5 shrink-0 text-indigo-300/80" />
                      <span className="truncate">{d.name}</span>
                    </button>
                  ))}
                  {dirs.length === 0 && (
                    <p className="col-span-full px-1 py-4 text-center text-[0.8125rem] text-quaternary">
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
            className="rounded-lg border border-white/10 px-3.5 py-1.5 text-[0.8125rem] font-medium text-white/70 transition hover:bg-white/[0.06]"
          >
            取消
          </button>
          <button
            onClick={() => current && onSelect(current)}
            disabled={!current || loading}
            className="rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-3.5 py-1.5 text-[0.8125rem] font-semibold text-white transition hover:from-emerald-400 hover:to-emerald-500 disabled:opacity-50"
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
