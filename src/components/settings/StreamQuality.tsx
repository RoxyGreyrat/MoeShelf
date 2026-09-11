'use client'

import { useEffect, useState } from 'react'

/**
 * 手机串流 · 画质/音质设置（嵌在设置弹窗「网络 → 手机串流」）
 *
 * 样式复用设置弹窗自己的 Row / Hint（由父组件作为 props 传入），保证与其它设置分区逐字一致。
 * 视频与音频挤占同一条链路带宽 —— 音质变差最常见的原因就是视频码率占满带宽。
 * 码率填 0 = 不限制（默认），完全按用户填的值来。
 */
interface Cfg {
  videoBitrateMbps: number
  scaleToWidth: number
  contentHint: 'text' | 'detail' | 'motion'
  degradationPreference: 'maintain-resolution' | 'maintain-framerate' | 'balanced'
  frameRate: number
  audioBitrateKbps: number
  disableAudioProcessing: boolean
  audioHint: 'music' | 'speech'
  preferH264: boolean
}

type RowProps = { title: string; children: React.ReactNode }
type HintProps = { children: React.ReactNode }

const PRESETS: { key: string; label: string; hint: string; cfg: Partial<Cfg> }[] = [
  { key: 'sharp', label: '清晰优先', hint: '不缩放 · 不限码率 · 文字档 · 保分辨率', cfg: { videoBitrateMbps: 0, scaleToWidth: 0, contentHint: 'text', degradationPreference: 'maintain-resolution', frameRate: 30, audioBitrateKbps: 0 } },
  { key: 'audio', label: '音质优先', hint: '视频限 10Mbps，把带宽让给音频', cfg: { videoBitrateMbps: 10, scaleToWidth: 0, contentHint: 'text', degradationPreference: 'maintain-resolution', frameRate: 30, audioBitrateKbps: 320 } },
  { key: 'balance', label: '均衡', hint: '1920 宽 · 12Mbps · 音频 192kbps', cfg: { videoBitrateMbps: 12, scaleToWidth: 1920, contentHint: 'text', degradationPreference: 'balanced', frameRate: 30, audioBitrateKbps: 192 } },
  { key: 'smooth', label: '流畅优先', hint: '1280 宽 · 6Mbps（弱网 / 老设备）', cfg: { videoBitrateMbps: 6, scaleToWidth: 1280, contentHint: 'motion', degradationPreference: 'maintain-framerate', frameRate: 30, audioBitrateKbps: 128 } },
]

const lineCls = 'flex flex-wrap items-center gap-x-2.5 gap-y-1'
const nameCls = 'min-w-[9.5rem] text-[0.8125rem] text-tertiary'
const noteCls = 'text-[0.75rem] text-quaternary'
const inputCls = 'field h-8 w-24 px-2 text-[0.8125rem]'
const selectCls = 'field h-8 px-2 text-[0.8125rem]'

