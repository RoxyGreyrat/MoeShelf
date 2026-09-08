// games 表操作：保持 LibraryGame 结构与 pathHash 语义。
import type Database from 'better-sqlite3'
import { getDb, maybeAutoBackupDb, withTransaction } from './index'
import type { LibraryGame } from '../types'

interface GameRow {
  path_hash: string
  folder_name: string
  folder_path: string
  file_count: number
  exe_candidates: string
  match_score: number | null
  matched_types: string | null
  root_path: string | null
  saved_at: string
  completed: number
  completed_at: string | null
  added_at: string
  updated_at: string
  title: string | null
  title_cn: string | null
  developer: string | null
  cover_url: string | null
}

function jsonArr<T>(raw: string | null, fallback: T): T {
  if (raw === null || raw === '') return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function rowToGame(r: GameRow): LibraryGame {
  return {
    folderName: r.folder_name,
    folderPath: r.folder_path,
    pathHash: r.path_hash,
    fileCount: r.file_count,
    exeCandidates: jsonArr<LibraryGame['exeCandidates']>(r.exe_candidates, []),
    matchScore: r.match_score == null ? 0 : r.match_score,
    matchedTypes: jsonArr<string[]>(r.matched_types, []),
    rootPath: r.root_path ?? '',
    savedAt: r.saved_at,
    completed: r.completed === 1 ? true : undefined,
    completedAt: r.completed_at ?? undefined,
  }
}

/** 游戏写入列（位置参数，顺序固定） */
const GAME_COLS =
  'path_hash, folder_name, folder_path, file_count, exe_candidates, match_score, matched_types, root_path, saved_at, completed, completed_at, added_at, updated_at'

function gameToParams(g: LibraryGame): Array<string | number | null> {
  const now = new Date().toISOString()
  return [
    g.pathHash,
    g.folderName,
    g.folderPath,
    g.fileCount ?? 0,
    JSON.stringify(Array.isArray(g.exeCandidates) ? g.exeCandidates : []),
    typeof g.matchScore === 'number' ? g.matchScore : null,
    Array.isArray(g.matchedTypes) && g.matchedTypes.length ? JSON.stringify(g.matchedTypes) : null,
    g.rootPath || null,
    g.savedAt,
    g.completed === true ? 1 : 0,
    g.completedAt || null,
    g.savedAt || now,
    now,
  ]
}

const GAME_Q = Array.from({ length: 13 }, () => '?').join(', ')

function insert(db: Database.Database, g: LibraryGame): void {
  db.prepare(`INSERT OR REPLACE INTO games (${GAME_COLS}) VALUES (${GAME_Q})`).run(gameToParams(g))
}

export async function getAllGames(): Promise<LibraryGame[]> {
  const db = await getDb()
  const rows = db.prepare('SELECT * FROM games').all() as GameRow[]
  return rows.map(rowToGame)
}

export async function getGameByHash(hash: string): Promise<LibraryGame | null> {
  const db = await getDb()
  const row = db.prepare('SELECT * FROM games WHERE path_hash = ?').get(hash) as GameRow | undefined
  return row ? rowToGame(row) : null
}

/** 全量替换（扫描/导入等）；事务保证原子 */
export async function replaceAllGames(games: LibraryGame[]): Promise<void> {
  await withTransaction((db) => {
    db.prepare('DELETE FROM games').run()
    const ins = db.prepare(`INSERT INTO games (${GAME_COLS}) VALUES (${GAME_Q})`)
    for (const g of games) ins.run(gameToParams(g))
  })
}

export async function upsertGame(g: LibraryGame): Promise<void> {
  const db = await getDb()
  insert(db, g)
  void maybeAutoBackupDb()
}

export async function deleteGameByHash(hash: string): Promise<void> {
  const db = await getDb()
  db.prepare('DELETE FROM games WHERE path_hash = ?').run(hash)
  void maybeAutoBackupDb()
}

/** 批量删除（事务） */
export async function deleteGamesByHashes(hashes: string[]): Promise<void> {
  if (!hashes.length) return
  await withTransaction((db) => {
    const del = db.prepare('DELETE FROM games WHERE path_hash = ?')
    for (const h of hashes) del.run(h)
  })
}
