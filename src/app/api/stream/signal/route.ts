import { NextResponse } from 'next/server'
import { stream, type SignalMsg } from '@/lib/stream/session'

export const dynamic = 'force-dynamic'

/** 取走发给自己的信令（同时刷新心跳）。GET /api/stream/signal?role=host */
export async function GET (req: Request) {
  const role = new URL(req.url).searchParams.get('role') === 'host' ? 'host' : 'viewer'
  const msgs = stream.drain(role)
  return NextResponse.json({ msgs, ...stream.status() })
}

/** 投递信令给对端。body: { role:'host'|'viewer', msg:{ type, sdp?, candidate? } } */
export async function POST (req: Request) {
  let body: any = {}
  try { body = await req.json() } catch {}
  const role = body.role === 'host' ? 'host' : 'viewer'
  const msg: SignalMsg = body.msg && typeof body.msg === 'object' ? body.msg : { type: 'unknown' }
  stream.push(role === 'host' ? 'viewer' : 'host', msg)
  stream.touch(role)
  return NextResponse.json({ ok: true })
}
