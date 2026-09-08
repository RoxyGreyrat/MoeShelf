// 一次性 JSON → SQLite 迁移。只读旧 JSON、不改不删；成功后把三个 JSON 复制到
// data/migration-backup/ 并写入 migration_log。失败抛出 → 上层删除本次创建的
// 数据库文件并保留旧 JSON。
import path from 'path'
import fsp from 'fs/promises'
import type Database from 'better-sqlite3'
import { replaceAllGames, getAllGames } from './games'
import { replaceAllPlaytime, getPlaytimeMap } from './playtime'
import { saveCacheGames, loadCacheEntries, CACHE_SCHEMA } from './scrape-cache'
import type { CacheEntry, LibraryGame, PlaytimeGame } from '../types'

async function readJsonSafe<T>(file: string): Promise<T | null> {
  try {
    const text = await fsp.readFile(file, 'utf-8')
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

function asGames(v: unknown): LibraryGame[] {
  const g = v as { games?: unknown }
  return Array.isArray(g?.games) ? (g.games as LibraryGame[]) : []
}

function asPlaytime(v: unknown): Record<string, PlaytimeGame> {
  const p = v as { games?: unknown }
  return p?.games && typeof p.games === 'object' && !Array.isArray(p.games)
    ? (p.games as Record<string, PlaytimeGame>)
    : {}
}

function asCache(v: unknown): Record<string, CacheEntry> {
  const c = v as { games?: unknown }
  return c?.games && typeof c.games === 'object' && !Array.isArray(c.games)
    ? (c.games as Record<string, CacheEntry>)
    : {}
}

/** 首次打开时调用：若 db 无迁移记录且存在旧 JSON，则执行一次性导入。 */
export async function migrateIfLegacy(db: Database.Database, dir: string): Promise<void> {
  const logRow = db.prepare('SELECT 1 FROM migration_log WHERE key = ?').get('json-migration')
  if (logRow) return

  const libFile = path.join(dir, 'library.json')
  const ptFile = path.join(dir, 'playtime.json')
  const cacheFile = path.join(dir, 'cache.json')
  const [libRaw, ptRaw, cacheRaw] = await Promise.all([
    readJsonSafe<unknown>(libFile),
    readJsonSafe<unknown>(ptFile),
    readJsonSafe<unknown>(cacheFile),
  ])
  const hasAny = libRaw !== null || ptRaw !== null || cacheRaw !== null
  if (!hasAny) {
    db.prepare(
      'INSERT OR IGNORE INTO migration_log (key, version, run_at) VALUES (?, ?, ?)'
    ).run('json-migration', 1, new Date().toISOString())
    return
  }

  // 1) library
  const games = libRaw ? asGames(libRaw) : []
  await replaceAllGames(games)
  const gamesInDb = await getAllGames()
  if (games.length !== gamesInDb.length) {
    throw new Error(
      `library 迁移数量不一致：源 ${games.length} / 库 ${gamesInDb.length}`
    )
  }
  // 2) playtime
  const playtime = ptRaw ? asPlaytime(ptRaw) : {}
  await replaceAllPlaytime(playtime)
  const ptInDb = await getPlaytimeMap()
  if (Object.keys(playtime).length !== Object.keys(ptInDb).length) {
    throw new Error(
      `playtime 迁移数量不一致：源 ${Object.keys(playtime).length} / 库 ${Object.keys(ptInDb).length}`
    )
  }
  // 3) cache（force schema；key 兜底用对象键，兼容个别缺 key 字段的旧条目）
  const cache = cacheRaw ? asCache(cacheRaw) : {}
  const forced: Record<string, CacheEntry> = {}
  for (const [k, e] of Object.entries(cache)) {
    const key = e.key && typeof e.key === 'string' ? e.key : k
    forced[key] = { ...e, key, schema: CACHE_SCHEMA }
  }
  await saveCacheGames(forced)
  const cacheInDb = await loadCacheEntries()
  if (Object.keys(forced).length !== Object.keys(cacheInDb).length) {
    throw new Error(
      `cache 迁移数量不一致：源 ${Object.keys(forced).length} / 库 ${Object.keys(cacheInDb).length}`
    )
  }
  // 4) 备份旧 JSON（不删除）
  const backupDir = path.join(dir, 'migration-backup')
  await fsp.mkdir(backupDir, { recursive: true })
  for (const [src, dst] of [
    [libFile, path.join(backupDir, 'library.json')],
    [ptFile, path.join(backupDir, 'playtime.json')],
    [cacheFile, path.join(backupDir, 'cache.json')],
  ]) {
    try {
      await fsp.copyFile(src, dst)
    } catch {
      // 某一份缺失也允许继续（可能仅部分旧文件存在）
    }
  }
  // 5) 标记完成
  db.prepare(
    'INSERT OR REPLACE INTO migration_log (key, version, run_at) VALUES (?, ?, ?)'
  ).run('json-migration', 1, new Date().toISOString())
}
