// /api/proxy-test —— 代理连通性测试（S1 依据编译产物模块 8264 + 1085/3247 重建）。
import { NextResponse } from 'next/server'
import { ProxyAgent } from 'undici'
import { loadSettings } from '@/lib/core'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const TESTS = [
  {
    name: 'VNDB',
    url: 'https://api.vndb.org/kana/vn',
    method: 'POST',
    body: JSON.stringify({ filters: ['id', '=', 'v17'], fields: 'title', results: 1 }),
  },
  {
    name: 'Bangumi',
    url: 'https://api.bgm.tv/search/subject/ever17?type=4',
    method: 'GET',
  },
]

export async function GET() {
  let agent: ProxyAgent
  const proxy = ((await loadSettings()).proxy ?? '').trim()
  if (!proxy) {
    return NextResponse.json({ ok: false, configured: false, message: '未配置代理' })
  }
  if (!/^https?:\/\//i.test(proxy)) {
    return NextResponse.json({
      ok: false,
      configured: true,
      message: '代理地址需以 http:// 或 https:// 开头',
    })
  }
  try {
    agent = new ProxyAgent(proxy)
  } catch {
    return NextResponse.json({ ok: false, configured: true, message: '代理地址格式无效' })
  }
  const results: Array<{
    name: string
    ok: boolean
    status?: number
    ms: number
    error?: string
  }> = []
  for (const test of TESTS) {
    const start = Date.now()
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10000)
      const res = await fetch(
        test.url,
        {
          method: test.method,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0 Moeshelf/1.6.0',
          },
          body: test.method === 'POST' ? test.body : undefined,
          // undici 的 dispatcher 不是标准 RequestInit 字段，运行时由 undici fetch 消费
          dispatcher: agent,
          signal: controller.signal,
        } as unknown as RequestInit
      )
      clearTimeout(timer)
      results.push({
        name: test.name,
        ok: res.ok || res.status === 404,
        status: res.status,
        ms: Date.now() - start,
      })
    } catch (e) {
      results.push({
        name: test.name,
        ok: false,
        ms: Date.now() - start,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return NextResponse.json({ ok: results.some((r) => r.ok), configured: true, results })
}
