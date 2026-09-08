// /api/cn-description —— 中文简介（S2 依据编译产物模块 450 重建，扩展 moyu 优先）。
// 每个候选名称依次尝试 moyu（最优先）→ cngal → ymgal（搜索选最佳 ≥0.3 → 详情）→ bangumi，
// 取首个含汉字的 description；结果写入缓存条目 data.cnDescription。
import { NextRequest, NextResponse } from 'next/server'
import { cacheKeyOf, loadCacheGames, saveCacheEntry } from '@/lib/core'
import { scrapeMoyuChineseByName } from '@/lib/moyu'
import { scrapeCngalByName } from '@/lib/cngal'
import { searchYmgal, getYmgalById } from '@/lib/ymgal'
import type { YmgalSearchItem } from '@/lib/ymgal'
import { searchBangumi } from '@/lib/bangumi'
import { similarityOf } from '@/lib/similarity'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** 模块 450 的 m：描述需包含汉字才可用 */
function hasCjk(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text)
}

/** 模块 450 的 x：按名称列表依次尝试各源，返回首个中文简介 */
async function findChineseDescription(names: string[]): Promise<string | undefined> {
  for (const name of names) {
    if (!name || !name.trim()) continue
    try {
      const moyu = await scrapeMoyuChineseByName(name)
      if (moyu && hasCjk(moyu)) return moyu
    } catch {
      // 换下一源
    }
    try {
      const cngal = await scrapeCngalByName(name)
      if (cngal?.description && hasCjk(cngal.description)) return cngal.description
    } catch {
      // 换下一源
    }
    try {
      const list = await searchYmgal(name)
      if (list.length) {
        let best: YmgalSearchItem | null = null
        let bestScore = 0
        for (const item of list) {
          const score = Math.max(
            similarityOf(name, item.chineseName ?? ''),
            similarityOf(name, item.name)
          )
          if (score > bestScore) {
            bestScore = score
            best = item
          }
        }
        if (best && bestScore >= 0.3) {
          const detail = await getYmgalById(String(best.id))
          if (detail?.description && hasCjk(detail.description)) return detail.description
        }
      }
    } catch {
      // 换下一源
    }
    try {
      const bangumi = await searchBangumi(name)
      if (bangumi?.description && hasCjk(bangumi.description)) return bangumi.description
    } catch {
      // 换下一名称
    }
  }
}

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name')?.trim() ?? ''
  const title = req.nextUrl.searchParams.get('title')?.trim() ?? ''
  const hash = req.nextUrl.searchParams.get('hash')?.trim() ?? ''
  if (!name) {
    return NextResponse.json({ ok: false, error: '缺少 name 参数' }, { status: 400 })
  }
  const cacheKey = hash ? cacheKeyOf(name, hash) : `name::${name}`
  const entry = (await loadCacheGames())[cacheKey]
  if (entry?.data?.cnDescription !== undefined) {
    return NextResponse.json({ ok: true, cached: true, description: entry.data.cnDescription })
  }
  const names = [
    name,
    entry?.data?.officialCnTitle,
    title && title !== name ? title : '',
    entry?.data?.title,
  ].filter((n) => !!n && String(n).trim().length > 0) as string[]
  const description = await findChineseDescription(names)
  // 空结果也写入（存空字符串标记已查过），避免每次打开详情都重新抓取
  if (entry?.data) {
    entry.data.cnDescription = description ?? ''
    entry.scrapedAt = new Date().toISOString()
    await saveCacheEntry(entry)
  }
  return NextResponse.json({ ok: true, description: description ?? null })
}
