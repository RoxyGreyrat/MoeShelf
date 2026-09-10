'use client'

// 由 page.tsx 拆分而来（行为与拆分前逐字一致，仅位置与导入变化）

import { useCallback, useEffect, useState } from 'react'
import { Icon, Spinner } from '@/components/icons'
import type { DirItem } from '@/lib/ui-shared'

export function DirPicker({
  open,
  onClose,
  onSelect,
  title = '选择游戏根目录',
}: {
  open: boolean
  onClose: () => void
  onSelect: (path: string) => void
  /** 弹窗标题（选数据目录时传「选择数据存储位置」） */
  title?: string
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
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative flex max-h-[82vh] w-full max-w-lg flex-col overflow-hidden radius-2xl border border-strong bg-surface-1 shadow-token-lg animate-scale-in">
        <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
          <h2 className="text-[1rem] font-semibold text-primary">{title}</h2>
          <button onClick={onClose} aria-label="关闭" className="icon-btn ml-auto h-8 w-8 shrink-0 radius-pill">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-hairline px-4 py-2.5">
          <input
            value={pathInput}
            onChange={e => setPathInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && jump()}
            placeholder="输入或粘贴路径，回车跳转"
            className="field h-9 min-w-0 flex-1 px-2.5"
          />
          <button onClick={jump} className="btn btn-sm btn-primary shrink-0">
            跳转
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {error && (
            <div className="m-2 radius-md border border-danger-soft bg-danger-soft px-3 py-2 text-[0.8125rem] text-danger">
              {error}
            </div>
          )}

          {!current && (
            <div className="p-2">
              <p className="mb-2 px-1 section-label">磁盘</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {drives.map(d => (
                  <button
                    key={d}
                    onClick={() => void navigate(d)}
                    className="flex items-center gap-2 radius-lg border border-hairline bg-sunken px-3 py-2.5 text-left text-[0.9375rem] text-primary transition hover:border-accent-soft hover:bg-hoverable"
                  >
                    <Icon name="drive" className="h-4 w-4 shrink-0 text-accent" />
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
                    className="icon-btn h-7 w-7 shrink-0 bg-sunken"
                  >
                    <Icon name="up" className="h-4 w-4" />
                  </button>
                )}
                <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-tertiary" title={current}>
                  {current}
                </span>
                <span className="shrink-0 text-[0.75rem] text-quaternary">{fileCount} 个文件</span>
              </div>
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-tertiary">
                  <Spinner className="h-4 w-4" /> 加载中…
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                  {dirs.map(d => (
                    <button
                      key={d.path}
                      onClick={() => void navigate(d.path)}
                      className="flex items-center gap-2 radius-sm px-2.5 py-2 text-left text-[0.875rem] text-secondary transition hover:bg-hoverable hover:text-primary"
                    >
                      <Icon name="folder" className="h-3.5 w-3.5 shrink-0 text-quaternary" />
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

        <div className="flex items-center justify-end gap-2 border-t border-hairline px-4 py-3">
          <button onClick={onClose} className="btn btn-sm btn-soft">
            取消
          </button>
          <button
            onClick={() => current && onSelect(current)}
            disabled={!current || loading}
            className="btn btn-sm btn-success"
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
