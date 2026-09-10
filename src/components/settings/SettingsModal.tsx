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
  ACT_GROUPS,
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
  // 左侧分组导航（单选）
  const [activeSection, setActiveSection] = useState('root')

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
  const Row = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="panel overflow-hidden">
      <h3 className="border-b border-hairline px-4 py-2.5 text-[0.875rem] font-semibold text-primary">{title}</h3>
      <div className="space-y-3 p-4">{children}</div>
    </section>
  )

  const Hint = ({ children }: { children: React.ReactNode }) => (
    <p className="text-[0.8125rem] leading-relaxed text-tertiary">{children}</p>
  )

  const Code = ({ children }: { children: React.ReactNode }) => (
    <code className="radius-xs bg-sunken px-1.5 py-0.5 text-[0.8125rem] text-secondary">{children}</code>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden radius-2xl border border-strong bg-surface-1 shadow-token-lg animate-scale-in">
        <div className="flex shrink-0 items-center gap-2 border-b border-hairline px-4 py-3">
          <h2 className="text-[1rem] font-semibold text-primary">设置</h2>
          <span className="min-w-0 truncate text-[0.8125rem] text-tertiary">
            {games.length} 个游戏 · 数据保存在本机
          </span>
          <button onClick={onClose} aria-label="关闭" className="icon-btn ml-auto h-8 w-8 shrink-0 radius-pill">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <div className="shrink-0 border-b border-hairline p-2 sm:w-52 sm:border-b-0 sm:border-r">
            <div className="flex gap-1 overflow-x-auto sm:block sm:space-y-2 sm:overflow-visible">
              {ACT_GROUPS.map(g => (
                <div key={g.title}>
                  <p className="hidden px-2.5 pb-1 pt-1.5 section-label sm:block">{g.title}</p>
                  <div className="flex gap-1 sm:block sm:space-y-0.5">
                    {g.items.map(item => {
                      const active = activeSection === item.key
                      return (
                        <button
                          key={item.key}
                          onClick={() => setActiveSection(item.key)}
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
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
            {activeSection === 'root' && (
              <>
                <Row title="游戏根目录">
                  <Hint>启动器扫描该目录下的一级子文件夹作为游戏；保存后自动开始扫描。</Hint>
                  <div className="flex flex-wrap gap-2">
                    <input
                      value={rootInput}
                      onChange={e => setRootInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !rootSaving && void saveRoot(rootInput)}
                      placeholder={settings?.rootPath ? `当前：${settings.rootPath}` : '例如：D:\\Galgames'}
                      className="field h-9 min-w-0 flex-1 px-2.5"
                    />
                    <button onClick={() => setPickerTarget('root')} className="btn btn-sm btn-soft shrink-0">
                      浏览…
                    </button>
                    <button
                      onClick={() => !rootSaving && void saveRoot(rootInput)}
                      disabled={rootSaving}
                      className="btn btn-sm btn-primary shrink-0"
                    >
                      {rootSaving ? '保存中…' : '保存并扫描'}
                    </button>
                  </div>
                </Row>
                <Row title="数据存储位置">
                  <Hint>
                    所有数据（游戏列表 / 刮削缓存 / 游玩时长 / 封面图片 / 设置）都保存在这里，换路径时自动迁移现有数据。
                  </Hint>
                  <div className="flex flex-wrap gap-2">
                    <input
                      value={dataPathInput}
                      onChange={e => setDataPathInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !migrating && void migrateData(dataPathInput)}
                      placeholder="例如：D:\\GalgameData"
                      className="field h-9 min-w-0 flex-1 px-2.5"
                    />
                    <button onClick={() => setPickerTarget('data')} className="btn btn-sm btn-soft shrink-0">
                      浏览…
                    </button>
                    <button
                      onClick={() => !migrating && void migrateData(dataPathInput)}
                      disabled={migrating || dataPathInput === storageInfo?.dataPath}
                      className="btn btn-sm btn-primary shrink-0"
                    >
                      {migrating ? '迁移中…' : '更改并迁移'}
                    </button>
                  </div>
                  <p className="break-all text-[0.8125rem] text-quaternary">
                    当前：{storageInfo?.dataPath ?? '…'}
                    {storageInfo && storageInfo.dataPath !== storageInfo.defaultPath ? '（自定义）' : '（默认，启动器目录下）'}
                  </p>
                  <p className="text-[0.8125rem] text-warn">更改后需重启启动器生效；迁移只复制、不删除旧数据。</p>
                </Row>
                <Row title="数据备份与导出">
                  <Hint>
                    每次保存时自动备份到 <Code>data/backup</Code>（保留最近 5 份）；也可手动导出完整资料库或 CSV 列表。
                  </Hint>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => void exportBackup()} disabled={exporting} className="btn btn-sm btn-soft">
                      {exporting ? '导出中…' : '导出资料'}
                    </button>
                    <label
                      className={`btn btn-sm btn-primary cursor-pointer ${importing ? 'pointer-events-none opacity-50' : ''}`}
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
                    <button onClick={exportCsv} className="btn btn-sm btn-soft">
                      导出 CSV
                    </button>
                  </div>
                </Row>
              </>
            )}

            {activeSection === 'cover' && (
              <Row title="NSFW 封面模糊">
                <button
                  onClick={() => {
                    setNsfwBlurEnabled(!isNsfwBlurEnabled())
                    try {
                      localStorage.setItem('gl-nsfw-blur', isNsfwBlurEnabled() ? '1' : '0')
                    } catch (e) {}
                    setNsfwTick(t => t + 1)
                    onNsfwBlurChange?.()
                  }}
                  className={`flex w-full items-center justify-between radius-md border px-3 py-2.5 text-[0.875rem] transition ${
                    isNsfwBlurEnabled()
                      ? 'border-accent-soft bg-accent-soft font-medium text-accent'
                      : 'border-hairline bg-sunken text-secondary'
                  }`}
                >
                  <span>R18 封面自动高斯模糊并显示 NSFW 角标</span>
                  <span className="shrink-0">{isNsfwBlurEnabled() ? '已开启' : '已关闭'}</span>
                </button>
                <Hint>按封面图本身判断（VNDB 图片分级）；关闭后恢复显示。</Hint>
              </Row>
            )}

            {activeSection === 'fix' && (
              <>
                <Row title="界面缩放">
                  <div className="grid grid-cols-4 gap-2">
                    {[100, 112, 125, 150].map(v => (
                      <button
                        key={v}
                        onClick={() => setScale(v)}
                        className={`radius-md border py-2 text-[0.9375rem] font-medium transition ${
                          uiScale === v
                            ? 'border-accent-soft bg-accent-soft text-accent'
                            : 'border-hairline bg-sunken text-secondary hover:bg-hoverable hover:text-primary'
                        }`}
                      >
                        {v}%
                      </button>
                    ))}
                  </div>
                  <Hint>缩放会同时放大文字与间距；高 DPI 屏建议调到 125% 以上。桌面窗口默认 1560×940。</Hint>
                </Row>
                <Row title="刮削缓存">
                  <div className="flex items-center justify-between">
                    <span className="text-[0.875rem] text-secondary">缓存条目</span>
                    <span className="text-[0.9375rem] font-semibold tabular-nums text-primary">
                      {cacheInfo === null ? '…' : cacheInfo.count}
                    </span>
                  </div>
                  <Hint>
                    元数据缓存在服务端 <Code>data/cache.json</Code>，下次扫描先命中缓存，避免重复请求网络。
                  </Hint>
                  <button
                    onClick={clearCache}
                    disabled={cacheClearing || (cacheInfo?.count ?? 0) === 0}
                    className="btn btn-sm w-full border border-danger-soft bg-danger-soft text-danger"
                  >
                    {cacheClearing ? '正在清空…' : '清空全部刮削缓存'}
                  </button>
                </Row>
              </>
            )}

            {activeSection === 'dev' && (
              <Row title="代理服务器（可选）">
                <div className="flex flex-wrap gap-2">
                  <input
                    value={proxyInput}
                    onChange={e => setProxyInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && void saveProxy()}
                    placeholder="http://127.0.0.1:7890（Clash / V2Ray 默认端口）"
                    className="field h-9 min-w-0 flex-1 px-2.5"
                  />
                  <button onClick={() => void saveProxy()} className="btn btn-sm btn-primary shrink-0">
                    保存
                  </button>
                  <button onClick={() => void testProxy()} disabled={proxyTesting} className="btn btn-sm btn-soft shrink-0">
                    {proxyTesting ? '测试中…' : '测试连接'}
                  </button>
                </div>
                {proxyMsg && <p className="text-[0.8125rem] text-secondary">{proxyMsg}</p>}
                <Hint>
                  VNDB / Bangumi 服务器在境外，国内直连慢或不稳定；配置本地代理后，刮削、搜索、封面请求全部走代理。留空则直连。
                </Hint>
              </Row>
            )}

            {activeSection === 'path' && (
              <Row title="局域网访问">
                {networkInfo ? (
                  <div className="space-y-2">
                    {networkInfo.ips.map(ip => {
                      const url = `http://${ip}:${networkInfo.port}`
                      return (
                        <div key={ip} className="flex items-center gap-2">
                          <code className="min-w-0 flex-1 truncate radius-sm bg-sunken px-2 py-1.5 text-[0.8125rem] text-accent">
                            {url}
                          </code>
                          <button onClick={() => copyText(url)} className="btn btn-sm btn-soft shrink-0">
                            复制
                          </button>
                        </div>
                      )
                    })}
                    {qrDataUrl && networkInfo.ips.length > 0 && (
                      <div className="flex items-start gap-3 pt-1">
                        <img src={qrDataUrl} alt="手机扫码访问" className="h-24 w-24 shrink-0 radius-md bg-white p-1" />
                        <div className="min-w-0 text-[0.8125rem] leading-relaxed text-tertiary">
                          同一局域网下扫码即可打开（或在手机浏览器输入上方地址）
                          <br />
                          连不上时：右键「开启局域网访问.bat」以管理员身份运行一次
                          <br />
                          手机端仅可浏览与查看，启动游戏仍在电脑上执行
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <Hint>正在获取本机网络地址…</Hint>
                )}
              </Row>
            )}

            {activeSection === 'char' && (
              <Row title="其他说明">
                <ul className="list-disc space-y-1.5 pl-4 text-[0.8125rem] leading-relaxed text-tertiary">
                  <li>刮削数据源：VNDB → Bangumi → YMgal → CnGal，按相似度匹配防错配。</li>
                  <li>「启动」会直接运行游戏 exe（游戏本体不经过浏览器）。</li>
                  <li>本工具仅在你的电脑上运行，不会上传任何文件。</li>
                  <li>需要 Chrome / Edge 浏览器；局域网访问时手机与电脑需在同一 Wi-Fi。</li>
                </ul>
              </Row>
            )}
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