export default function StreamQuality ({ Row, Hint }: { Row: (p: RowProps) => JSX.Element; Hint: (p: HintProps) => JSX.Element }) {
  const [cfg, setCfg] = useState<Cfg | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [active, setActive] = useState<string | null>(null)

  const load = async () => {
    try {
      const r = await fetch('/api/stream/config').then(x => x.json())
      if (r?.config) setCfg(r.config)
    } catch { setMsg('读取失败') }
  }
  useEffect(() => { void load() }, [])

  const save = async (patch: Partial<Cfg> & { reset?: boolean }, presetKey?: string) => {
    setBusy(true); setMsg('')
    try {
      const r = await fetch('/api/stream/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) }).then(x => x.json())
      if (r.ok) { setCfg(r.config); setMsg('已保存，下次点「启动」生效'); setActive(presetKey ?? null) }
      else setMsg('保存失败：' + (r.error || ''))
    } catch (e: any) { setMsg('保存失败：' + (e?.message || e)) }
    setBusy(false)
  }

  const set = (patch: Partial<Cfg>) => { setCfg(c => (c ? { ...c, ...patch } : c)); setActive(null) }

  return (
    <>
      <Row title="手机串流 · 画质">
        <Hint>手机点「启动」会把游戏窗口画面与系统声音推到手机。画质、音质、流畅度会互相挤占同一条链路带宽，按实际观感调即可。</Hint>
        {!cfg ? (
          <p className="text-[0.8125rem] text-quaternary">读取串流设置…</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map(p => (
                <button key={p.key} title={p.hint} disabled={busy}
                  onClick={() => void save({ ...p.cfg }, p.key)}
                  className={`chip h-7 text-[0.75rem] ${active === p.key ? 'chip-active' : ''}`}>{p.label}</button>
              ))}
              <button disabled={busy} onClick={() => void save({ reset: true })} className="chip h-7 text-[0.75rem]">恢复默认</button>
            </div>

            <div className={lineCls}>
              <span className={nameCls}>视频码率上限</span>
              <input className={inputCls} type="number" min={0} max={500} value={String(cfg.videoBitrateMbps)}
                onChange={e => set({ videoBitrateMbps: Number(e.target.value) })} />
              <span className={noteCls}>Mbps · <b>0 = 不限制</b>（默认）</span>
            </div>

            <div className={lineCls}>
              <span className={nameCls}>缩放到的宽度</span>
              <input className={inputCls} type="number" min={0} max={3840} step={160} value={String(cfg.scaleToWidth)}
                onChange={e => set({ scaleToWidth: Number(e.target.value) })} />
              <span className={noteCls}>像素 · <b>0 = 不缩放</b>（文字最清晰）</span>
            </div>

            <div className={lineCls}>
              <span className={nameCls}>画面优化方向</span>
              <select className={selectCls} value={cfg.contentHint} onChange={e => set({ contentHint: e.target.value as any })}>
                <option value="text">文字优先（视觉小说推荐）</option>
                <option value="detail">细节优先</option>
                <option value="motion">流畅优先</option>
              </select>
            </div>

            <div className={lineCls}>
              <span className={nameCls}>带宽不足时</span>
              <select className={selectCls} value={cfg.degradationPreference} onChange={e => set({ degradationPreference: e.target.value as any })}>
                <option value="maintain-resolution">保分辨率（文字不糊，可能掉帧）</option>
                <option value="maintain-framerate">保帧率（可能变糊）</option>
                <option value="balanced">均衡</option>
              </select>
            </div>

            <div className={lineCls}>
              <span className={nameCls}>帧率上限</span>
              <input className={inputCls} type="number" min={10} max={60} value={String(cfg.frameRate)}
                onChange={e => set({ frameRate: Number(e.target.value) })} />
              <span className={noteCls}>fps · 固定 30 一般够用且最省</span>
            </div>
          </>
        )}
      </Row>

      {cfg && (
        <Row title="手机串流 · 声音">
          <Hint>游戏声音走 Windows 系统回环。音乐档 + 关掉语音处理才有立体声与 BGM 层次。</Hint>
          <div className={lineCls}>
            <span className={nameCls}>音频码率</span>
            <input className={inputCls} type="number" min={0} max={512} step={32} value={String(cfg.audioBitrateKbps)}
              onChange={e => set({ audioBitrateKbps: Number(e.target.value) })} />
            <span className={noteCls}>kbps · <b>0 = 不限制</b>（默认）；音乐建议 192–320</span>
          </div>
          <div className={lineCls}>
            <span className={nameCls}>音频类型</span>
            <select className={selectCls} value={cfg.audioHint} onChange={e => set({ audioHint: e.target.value as any })}>
              <option value="music">音乐（立体声，BGM 清晰）</option>
              <option value="speech">语音（省带宽）</option>
            </select>
          </div>
          <label className={`${lineCls} cursor-pointer`}>
            <input type="checkbox" checked={cfg.disableAudioProcessing} onChange={e => set({ disableAudioProcessing: e.target.checked })} />
            <span className="text-[0.8125rem] text-secondary">关闭语音处理</span>
            <span className={noteCls}>关掉回声消除 / 降噪 / 自动增益 —— 放音乐必须关</span>
          </label>
        </Row>
      )}

      {cfg && (
        <Row title="手机串流 · 兼容性与操作">
          <label className={`${lineCls} cursor-pointer`}>
            <input type="checkbox" checked={cfg.preferH264} onChange={e => set({ preferH264: e.target.checked })} />
            <span className="text-[0.8125rem] text-secondary">优先 H.264</span>
            <span className={noteCls}>iPad / Safari 必需（Safari 不支持 VP9）</span>
          </label>
          <Hint>
            音质差 → 音频码率调 256–320，并把视频码率上限降到 10–12（给音频让带宽）；画面糊 → 缩放宽度设 0、选「文字优先」与「保分辨率」。
          </Hint>
          <div className="flex flex-wrap items-center gap-2">
            <button disabled={busy} onClick={() => void save(cfg)} className="btn h-8 px-3 text-[0.8125rem]">保存</button>
            <button disabled={busy} onClick={() => { void load(); setMsg(''); setActive(null) }} className="btn h-8 px-3 text-[0.8125rem]">重新读取</button>
            <span className={`text-[0.8125rem] ${msg.includes('失败') ? 'text-danger' : 'text-tertiary'}`}>{msg}</span>
          </div>
          <Hint>改完<b>下次点「启动」生效</b>；正在串流中的那一次不会变。设置保存在 <code className="radius-xs bg-sunken px-1.5 py-0.5 text-[0.8125rem] text-secondary">data/stream-config.json</code>。</Hint>
        </Row>
      )}
    </>
  )
}
