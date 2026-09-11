import { NextResponse } from 'next/server'
import { stream } from '@/lib/stream/session'
import { restoreTopmost } from '@/lib/stream/input-win32'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** 会话状态（采集端/手机端/前端 UI 都用它） */
export async function GET () {
  return NextResponse.json(stream.status())
}

/** 离开：{ role:'host'|'viewer' }；采集端退出时同时还原窗口置顶 */
export async function POST (req: Request) {
  let body: any = {}
  try { body = await req.json() } catch {}
  const role = body.role === 'host' ? 'host' : 'viewer'
  stream.bye(role)
  if (role === 'host') restoreTopmost()
  return NextResponse.json({ ok: true, ...stream.status() })
}
