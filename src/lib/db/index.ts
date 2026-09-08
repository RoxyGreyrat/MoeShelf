// db 入口：解析数据目录 → 打开/复用单例连接（WAL + busy_timeout）→ 初始化 schema
// → 首次打开且存在旧 JSON 时执行一次性迁移（见 migration.ts）。
// 注意：本模块不 import core.ts（避免循环依赖），数据目录解析逻辑与 core 保持一致。
import path from 'path'
import fsp from 'fs/promises'
import Database from 'better-sqlite3'
import { ensureSchema } from './schema'
import { migrateIfLegacy } from './migration'

let handle: Database.Database | null = null
let handleDir: string | null = null
let opening: Promise<Database.Database> | null = null

/** 与 core.resolveDataDir() 等价的目录解析（location.json 优先） */
export async function databaseDir(): Promise<string> {
  const base = process.env.MOESHELF_DATA_DIR
    ? path.resolve(process.env.MOESHELF_DATA_DIR)
    : path.join(process.cwd(), 'data')
  try {
    const loc = path.join(base, 'location.json')
    const text = await fsp.readFile(loc, 'utf-8')
    const parsed = JSON.parse(text)
    if (typeof parsed.dataPath === 'string' && parsed.dataPath.trim()) {
      return path.resolve(parsed.dataPath)
    }
  } catch {
    // 无 location.json → 默认目录
  }
  return base
}

/** 当前打开的数据库句柄；未初始化时为 null（测试/管理用） */
export function currentDb(): Database.Database | null {
  return handle
}

/** 获取单例连接（必要时打开并迁移） */
export function getDb(): Promise<Database.Database> {
  if (handle) return Promise.resolve(handle)
  if (opening) return opening
  opening = (async () => {
    const dir = await databaseDir()
    if (handle && handleDir === dir) return handle
    if (handle) closeDb()
    let db: Database.Database | null = null
    try {
      await fsp.mkdir(dir, { recursive: true })
      db = new Database(path.join(dir, 'moeshelf.db'))
      db.pragma('journal_mode = WAL')
      db.pragma('busy_timeout = 5000')
      // 先赋值，迁移期间内部各模块 getDb() 复用同一句柄，避免自等 opening
      handle = db
      handleDir = dir
      ensureSchema(db)
      await migrateIfLegacy(db, dir)
    } catch (err) {
      // 打开/迁移失败：打印原因（供 CI/日志排查），回滚——删除本次创建的不完整库文件
      try {
        console.error(
          '[db] open/migrate failed:',
          err && (err as Error).message ? (err as Error).message : err,
          err && (err as Error).stack ? '\n' + (err as Error).stack : ''
        )
      } catch {
        // ignore logging errors
      }
      try {
        if (db) db.close()
      } catch {
        // ignore
      }
      for (const suffix of ['', '-wal', '-shm']) {
        const p = path.join(dir, 'moeshelf.db' + suffix)
        try {
          await fsp.unlink(p)
        } catch {
          // ignore
        }
      }
      handle = null
      handleDir = null
      throw err
    }
    if (!db) throw new Error('database handle unavailable')
    return db
  })()
  return opening.finally(() => {
    opening = null
  })
}

/** 关闭连接（数据目录迁移等场景使用） */
export function closeDb(): void {
  try {
    if (handle) handle.close()
  } catch {
    // 忽略关闭异常
  }
  handle = null
  handleDir = null
}

/** 一致性备份当前库到目标（better-sqlite3 backup API），返回目标路径 */
export async function backupDbTo(targetPath: string): Promise<string> {
  const db = await getDb()
  await fsp.mkdir(path.dirname(targetPath), { recursive: true })
  await db.backup(targetPath)
  return targetPath
}

function stamp(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

let lastAutoBackupAt = 0
const BACKUP_KEEP = 5

/** 自动备份：写路径调用（60s 去抖），产物 data/backup/moeshelf.YYYYMMDD-HHmmss.db，保留最近 5 份 */
export async function maybeAutoBackupDb(): Promise<void> {
  try {
    const now = Date.now()
    if (now - lastAutoBackupAt < 60000) return
    const db = await getDb()
    const dir = await databaseDir()
    const bdir = path.join(dir, 'backup')
    await fsp.mkdir(bdir, { recursive: true })
    const file = path.join(bdir, `moeshelf.${stamp(new Date())}.db`)
    await db.backup(file)
    lastAutoBackupAt = now
    const files = (await fsp.readdir(bdir)).filter((f) => /^moeshelf\.\d{8}-\d{6}\.db$/.test(f)).sort()
    for (const old of files.slice(0, Math.max(0, files.length - BACKUP_KEEP))) {
      await fsp.unlink(path.join(bdir, old)).catch(() => {})
    }
  } catch {
    // 自动备份失败不影响主流程
  }
}

/** 应用级事务包装：fn 内使用 db 句柄（同步 SQL 操作），成功后触发自动备份 */
export async function withTransaction<T>(fn: (db: Database.Database) => T): Promise<T> {
  const db = await getDb()
  const run = db.transaction(fn as unknown as (...args: unknown[]) => T) as () => T
  const result = run()
  void maybeAutoBackupDb()
  return result
}

/** 供 better-sqlite3 实例化/版本诊断使用 */
export { Database }
