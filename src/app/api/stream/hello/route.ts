import { NextResponse } from 'next/server'
import { stream, type CaptureInfo } from '@/lib/stream/session'

export const dynamic = 'force-dynamic'

/**
 * 采集端 / 手机端注册。
 * body: { role:'host'|'viewer', agent?, capture?, game? }
 * 手机（viewer）进入即开新会话并通知采集端重新推流 → 退出重进也能自动恢复
 */
export async function POST (req: Request) {
  let body: any = {}
  try { body = await req.json() } catch {}
  const role = body.role === 'host' ? 'host' : 'viewer'
  const agent = String(body.agent || '').slice(0, 160)

  if (role === 'host') {
    const capture: CaptureInfo | null = body.capture ? {
      width: Number(body.capture.width) || undefined,
      height: Number(body.capture.height) || undefined,
      frameRate: Number(body.capture.frameRate) || undefined,
      label: body.capture.label ? String(body.capture.label) : undefined,
      surface: body.capture.surface ? String(body.capture.surface) : undefined,
      windowTitle: body.capture.windowTitle ? String(body.capture.windowTitle) : undefined,
      audio: !!body.capture.audio,
    } : null
    const s = stream.hostHello(agent, capture, body.game ? String(body.game) : undefined)
    return NextResponse.json({ ok: true, ...stream.status() })
  }

  stream.viewerHello(agent)
  return NextResponse.json({ ok: true, ...stream.status() })
}
