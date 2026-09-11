import { NextResponse } from 'next/server'
import { readStreamConfig, writeStreamConfig, DEFAULT_CONFIG, type StreamConfig } from '@/lib/stream/config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** 读取手机串流质量设置：GET /api/stream/config */
export async function GET () {
  return NextResponse.json({ ok: true, config: readStreamConfig(), defaults: DEFAULT_CONFIG })
}

/** 保存手机串流质量设置：POST /api/stream/config（body 里给哪些字段就改哪些，reset:true 恢复默认） */
export async function POST (req: Request) {
  let body: any = {}
  try { body = await req.json() } catch {}
  const cfg: StreamConfig = { ...readStreamConfig() }
  const num = (v: any, lo: number, hi: number, d: number) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d
  }
  if (body.videoBitrateMbps !== undefined) cfg.videoBitrateMbps = num(body.videoBitrateMbps, 0, 500, cfg.videoBitrateMbps)
  if (body.scaleToWidth !== undefined) cfg.scaleToWidth = num(body.scaleToWidth, 0, 3840, cfg.scaleToWidth)
  if (body.frameRate !== undefined) cfg.frameRate = num(body.frameRate, 10, 60, cfg.frameRate)
  if (body.audioBitrateKbps !== undefined) cfg.audioBitrateKbps = num(body.audioBitrateKbps, 0, 512, cfg.audioBitrateKbps)
  if (body.contentHint !== undefined && ['text', 'detail', 'motion'].includes(String(body.contentHint))) cfg.contentHint = body.contentHint
  if (body.degradationPreference !== undefined && ['maintain-resolution', 'maintain-framerate', 'balanced'].includes(String(body.degradationPreference))) cfg.degradationPreference = body.degradationPreference
  if (body.audioHint !== undefined && ['music', 'speech'].includes(String(body.audioHint))) cfg.audioHint = body.audioHint
  if (body.disableAudioProcessing !== undefined) cfg.disableAudioProcessing = !!body.disableAudioProcessing
  if (body.preferH264 !== undefined) cfg.preferH264 = !!body.preferH264
  if (body.reset) Object.assign(cfg, DEFAULT_CONFIG)

  try {
    const p = writeStreamConfig(cfg)
    return NextResponse.json({ ok: true, config: cfg, path: p })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
