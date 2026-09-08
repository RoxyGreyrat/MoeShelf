// SQLite schema（better-sqlite3）。表与索引保持最小且贴合实际查询。
// 说明：library 的标题/中文标题/开发商/封面并非 library.json 固有字段，
// 其真值来自 cache（元数据）与 settings 映射；games 中的 title/title_cn/
// developer/cover_url 是派生镜像列（保存时可同步，用于索引查询），允许为 NULL。
import type Database from 'better-sqlite3'

export const DB_SCHEMA_VERSION = 1

export function ensureSchema(db: Database.Database): void {
  db.exec(`
CREATE TABLE IF NOT EXISTS games (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  path_hash       TEXT NOT NULL UNIQUE,
  folder_name     TEXT NOT NULL,
  folder_path     TEXT NOT NULL,
  file_count      INTEGER NOT NULL DEFAULT 0,
  exe_candidates  TEXT NOT NULL DEFAULT '[]',
  match_score     REAL,
  matched_types   TEXT,
  root_path       TEXT,
  saved_at        TEXT NOT NULL,
  completed       INTEGER NOT NULL DEFAULT 0,
  completed_at    TEXT,
  added_at        TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  title           TEXT,
  title_cn        TEXT,
  developer       TEXT,
  cover_url       TEXT
);
CREATE INDEX IF NOT EXISTS idx_games_folder_path ON games(folder_path);
CREATE INDEX IF NOT EXISTS idx_games_title      ON games(title);
CREATE INDEX IF NOT EXISTS idx_games_title_cn   ON games(title_cn);
CREATE INDEX IF NOT EXISTS idx_games_developer  ON games(developer);
CREATE INDEX IF NOT EXISTS idx_games_added_at   ON games(added_at);
CREATE INDEX IF NOT EXISTS idx_games_updated_at ON games(updated_at);
CREATE INDEX IF NOT EXISTS idx_games_completed  ON games(completed);

CREATE TABLE IF NOT EXISTS playtime (
  game_hash   TEXT PRIMARY KEY,
  minutes     REAL NOT NULL DEFAULT 0,
  sessions    INTEGER NOT NULL DEFAULT 0,
  last_played TEXT
);

CREATE TABLE IF NOT EXISTS scrape_cache (
  cache_key      TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  name           TEXT,
  folder_path    TEXT,
  scraped_at     TEXT NOT NULL,
  success        INTEGER NOT NULL DEFAULT 0,
  data_json      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scrape_cache_success ON scrape_cache(success);
CREATE INDEX IF NOT EXISTS idx_scrape_cache_scraped ON scrape_cache(scraped_at);

CREATE TABLE IF NOT EXISTS migration_log (
  key     TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  run_at  TEXT NOT NULL
);
`)
  const v = db.pragma('user_version', { simple: true }) as number
  if (!v) db.pragma(`user_version = ${DB_SCHEMA_VERSION}`)
}
