// 数据模型契约：字段名与结构必须与现有 data 文件 100% 兼容。

export interface Settings {
  rootPath: string
  filterMode: string
  exeMap: Record<string, string>
  coverMap: Record<string, string>
  titleMap: Record<string, string>
  devMap: Record<string, string>
  proxy: string
  ignorePaths: string[]
  [key: string]: unknown
}

export interface ExeCandidate {
  name: string
  path: string
}

export interface LibraryGame {
  folderName: string
  folderPath: string
  pathHash: string
  fileCount: number
  exeCandidates: ExeCandidate[]
  matchScore: number
  matchedTypes: string[]
  rootPath: string
  savedAt: string
  /** 1.5.0 新增：已通关标记，旧数据无此字段 */
  completed?: boolean
  /** 1.5.1 新增：通关时间（点击「标记为已通关」的时刻），用于已通关列表按最新排序；旧数据无此字段 */
  completedAt?: string
  [key: string]: unknown
}

export interface ScrapedData {
  [key: string]: unknown
}

export interface CacheEntry {
  key: string
  name: string
  scrapedAt: string
  success: boolean
  data: ScrapedData | null
  folderPath?: string
  schema: number
  [key: string]: unknown
}

export interface CacheFile {
  version?: number
  updatedAt?: string
  games: Record<string, CacheEntry>
}

export interface LibraryFile {
  version?: number
  updatedAt?: string
  games: LibraryGame[]
}

export interface PlaytimeGame {
  minutes: number
  sessions: number
  lastPlayed: string
}

export interface PlaytimeFile {
  version: number
  updatedAt: string
  games: Record<string, PlaytimeGame>
}
