// scrape_cache 表操作。行为保持旧 cache.json 语义：
// schema 恒为 CACHE_SCHEMA(2)；ScrapedData 整体 JSON 存 data_json；
// 新鲜度：成功 90 天 / 失败 3 天，且 scrapedAt 不能在未来。
import type Database from 'better-sqlite3'
import { getDb, maybeAutoBackupDb, withTransaction } from './index'
import type { CacheEntry, CacheFile, ScrapedData } from '../types'

export const CACHE_SCHEMA = 2

interface CacheRow {
  cache_key: string
  schema_version: number
  name: string | null
  folder_path: string | null
  scraped_at: string
  success: number
  data_json: string
}

export function rowToEntry(r: CacheRow): CacheEntry {
  let data: ScrapedData | null = null
  try {
    data = r.data_json && r.data_json !== 'null' ? (JSON.parse(r.data_json) as ScrapedData) : null
  } catch {
    data = null
  }
  return {
    key: r.cache_key,
    name: r.name ?? r.cache_key,
    schema: r.schema_version,
    scrapedAt: r.scraped_at,
    success: r.success === 1,
    data,
    folderPath: r.folder_path ?? undefined,
  }
}

export function entryToParams(e: CacheEntry): Array<string | number | null> {
  return [
    e.key,
    CACHE_SCHEMA,
    e.name ?? e.key,
    e.folderPath ?? null,
    e.scrapedAt,
    e.success ? 1 : 0,
    e.data == null ? 'null' : JSON.stringify(e.data),
  ]
}

const CACHE_COLS =
  'cache_key, schema_version, name, folder_path, scraped_at, success, data_json'
const CACHE_Q = Array.from({ length: 7 }, () => '?').join(', ')

/** 新鲜度（同旧 core.isCacheFresh：成功 90 天 / 失败 3 天，且不晚于现在） */
export function isCacheFresh(entry: CacheEntry): boolean {
  const age = Date.now() - new Date(entry.scrapedAt).getTime()
  const maxAge = entry.success ? 7776e6 : 2592e5
  return age >= 0 && age < maxAge
}

export async function loadCacheEntries(): Promise<Record<string, CacheEntry>> {
  const db = await getDb()
  const rows = db.prepare('SELECT * FROM scrape_cache').all() as CacheRow[]
  const out: Record<string, CacheEntry> = {}
  for (const r of rows) out[r.cache_key] = rowToEntry(r)
  return out
}

export async function loadCacheFile(): Promise<CacheFile> {
  const games = await loadCacheEntries()
  return { version: 1, updatedAt: new Date().toISOString(), games }
}

/** 单条写入（UPSERT，schema 强制 =2，位置参数） */
export async function saveCacheEntry(entry: CacheEntry): Promise<void> {
  const db = await getDb()
  db.prepare(
    `INSERT INTO scrape_cache (${CACHE_COLS}) VALUES (${CACHE_Q})
     ON CONFLICT(cache_key) DO UPDATE SET
       schema_version = excluded.schema_version,
       name = excluded.name,
       folder_path = excluded.folder_path,
       scraped_at = excluded.scraped_at,
       success = excluded.success,
       data_json = excluded.data_json`
  ).run(entryToParams({ ...entry, schema: CACHE_SCHEMA }))
  void maybeAutoBackupDb()
}

/** 全量写回（事务） */
export async function saveCacheGames(entries: Record<string, CacheEntry>): Promise<void> {
  await withTransaction((db) => {
    db.prepare('DELETE FROM scrape_cache').run()
    const ins = db.prepare(`INSERT INTO scrape_cache (${CACHE_COLS}) VALUES (${CACHE_Q})`)
    for (const e of Object.values(entries)) ins.run(entryToParams(e))
  })
}

export async function clearCache(): Promise<void> {
  const db = await getDb()
  db.prepare('DELETE FROM scrape_cache').run()
  void maybeAutoBackupDb()
}

/** 按键取新鲜缓存数据；无有效数据返回 null */
export async function getCacheData(key: string): Promise<ScrapedData | null> {
  const db = await getDb()
  const row = db
    .prepare('SELECT * FROM scrape_cache WHERE cache_key = ?')
    .get(key) as CacheRow | undefined
  if (!row) return null
  const entry = rowToEntry(row)
  return entry.schema === CACHE_SCHEMA && isCacheFresh(entry) ? entry.data : null
}

/** 路径修改后重命名缓存键（保持 folderName::pathHash 语义） */
export async function renameCacheKey(
  oldKey: string,
  newKey: string,
  newName?: string,
  newFolderPath?: string
): Promise<boolean> {
  if (!oldKey || oldKey === newKey) return false
  const db = await getDb()
  const row = db
    .prepare('SELECT * FROM scrape_cache WHERE cache_key = ?')
    .get(oldKey) as CacheRow | undefined
  if (!row) return false
  if (db.prepare('SELECT 1 FROM scrape_cache WHERE cache_key = ?').get(newKey)) return false
  db.prepare(
    `UPDATE scrape_cache SET cache_key = ?, name = ?, folder_path = ?
     WHERE cache_key = ?`
  ).run(
    newKey,
    newName || row.name || newKey,
    newFolderPath ?? row.folder_path ?? null,
    oldKey
  )
  return true
}
