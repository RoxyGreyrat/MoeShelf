// /api/settings —— 设置读写（S1 依据编译产物模块 5595 + 3247 重建）。
import { NextResponse } from 'next/server'
import { loadSettings, updateSettings } from '@/lib/core'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const settings = await loadSettings()
  return NextResponse.json({ ok: true, settings })
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    // 【防覆盖】exeMap / coverMap / titleMap / devMap 是按游戏哈希索引的映射表：
    // 客户端每次保存都会把整张 map 发上来（基于可能已过期的内存快照）。
    // 这里把这些字段声明为「按键合并」，真正的合并发生在 core.updateSettings 的
    // 串行临界区内部 —— 若在路由里先行合并，两个并发请求会各自基于同一份旧快照
    // 算出相同结果，后写方仍会抹掉先写方的键。
    const settings = await updateSettings(
      {
        rootPath: typeof body.rootPath === 'string' ? body.rootPath.trim() : undefined,
        filterMode: body.filterMode as string | undefined,
        exeMap: body.exeMap as Record<string, string> | undefined,
        coverMap: body.coverMap as Record<string, string> | undefined,
        titleMap: body.titleMap as Record<string, string> | undefined,
        devMap: body.devMap as Record<string, string> | undefined,
        proxy: typeof body.proxy === 'string' ? body.proxy.trim() : undefined,
        ignorePaths: Array.isArray(body.ignorePaths) ? body.ignorePaths : undefined,
      },
      ['exeMap', 'coverMap', 'titleMap', 'devMap'],
    )
    return NextResponse.json({ ok: true, settings })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: '参数错误：' + (e instanceof Error ? e.message : String(e)) },
      { status: 400 }
    )
  }
}
