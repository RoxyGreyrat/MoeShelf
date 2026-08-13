// 服务端核心共享库（由子任务 S1 依据编译产物实现，见各函数说明）。
// 注意：所有导出名称与签名是 S1/S2 的约定接口，实现时保持兼容。
import path from 'path'
import type {
  CacheEntry,
  CacheFile,
  LibraryGame,
  PlaytimeFile,
  Settings,
} from './types'

/** data 根目录（编译产物模块 8621 中的实现为准） */
export function dataDir(): string {
  return path.join(process.cwd(), 'data')
}

/** data 下相对路径拼接 */
export function dataPath(...parts: string[]): string {
  return path.join(dataDir(), ...parts)
}

/** 读取 JSON 文件，失败或缺失时返回 fallback */
export function readJson<T>(file: string, fallback: T): Promise<T> {
  throw new Error('TODO: S1 实现（按编译产物）')
}

/**
 * 原子写 JSON；每次写入前把旧文件备份到 data/backup/<name>.<yyyyMMdd-HHmmss>.json，
 * 保留最近 5 份（新功能要求）。
 */
export function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  throw new Error('TODO: S1 实现')
}

export function loadSettings(): Promise<Settings> {
  throw new Error('TODO: S1 实现')
}

export function saveSettings(settings: Settings): Promise<void> {
  throw new Error('TODO: S1 实现')
}

export function loadLibrary(): Promise<LibraryGame[]> {
  throw new Error('TODO: S1 实现')
}

export function saveLibrary(games: LibraryGame[]): Promise<void> {
  throw new Error('TODO: S1 实现')
}

export function loadCache(): Promise<CacheFile> {
  throw new Error('TODO: S1 实现')
}

/** 保存/更新一条刮削缓存（键为 entry.key，写入 cache.json 的 games 对象） */
export function saveCacheEntry(entry: CacheEntry): Promise<void> {
  throw new Error('TODO: S1 实现')
}

export function loadPlaytime(): Promise<PlaytimeFile> {
  throw new Error('TODO: S1 实现')
}

export function savePlaytime(file: PlaytimeFile): Promise<void> {
  throw new Error('TODO: S1 实现')
}

/** 累加游玩时长（playtime.json），hash 为游戏 pathHash */
export function addPlaytime(
  hash: string,
  minutes: number,
  playedAt: number
): Promise<void> {
  throw new Error('TODO: S1 实现')
}

/** 由文件夹路径计算 8 位 hex pathHash（编译产物模块 644 的实现为准） */
export function pathHashOf(p: string): string {
  throw new Error('TODO: S1 实现')
}

/** 缓存键构建：`${folderName}::${pathHash}`（编译产物模块 644 kw 的实现为准） */
export function cacheKeyOf(folderName: string, pathHash: string): string {
  return `${folderName}::${pathHash}`
}

/** 路径安全校验（编译产物模块 2849 的实现为准） */
export function isPathAllowed(p: string): Promise<boolean> {
  throw new Error('TODO: S1 实现')
}

export const PATH_DENIED_REASON = 'TODO: S1 实现'
