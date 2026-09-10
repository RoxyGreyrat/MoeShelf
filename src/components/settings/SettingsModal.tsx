'use client'

// 由 page.tsx 拆分而来（行为与拆分前逐字一致，仅位置与导入变化）

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode-generator'
import { Icon, Spinner } from '@/components/icons'
import { useToast } from '@/components/toast'
import { buildCsv, downloadCsv } from '@/lib/csv'
import { SectionRow } from '@/components/ui/primitives'
import { DirPicker } from '@/components/settings/DirPicker'
import {
  displayTitle,
  devName,
  isNsfwBlurEnabled,
  setNsfwBlurEnabled,
  type AppSettings,
  type Game,
} from '@/lib/ui-shared'

// ---------------------------------------------------------------------------

export function SettingsModal({
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
            <div className="mb-2 text-[0.9375rem] text-white/70">游戏根目录</div>
            <div className="flex gap-2">
              <input
                value={rootInput}
                onChange={e => setRootInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !rootSaving && void saveRoot(rootInput)}
                placeholder={settings?.rootPath ? `当前：${settings.rootPath}（输入新路径或点浏览重新选择）` : '例如：D:\\Galgames'}
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-[0.8125rem] text-white placeholder:text-white/25 focus:border-indigo-400/50 focus:outline-none"
              />
              <button
                onClick={() => setPickerTarget('root')}
                title="浏览目录"
                className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-[0.8125rem] text-secondary transition hover:bg-white/[0.06]"
              >
                浏览…
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-[0.6875rem] leading-relaxed text-white/35">
                启动器将扫描该目录下的一级子文件夹作为游戏，保存后自动开始扫描。
              </p>
              <button
                onClick={() => !rootSaving && void saveRoot(rootInput)}
                disabled={rootSaving}
                className="btn btn-sm btn-primary shrink-0 disabled:opacity-60"
              >
                {rootSaving ? '保存中…' : '保存并扫描'}
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
            <div className="mb-2 text-[0.9375rem] text-white/70">数据存储位置</div>
            <p className="mb-2 text-[0.6875rem] leading-relaxed text-white/35">
              所有数据（游戏列表 / 刮削缓存 / 游玩时长 / 封面图片 / 设置）都保存在这里，换路径时自动迁移现有数据。
            </p>
            <div className="flex gap-2">
              <input
                value={dataPathInput}
                onChange={e => setDataPathInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !migrating && void migrateData(dataPathInput)}
                placeholder="例如：D:\GalgameData"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-[0.8125rem] text-white placeholder:text-white/25 focus:border-indigo-400/50 focus:outline-none"
              />
              <button
                onClick={() => setPickerTarget('data')}
                title="浏览目录"
                className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-[0.8125rem] text-secondary transition hover:bg-white/[0.06]"
              >
                浏览…
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 flex-1 truncate text-[0.6875rem] text-white/30">
                当前：
                {storageInfo?.dataPath ?? '…'}
                {storageInfo && storageInfo.dataPath !== storageInfo.defaultPath ? '（自定义）' : '（默认，启动器目录下）'}
              </p>
              <button
                onClick={() => !migrating && void migrateData(dataPathInput)}
                disabled={migrating || dataPathInput === storageInfo?.dataPath}
                className="btn btn-sm btn-primary shrink-0 disabled:opacity-60"
              >
                {migrating ? '迁移中…' : '更改并迁移'}
              </button>
            </div>
            <p className="mt-1.5 text-[0.625rem] text-amber-300/70">更改后需重启启动器生效；迁移只复制不删除旧数据。</p>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
            <div className="mb-2 text-[0.9375rem] text-white/70">NSFW 封面模糊</div>
            <button
              onClick={() => {
                setNsfwBlurEnabled(!isNsfwBlurEnabled())
                try {
                  localStorage.setItem('gl-nsfw-blur', isNsfwBlurEnabled() ? '1' : '0')
                } catch (e) {}
                setNsfwTick(t => t + 1)
                onNsfwBlurChange?.()
              }}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-[0.8125rem] transition ${
                isNsfwBlurEnabled()
                  ? 'border-accent-soft bg-accent-soft text-primary'
                  : 'border-hairline bg-sunken text-secondary'
              }`}
            >
              <span>R18 封面自动高斯模糊并显示 NSFW 角标</span>
              <span className="font-medium">{isNsfwBlurEnabled() ? '已开启' : '已关闭'}</span>
            </button>
            <p className="mt-2 text-[0.6875rem] leading-relaxed text-white/40">
              按封面图本身判断（VNDB 图片分级）；关闭后恢复显示。
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
            <div className="mb-2 text-[0.9375rem] text-white/70">界面缩放</div>
            <div className="grid grid-cols-4 gap-2">
              {[100, 112, 125, 150].map(v => (
                <button
                  key={v}
                  onClick={() => setScale(v)}
                  className={`rounded-lg border py-2 text-[0.9375rem] font-medium transition ${
                    uiScale === v
                      ? 'border-indigo-400/60 bg-indigo-500/15 text-white'
                      : 'border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06]'
                  }`}
                >
                  {v}%
                </button>
              ))}
            </div>
            <p className="mt-2 text-[0.6875rem] leading-relaxed text-white/35">高 DPI 屏建议调到 125% 以上。</p>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
            <div className="mb-2 text-[0.9375rem] text-white/70">代理服务器（可选）</div>
            <div className="flex gap-2">
              <input
                value={proxyInput}
                onChange={e => setProxyInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && void saveProxy()}
                placeholder="本地代理 http://127.0.0.1:7890（Clash / V2Ray 默认端口）"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-[0.8125rem] text-white placeholder:text-white/25 focus:border-indigo-400/50 focus:outline-none"
              />
              <button
                onClick={() => void saveProxy()}
                className="shrink-0 rounded-lg bg-indigo-500/90 px-3 py-2 text-[0.8125rem] font-medium text-white transition hover:bg-indigo-400"
              >
                保存
              </button>
              <button
                onClick={() => void testProxy()}
                disabled={proxyTesting}
                className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-[0.8125rem] font-medium text-white/75 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
              >
                {proxyTesting ? '测试中…' : '测试连接'}
              </button>
            </div>
            {proxyMsg && <p className="mt-2 text-[0.6875rem] leading-relaxed text-white/55">{proxyMsg}</p>}
            <p className="mt-2 text-[0.6875rem] leading-relaxed text-white/35">
              VNDB / Bangumi 服务器在境外，国内直连慢或不稳定；配置本地代理后，刮削、搜索、封面全部走代理。留空则直连。
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
            <div className="mb-2 text-[0.9375rem] text-white/70">局域网访问</div>
            {networkInfo ? (
              <div className="space-y-2">
                {networkInfo.ips.map(ip => {
                  const url = `http://${ip}:${networkInfo.port}`
                  return (
                    <div key={ip} className="flex items-center gap-2">
                      <code className="min-w-0 flex-1 truncate rounded-lg bg-black/40 px-2 py-1.5 text-[0.8125rem] text-indigo-200">
                        {url}
                      </code>
                      <button
                        onClick={() => copyText(url)}
                        className="shrink-0 rounded-lg border border-white/10 px-2.5 py-1.5 text-[0.6875rem] font-medium text-white/75 transition hover:bg-white/[0.06] hover:text-white"
                      >
                        复制
                      </button>
                    </div>
                  )
                })}
                {qrDataUrl && networkInfo.ips.length > 0 && (
                  <div className="flex items-center gap-3 pt-1">
                    <img src={qrDataUrl} alt="手机扫码访问" className="h-24 w-24 shrink-0 rounded-lg bg-white p-1" />
                    <div className="text-[0.6875rem] leading-relaxed text-white/40">
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
              <p className="text-[0.8125rem] text-quaternary">正在获取本机网络地址…</p>
            )}
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
            <div className="flex items-center justify-between text-[0.9375rem]">
              <span className="text-white/70">刮削缓存条目</span>
              <span className="font-semibold text-white tabular-nums">{cacheInfo === null ? '…' : cacheInfo.count}</span>
            </div>
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-white/35">
              元数据缓存在服务端 <code className="rounded bg-black/40 px-1 py-0.5">data/cache.json</code>
              ，下次扫描会先命中缓存，避免重复请求网络。
            </p>
            <button
              onClick={clearCache}
              disabled={cacheClearing || (cacheInfo?.count ?? 0) === 0}
              className="mt-3 w-full rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-2.5 text-[0.9375rem] font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
            >
              {cacheClearing ? '正在清空…' : '清空全部刮削缓存'}
            </button>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
            <div className="mb-2 text-[0.9375rem] text-white/70">数据备份与导出</div>
            <p className="mb-2 text-[0.6875rem] leading-relaxed text-white/35">
              每次保存时自动备份到 <code className="rounded bg-black/40 px-1 py-0.5">data/backup</code>
              （保留最近 5 份）；也可手动导出完整资料库或 CSV 列表。
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void exportBackup()}
                disabled={exporting}
                className="btn btn-sm btn-primary shrink-0"
              >
                {exporting ? '导出中…' : '导出资料'}
              </button>
              <label
                className={`shrink-0 cursor-pointer rounded-lg bg-indigo-500/90 px-3 py-1.5 text-[0.8125rem] font-medium text-white transition hover:bg-indigo-400 ${
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
                className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-[0.8125rem] font-medium text-white/75 transition hover:bg-white/[0.06] hover:text-white"
              >
                导出 CSV
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4 text-[0.8125rem] leading-relaxed text-white/40">
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

