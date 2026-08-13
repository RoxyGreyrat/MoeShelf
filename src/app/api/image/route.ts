// /api/image —— 封面图片代理 + 本地缓存（S1 依据编译产物模块 1515 + 8026 重建）。
// 缓存：data/cache/images/<hash>.bin + <hash>.json（{contentType, savedAt}）。
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'
import { pathHashOf, resolveDataDir } from '@/lib/core'
import { fetchWithProxy, UA_STRING } from '@/lib/fetch'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function imagesDir(): Promise<string> {
  return path.join(await resolveDataDir(), 'cache', 'images')
}

interface FetchedImage {
  bytes: Buffer
  contentType: string
}

const inFlight = new Map<string, Promise<FetchedImage | null>>()

async function fetchImage(url: string): Promise<FetchedImage | null> {
  const host = new URL(url).hostname
  const referer = host.includes('ymgal')
    ? 'https://www.ymgal.games/'
    : host.includes('cngal') || host.includes('tucang')
      ? 'https://www.cngal.org/'
      : host.includes('bgm.tv')
        ? 'https://bgm.tv/'
        : undefined
  const headers: Record<string, string> = {
    'User-Agent': UA_STRING,
    Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
  }
  if (referer) headers.Referer = referer
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchWithProxy(url, { headers }, 25000)
      if (!res.ok) continue
      const bytes = Buffer.from(await res.arrayBuffer())
      if (bytes.length === 0 || bytes.length > 20971520) return null
      const contentType = res.headers.get('content-type') ?? ''
      if (/^text\/html/i.test(contentType)) return null
      return { bytes, contentType: contentType || 'image/jpeg' }
    } catch {
      // 重试
    }
  }
  return null
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url') ?? ''
  if (!/^https?:\/\//i.test(url)) {
    return new NextResponse('invalid url', { status: 400 })
  }
  const hash = pathHashOf(url)
  const dir = await imagesDir()
  const binFile = path.join(dir, `${hash}.bin`)
  const metaFile = path.join(dir, `${hash}.json`)

  // 磁盘缓存命中
  try {
    const [bytes, metaText] = await Promise.all([
      fs.readFile(binFile),
      fs.readFile(metaFile, 'utf-8'),
    ])
    const meta = JSON.parse(metaText)
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': meta.contentType ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
        'X-Image-Cache': 'disk',
      },
    })
  } catch {
    // 未命中，走远程抓取
  }

  let pending = inFlight.get(hash)
  if (!pending) {
    pending = fetchImage(url)
      .catch(() => null)
      .finally(() => inFlight.delete(hash))
    inFlight.set(hash, pending)
  }
  const fetched = await pending
  if (!fetched) {
    return new NextResponse('proxy error', { status: 502 })
  }
  try {
    await fs.mkdir(dir, { recursive: true })
    await Promise.all([
      fs.writeFile(binFile, fetched.bytes),
      fs.writeFile(
        metaFile,
        JSON.stringify({ contentType: fetched.contentType, savedAt: new Date().toISOString() })
      ),
    ])
  } catch (e) {
    console.error('[image] 写缓存失败:', e instanceof Error ? e.message : String(e))
  }
  return new NextResponse(new Uint8Array(fetched.bytes), {
    headers: {
      'Content-Type': fetched.contentType,
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      'X-Image-Cache': 'remote',
    },
  })
}
