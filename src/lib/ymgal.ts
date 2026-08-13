// ymgal 数据源（编译产物模块 7331，chunk 136）。
// OAuth client_credentials 令牌 + open API（JSON），无 HTML 解析。
// 导出对应：cT=scrapeYmgalByName、CC=searchYmgal、wK=getYmgalById、
//          JP=findYmgalIdByName、qd=getYmgalCharacters。
import { fetchWithProxy, UA_STRING } from './fetch'
import { similarityOf } from './similarity'
import type { CharacterEntry, GameData } from './source-types'

const YMGAL_BASE = 'https://www.ymgal.games'

interface YmgalSearchItem {
  id: number
  name: string
  chineseName?: string
  mainImg?: string
  releaseDate?: string
  orgName?: string
  score?: string
}

let tokenState: { token: string; expiresAt: number } | null = null

/** 模块 7331 的 l：获取/缓存 access_token（expires_in 缺省 2400s，提前 60s 过期） */
async function getToken(): Promise<string | null> {
  if (tokenState && Date.now() < tokenState.expiresAt) return tokenState.token
  try {
    const res = await fetchWithProxy(
      `${YMGAL_BASE}/oauth/token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': UA_STRING,
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: 'ymgal',
          client_secret: 'luna0327',
          scope: 'public',
        }).toString(),
      },
      12000
    )
    if (!res.ok) return null
    const json = await res.json().catch(() => null)
    if (!json?.access_token) return null
    tokenState = {
      token: json.access_token,
      expiresAt: Date.now() + (json.expires_in ?? 2400) * 1000 - 60000,
    }
    return tokenState.token
  } catch {
    return null
  }
}

/** 模块 7331 的 c：按关键词搜索（返回原始结果列表） */
export async function searchYmgal(keyword: string): Promise<YmgalSearchItem[]> {
  const token = await getToken()
  if (!token) return []
  try {
    const res = await fetchWithProxy(
      `${YMGAL_BASE}/open/archive/search-game?keyword=${encodeURIComponent(keyword)}&pageNum=1&pageSize=10&mode=list`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          version: '1',
          'User-Agent': UA_STRING,
          Accept: 'application/json',
        },
      },
      12000
    )
    if (!res.ok) return []
    const json = await res.json().catch(() => null)
    return json?.data?.result ?? []
  } catch {
    return []
  }
}

/** 模块 7331 s（cT）：按名称刮削（相似度 ≥0.4 选最佳） */
export async function scrapeYmgalByName(name: string): Promise<GameData | null> {
  const list = await searchYmgal(name)
  if (!list.length) return null
  let best: YmgalSearchItem | null = null
  let bestScore = 0
  for (const item of list) {
    const score = Math.max(similarityOf(name, item.name), similarityOf(name, item.chineseName ?? ''))
    if (score > bestScore) {
      bestScore = score
      best = item
    }
  }
  const pick = bestScore >= 0.4 ? best : null
  return pick
    ? {
        source: 'ymgal',
        title: pick.chineseName || pick.name || name,
        cnTitle: pick.chineseName || undefined,
        originalTitle: pick.chineseName ? pick.name : undefined,
        coverUrl: pick.mainImg,
        released: pick.releaseDate,
        developers: pick.orgName ? [pick.orgName] : undefined,
        rating: pick.score ? 10 * parseFloat(pick.score) : undefined,
        sourceUrl: `${YMGAL_BASE}/archive/${pick.id}`,
      }
    : null
}

/** 模块 7331 p（wK）：按 gid 取详情 */
export async function getYmgalById(gid: string): Promise<GameData | null> {
  const token = await getToken()
  if (!token) return null
  try {
    const res = await fetchWithProxy(
      `${YMGAL_BASE}/open/archive?gid=${gid}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          version: '1',
          'User-Agent': UA_STRING,
          Accept: 'application/json',
        },
      },
      12000
    )
    if (!res.ok) return null
    const json = await res.json().catch(() => null)
    const game = json?.data?.game
    if (!game?.gid) return null
    const title = game.chineseName || game.name || ''
    const orgName = game.releases?.find((r: { orgName?: string }) => r.orgName)?.orgName
    return {
      source: 'ymgal',
      title: title || game.name || '',
      cnTitle: game.chineseName || undefined,
      originalTitle: game.name && game.name !== title ? game.name : undefined,
      coverUrl: game.mainImg,
      released: game.releaseDate,
      description: game.introduction,
      developers: orgName ? [orgName] : undefined,
      sourceUrl: `${YMGAL_BASE}/archive/${game.gid}`,
    }
  } catch {
    return null
  }
}

/** 模块 7331 m（JP）：按名称搜索返回 gid（阈值 0.3，注意与 cT 的键序相反） */
export async function findYmgalIdByName(name: string): Promise<number | null> {
  if (!name) return null
  try {
    const list = await searchYmgal(name)
    if (!list.length) return null
    let best: YmgalSearchItem | null = null
    let bestScore = 0
    for (const item of list) {
      const score = Math.max(similarityOf(name, item.chineseName ?? ''), similarityOf(name, item.name))
      if (score > bestScore) {
        bestScore = score
        best = item
      }
    }
    if (best && bestScore >= 0.3) return best.id ?? null
    return null
  } catch {
    return null
  }
}

/** 模块 7331 d（qd）：按 gid 取角色（前 4 个，逐个按 cid 补图片，8s 超时） */
export async function getYmgalCharacters(gid: number): Promise<CharacterEntry[]> {
  if (!gid) return []
  const token = await getToken()
  if (!token) return []
  try {
    const res = await fetchWithProxy(
      `${YMGAL_BASE}/open/archive?gid=${gid}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          version: '1',
          'User-Agent': UA_STRING,
          Accept: 'application/json',
        },
      },
      12000
    )
    if (!res.ok) return []
    const json = await res.json().catch(() => null)
    const characters = json?.data?.game?.characters ?? []
    const cidMapping: Record<string, { name?: string }> = json?.data?.cidMapping ?? {}
    const list: Array<{ cid?: number; name: string; role: string; image?: string }> = characters
      .map((c: { cid?: number; characterPosition?: number }) => ({
        cid: c.cid,
        name: cidMapping[String(c.cid)]?.name || '',
        role: 1 === c.characterPosition ? '主角' : '配角',
      }))
      .filter((c: { name: string }) => c.name)
    if (!list.length) return []
    const top = list.slice(0, 4)
    await Promise.all(
      top.map(async (c) => {
        const cid = characters.find(
          (ch: { cid?: number }) => (cidMapping[String(ch.cid)]?.name || '') === c.name
        )?.cid
        if (cid) {
          try {
            const res2 = await fetchWithProxy(
              `${YMGAL_BASE}/open/archive?cid=${cid}`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  version: '1',
                  'User-Agent': UA_STRING,
                  Accept: 'application/json',
                },
              },
              8000
            )
            const json2 = await res2.json().catch(() => null)
            if (json2?.data?.character?.mainImg) c.image = json2.data.character.mainImg
          } catch {
            // 单条角色图片失败不影响整体
          }
        }
      })
    )
    return top
  } catch {
    return []
  }
}
