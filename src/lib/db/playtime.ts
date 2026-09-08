// playtime 表操作。语义与旧 JSON 实现一致：
// minutes 保留一位小数；lastPlayed 记录最近一次（ISO）；merge 时取较新的时间。
import type Database from 'better-sqlite3'
import { getDb, withTransaction } from './index'
import type { PlaytimeFile, PlaytimeGame } from '../types'

interface PlaytimeRow {
  game_hash: string
  minutes: number
  sessions: number
  last_played: string | null
}

const round1 = (n: number) => Math.round(n * 10) / 10

export async function getPlaytimeMap(): Promise<Record<string, PlaytimeGame>> {
  const db = await getDb()
  const rows = db.prepare('SELECT * FROM playtime').all() as PlaytimeRow[]
  const out: Record<string, PlaytimeGame> = {}
  for (const r of rows) {
    out[r.game_hash] = {
      minutes: typeof r.minutes === 'number' ? r.minutes : 0,
      sessions: typeof r.sessions === 'number' ? r.sessions : 0,
      lastPlayed: r.last_played ?? '',
    }
  }
  return out
}

export async function getPlaytimeFile(): Promise<PlaytimeFile> {
  const games = await getPlaytimeMap()
  return { version: 1, updatedAt: new Date().toISOString(), games }
}

export async function replaceAllPlaytime(map: Record<string, PlaytimeGame>): Promise<void> {
  await withTransaction((db) => {
    db.prepare('DELETE FROM playtime').run()
    const ins = db.prepare(
      'INSERT OR REPLACE INTO playtime (game_hash, minutes, sessions, last_played) VALUES (?, ?, ?, ?)'
    )
    for (const [hash, g] of Object.entries(map)) {
      ins.run(hash, round1(g?.minutes ?? 0), g?.sessions ?? 0, g?.lastPlayed || null)
    }
  })
}

/**
 * 累加（UPSERT，不整体读回）。阈值判断（minutes>0.15、hash 非空）由调用方保留，
 * 这里只做数值语义：一位小数、skipSession 不增加次数、lastPlayed 取本次。
 */
export async function accumulateGame(
  hash: string,
  minutes: number,
  playedAt: number,
  skipSession: boolean
): Promise<void> {
  const db = await getDb()
  db.prepare(
    `INSERT INTO playtime (game_hash, minutes, sessions, last_played) VALUES (?, ?, ?, ?)
     ON CONFLICT(game_hash) DO UPDATE SET
       minutes = round(playtime.minutes + excluded.minutes, 1),
       sessions = playtime.sessions + excluded.sessions,
       last_played = excluded.last_played`
  ).run(hash, round1(minutes), skipSession ? 0 : 1, new Date(playedAt).toISOString())
}

/** 修改路径后合并旧/新 hash 的时长（旧值并入新键并删除旧键） */
export async function migratePlaytimeHash(oldHash: string, newHash: string): Promise<void> {
  if (!oldHash || !newHash || oldHash === newHash) return
  const db = await getDb()
  const old = db
    .prepare('SELECT minutes, sessions, last_played FROM playtime WHERE game_hash = ?')
    .get(oldHash) as PlaytimeRow | undefined
  if (!old) return
  const cur = db
    .prepare('SELECT minutes, sessions, last_played FROM playtime WHERE game_hash = ?')
    .get(newHash) as PlaytimeRow | undefined
  const minutes = round1((cur?.minutes ?? 0) + (old.minutes ?? 0))
  const sessions = (cur?.sessions ?? 0) + (old.sessions ?? 0)
  const lastPlayed = [cur?.last_played ?? '', old.last_played ?? '']
    .filter(Boolean)
    .sort()
    .pop() || ''
  db.prepare(
    `INSERT INTO playtime (game_hash, minutes, sessions, last_played) VALUES (?, ?, ?, ?)
     ON CONFLICT(game_hash) DO UPDATE SET
       minutes = excluded.minutes,
       sessions = excluded.sessions,
       last_played = excluded.last_played`
  ).run(newHash, minutes, sessions, lastPlayed || null)
  db.prepare('DELETE FROM playtime WHERE game_hash = ?').run(oldHash)
}

export async function deletePlaytime(hash: string): Promise<void> {
  const db = await getDb()
  db.prepare('DELETE FROM playtime WHERE game_hash = ?').run(hash)
}
