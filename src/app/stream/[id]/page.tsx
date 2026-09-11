'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

/**
 * MoeShelf 手机串流播放页
 *
 * 交互逻辑与验证过的测试台一致：contain 播放（比例不拉伸）、触摸按「视频实际渲染矩形」映射（黑边点击忽略）、
 * 控制条 4 秒自动隐藏且隐藏时不挡触摸、首次触摸自动开声、断开自动重连、可结束电脑上的游戏。
 * 表现层沿用项目既有规范（panel / chip / btn / field / icon-btn / border-hairline / text-*），
 * 只有视频舞台本身是全黑（播放视频就该这样）。
 */
type Stats = { state: string; w: number; h: number; fps: number; rtt: number; audio: boolean }

export default function StreamPage () {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const [stats, setStats] = useState<Stats>({ state: '连接中…', w: 0, h: 0, fps: 0, rtt: 0, audio: false })
  const [muted, setMuted] = useState(true)
  const [showCtl, setShowCtl] = useState(true)
  const [showKb, setShowKb] = useState(false)
  const [kbText, setKbText] = useState('')
  const [confirmEnd, setConfirmEnd] = useState(false)
  const soundUnlocked = useRef(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const started = useRef(false)

  // ── 控制条自动隐藏（隐藏时 pointer-events-none，完全不挡触摸）─────
  const showControls = useCallback((autoHide = true) => {
    setShowCtl(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    if (autoHide) hideTimer.current = setTimeout(() => setShowCtl(false), 4000)
  }, [])
  useEffect(() => { showControls() }, [showControls])

  // ── 声音：默认开启，但浏览器要求一次用户手势 ─────────────────────
  const unlockSound = useCallback(() => {
    const v = videoRef.current
    if (!v || soundUnlocked.current) return
    v.muted = false
    v.play().then(() => { soundUnlocked.current = true; setMuted(false) })
      .catch(() => { v.muted = true; setMuted(true) })
  }, [])
  useEffect(() => {
    const once = () => unlockSound()
    window.addEventListener('touchstart', once, { once: true, passive: true })
    window.addEventListener('click', once, { once: true })
    return () => { window.removeEventListener('touchstart', once); window.removeEventListener('click', once) }
  }, [unlockSound])

  // ── 比例安全映射：触点 → 视频内归一化坐标 ────────────────────────
  const toNorm = useCallback((cx: number, cy: number) => {
    const v = videoRef.current
    if (!v || !v.videoWidth || !v.videoHeight) return null
    const r = v.getBoundingClientRect()
    const scale = Math.min(r.width / v.videoWidth, r.height / v.videoHeight)
    const w = v.videoWidth * scale, h = v.videoHeight * scale
    const x = r.left + (r.width - w) / 2, y = r.top + (r.height - h) / 2
    const nx = (cx - x) / w, ny = (cy - y) / h
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null // 黑边上的点击忽略，避免点偏
    return { nx: +nx.toFixed(4), ny: +ny.toFixed(4) }
  }, [])

  const send = useCallback((body: Record<string, unknown>) => {
    fetch('/api/stream/input', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {})
  }, [])

  // ── 触摸手势 ────────────────────────────────────────────────────
  useEffect(() => {
    const el = document.getElementById('stream-stage')
    if (!el) return
    let start: { x: number; y: number } | null = null
    let moved = false, twoFinger = false, lastMove = 0
    let lp: ReturnType<typeof setTimeout> | null = null
    const onStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) { twoFinger = true; start = { x: e.touches[0].clientX, y: e.touches[0].clientY }; moved = false; return }
      twoFinger = false
      const t = e.touches[0]
      start = { x: t.clientX, y: t.clientY }; moved = false
      lp = setTimeout(() => { const n = toNorm(t.clientX, t.clientY); if (n && !moved) send({ type: 'tap', ...n, button: 'right' }) }, 520)
    }
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0]
      if (twoFinger && start) {
        const dy = t.clientY - start.y
        if (Math.abs(dy) > 24) { send({ type: 'wheel', delta: dy > 0 ? -120 : 120 }); start.y = t.clientY }
        return
      }
      if (!start) return
      if (Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) { moved = true; if (lp) clearTimeout(lp) }
      const now = Date.now()
      if (moved && now - lastMove > 33) { lastMove = now; const n = toNorm(t.clientX, t.clientY); if (n) send({ type: 'move', ...n }) }
    }
    const onEnd = (e: TouchEvent) => {
      if (lp) clearTimeout(lp)
      if (twoFinger) { twoFinger = false; start = null; return }
      if (start && !moved) {
        const t = e.changedTouches?.[0]
        const n = t ? toNorm(t.clientX, t.clientY) : null
        if (n) send({ type: 'tap', ...n, button: 'left' })
      }
      start = null
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: true })
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => { el.removeEventListener('touchstart', onStart); el.removeEventListener('touchmove', onMove); el.removeEventListener('touchend', onEnd) }
  }, [toNorm, send])

  // ── 统计（分辨率 / 比例 / 帧率 / 延迟 / 音轨）────────────────────
  const startStats = useCallback(() => {
    const t = setInterval(async () => {
      const pc = pcRef.current
      if (!pc) return
      const s = await pc.getStats()
      const next: Stats = { state: pc.connectionState, w: 0, h: 0, fps: 0, rtt: 0, audio: false }
      s.forEach((r: any) => {
        if (r.type === 'inbound-rtp' && r.kind === 'video' && r.frameWidth) { next.w = r.frameWidth; next.h = r.frameHeight; next.fps = r.framesPerSecond || 0 }
        if (r.type === 'inbound-rtp' && r.kind === 'audio' && r.bytesReceived) next.audio = true
        if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.currentRoundTripTime != null) next.rtt = Math.round(r.currentRoundTripTime * 1000)
      })
      setStats(next)
    }, 1500)
    return () => clearInterval(t)
  }, [])

  // ── 信令 ────────────────────────────────────────────────────────
  useEffect(() => {
    let stopStats: (() => void) | undefined
    const post = (p: string, body: unknown) => fetch(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json())

    const newPeer = () => {
      const pc = new RTCPeerConnection({ iceServers: [] })
      pc.onconnectionstatechange = () => setStats(s => ({ ...s, state: pc.connectionState }))
      pc.onicecandidate = e => { if (e.candidate) post('/api/stream/signal', { role: 'viewer', msg: { type: 'candidate', candidate: e.candidate.toJSON() } }) }
      pc.ontrack = e => { const v = videoRef.current; if (v) { v.srcObject = e.streams[0]; v.play().catch(() => {}) } }
      return pc
    }

    const handleOffer = async (sdp: string) => {
      if (pcRef.current) { try { pcRef.current.close() } catch {} }
      const pc = newPeer()
      pcRef.current = pc
      await pc.setRemoteDescription({ type: 'offer', sdp })
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      // 等 ICE 收集完成再回 answer（两端都没做候选缓存，过早交换会互相丢弃 → 一直连接中）
      await new Promise<void>(r => {
        if (pc.iceGatheringState === 'complete') return r()
        pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') r() }
        setTimeout(r, 1500)
      })
      await post('/api/stream/signal', { role: 'viewer', msg: { type: 'answer', sdp: pc.localDescription?.sdp } })
      if (!stopStats) stopStats = startStats()
    }

    const loop = async () => {
      if (!started.current) {
        started.current = true
        await post('/api/stream/hello', { role: 'viewer', agent: navigator.userAgent, game: id }).catch(() => {})
      }
      try {
        const r = await fetch('/api/stream/signal?role=viewer').then(x => x.json())
        for (const m of r.msgs || []) {
          if (m.type === 'offer') await handleOffer(m.sdp)
          else if (m.type === 'candidate' && pcRef.current) { try { await pcRef.current.addIceCandidate(m.candidate) } catch {} }
          else if (m.type === 'viewer-left' || m.type === 'bye') { setStats(s => ({ ...s, state: '电脑端已停止' })) }
        }
      } catch {}
      const connected = pcRef.current?.connectionState === 'connected'
      setTimeout(loop, connected ? 900 : 250)
    }
    loop()

    const bye = () => { try { navigator.sendBeacon('/api/stream/state', new Blob([JSON.stringify({ role: 'viewer' })], { type: 'application/json' })) } catch {} }
    window.addEventListener('pagehide', bye)
    return () => { window.removeEventListener('pagehide', bye); stopStats?.(); try { pcRef.current?.close() } catch {} }
  }, [id, startStats])

  const ratioLabel = useMemo(() => {
    if (!stats.w || !stats.h) return null
    const r = stats.w / stats.h
    if (Math.abs(r - 16 / 9) < 0.02) return '16:9'
    if (Math.abs(r - 4 / 3) < 0.02) return '4:3'
    return r.toFixed(3)
  }, [stats.w, stats.h])

  const chip = (label: string, ok?: boolean) => (
    <span key={label} className={`chip h-6 text-[0.75rem] ${ok ? 'chip-active' : ''}`}>{label}</span>
  )
  const connected = stats.state === 'connected'

  return (
    <div className="fixed inset-0 bg-black text-primary" style={{ overscrollBehavior: 'none' }}>
      {/* 视频舞台：全黑 + contain（比例原样保留，黑边点击会被忽略） */}
      <div id="stream-stage" className="absolute inset-0 flex items-center justify-center" style={{ touchAction: 'none' }}>
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full bg-black object-contain" />
      </div>

      {/* 顶部状态：沿用卡片标签的 chip 语言 */}
      <div className={`pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center gap-1.5 bg-gradient-to-b from-black/70 to-transparent p-2.5 transition-opacity duration-200 ${showCtl ? 'opacity-100' : 'opacity-0'}`}>
        {chip(stats.state, connected)}
        {chip(stats.w ? `${stats.w}×${stats.h}` : '—')}
        {ratioLabel ? chip(`比例 ${ratioLabel}`, true) : null}
        {stats.fps ? chip(`${stats.fps} fps`) : null}
        {chip(stats.audio ? '声音 ✓' : '无音轨', stats.audio)}
        {stats.rtt ? chip(`${stats.rtt} ms`) : null}
      </div>

      {/* 底部控制条：panel + btn；隐藏时完全不接收指针事件 */}
      <div className={`absolute inset-x-0 bottom-0 transition-opacity duration-200 ${showCtl ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        <div className="panel m-2 flex flex-wrap items-center gap-1.5 p-2">
          <button className="btn h-8 px-3 text-[0.8125rem]" onClick={() => {
            const el = document.documentElement as any
            try { el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.() } catch {}
            showControls()
          }}>全屏</button>
          <button className="btn h-8 px-3 text-[0.8125rem]" onClick={() => {
            const v = videoRef.current; if (!v) return
            v.muted = !v.muted; setMuted(v.muted)
            if (!v.muted) { soundUnlocked.current = true; v.play().catch(() => {}) }
            showControls()
          }}>{muted ? '开启声音' : '静音'}</button>
          <button className="btn h-8 px-3 text-[0.8125rem]" onClick={() => window.location.reload()}>重连</button>
          <button className="btn h-8 px-3 text-[0.8125rem]" onClick={() => { setShowKb(s => !s); showControls(false) }}>键盘</button>
          <button className="btn h-8 px-3 text-[0.8125rem]" onClick={() => { send({ type: 'move', nx: 0.5, ny: 0.5 }); send({ type: 'tap', nx: 0.5, ny: 0.5, button: 'right' }); showControls() }}>右键</button>
          <button className="btn h-8 px-3 text-[0.8125rem]" onClick={() => { send({ type: 'key', key: 'Escape' }); showControls() }}>Esc</button>
          <button className="btn h-8 px-3 text-[0.8125rem] text-danger" onClick={() => { setConfirmEnd(true); showControls(false) }}>结束游戏</button>
          <button className="btn h-8 px-3 text-[0.8125rem]" onClick={() => { window.location.href = '/' }}>返回游戏库</button>
        </div>
      </div>

      {/* 收起时只留一个小圆点，不挡画面 */}
      {!showCtl && (
        <button onClick={() => showControls()} aria-label="显示控制条"
          className="icon-btn absolute bottom-4 right-3 h-9 w-9 opacity-40">⋯</button>
      )}

      {/* 屏幕键盘 */}
      {showKb && (
        <div className="panel absolute inset-x-2.5 bottom-16 p-3">
          <input className="field h-9 w-full px-3 text-[1rem]" value={kbText} inputMode="text" autoFocus
            placeholder="输入后回车发送（逐字符注入）"
            onChange={e => { const c = e.target.value.slice(-1); if (c) { send({ type: 'key', key: c }); setKbText('') } else setKbText('') }}
            onKeyDown={e => { if (e.key === 'Enter') { send({ type: 'key', key: 'Enter' }); setKbText(''); e.preventDefault() } }} />
          <p className="mt-2 text-[0.75rem] leading-relaxed text-quaternary">
            单击画面 = 左键推进对话 · 长按 = 右键菜单 · 拖动 = 移动鼠标 · 双指上下滑 = 滚轮
          </p>
        </div>
      )}

      {/* 首次进入的提示（未连接时可见） */}
      {!connected && (
        <div className="pointer-events-none absolute inset-x-0 top-14 flex justify-center px-4">
          <div className="panel max-w-md p-3">
            <p className="text-[0.8125rem] leading-relaxed text-tertiary">
              {stats.state === '连接中…' ? '正在连接电脑…' : `状态：${stats.state}`}
              <br />单击画面 = 左键 · 长按 = 右键 · 拖动 = 移动 · 双指上下滑 = 滚轮
            </p>
          </div>
        </div>
      )}

      {/* 结束游戏确认（与设置弹窗同款的 panel 语言） */}
      {confirmEnd && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setConfirmEnd(false)} />
          <div className="panel relative w-full max-w-sm overflow-hidden radius-2xl border-strong shadow-token-lg">
            <h3 className="border-b border-hairline px-4 py-2.5 text-[0.875rem] font-semibold text-primary">结束电脑上的游戏？</h3>
            <div className="space-y-3 p-4">
              <p className="text-[0.8125rem] leading-relaxed text-tertiary">
                会结束正在串流的那一个游戏（连同其子进程），其它程序不受影响。游戏进度请先在游戏里保存。
              </p>
              <div className="flex items-center gap-2">
                <button className="btn h-8 px-3 text-[0.8125rem] text-danger" onClick={async () => {
                  try { await fetch('/api/stream/game', { method: 'POST' }) } catch {}
                  window.location.href = '/'
                }}>结束游戏</button>
                <button className="btn h-8 px-3 text-[0.8125rem]" onClick={() => setConfirmEnd(false)}>取消</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
