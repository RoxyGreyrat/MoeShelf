// 服务端核心共享库（S1 依据编译产物逐行重建）。
// 对应编译产物模块：8621（data 目录）、3247（settings）、263（library）、
// 281（cache）、667（playtime）、644（pathHash/缓存键）、2849（路径校验）。
// 所有读写容错、字段默认值与缓存行为均与编译产物一致；
// 另按新功能要求叠加了写入前自动备份（data/backup，每文件保留 5 份）。
import path from 'path'
import fs from 'fs/promises'
import type {
  CacheEntry,
  CacheFile,
  LibraryFile,
  LibraryGame,
  PlaytimeFile,
  PlaytimeGame,
  ScrapedData,
  Settings,
} from './types'

// ============ 模块 8621：data 目录解析 ============
// 编译产物在模块加载时计算默认目录：path.join(process.cwd(), "data")。
// 可通过 data/location.json 中的 dataPath 重定向（changeDataDir 写入）。
export const DEFAULT_DATA_DIR = path.join(process.cwd(), 'data')

let dataDirCache: string | null = null

/** data 根目录（同步版本，返回已解析缓存；未解析时返回默认目录） */
export function dataDir(): string {
  return dataDirCache ?? DEFAULT_DATA_DIR
}

/** data 下相对路径拼接 */
export function dataPath(...parts: string[]): string {
  return path.join(dataDir(), ...parts)
}

/** 异步解析 data 根目录（模块 8621 uQ）：location.json 优先，否则默认目录 */
export async function resolveDataDir(): Promise<string> {
  if (dataDirCache) return dataDirCache
  const locationFile = path.join(DEFAULT_DATA_DIR, 'location.json')
  try {
    const text = await fs.readFile(locationFile, 'utf-8')
    const parsed = JSON.parse(text)
    if (typeof parsed.dataPath === 'string' && parsed.dataPath.trim()) {
      dataDirCache = path.resolve(parsed.dataPath)
      return dataDirCache
    }
  } catch {
    // 无 location.json 或读取失败 → 使用默认目录
  }
  dataDirCache = DEFAULT_DATA_DIR
  return dataDirCache
}

/**
 * 模块 8621 Sl：把数据目录迁移到新路径。
 * 从“当前正在使用的数据目录”（location.json 重定向后也算）复制四个 json
 * 与 cache/images 到目标目录，再写 location.json 并更新缓存，返回新目录。
 * 修复 1.5.2：旧实现总是从默认目录复制，第二次迁移会复制到旧数据。
 */
export async function changeDataDir(newPath: string): Promise<string> {
  const target = path.resolve(newPath)
  const current = await resolveDataDir()
  await fs.mkdir(target, { recursive: true })
  for (const name of ['settings.json', 'cache.json', 'library.json', 'playtime.json']) {
    const src = path.join(current, name)
    const dst = path.join(target, name)
    if (await fs.stat(src).catch(() => null)) {
      await fs.copyFile(src, dst).catch(() => {})
    }
  }
  const srcImages = path.join(current, 'cache', 'images')
  const dstImages = path.join(target, 'cache', 'images')
  if (await fs.stat(srcImages).catch(() => null)) {
    await fs.mkdir(dstImages, { recursive: true })
    for (const name of await fs.readdir(srcImages).catch(() => [])) {
      await fs.copyFile(path.join(srcImages, name), path.join(dstImages, name)).catch(() => {})
    }
  }
  await fs.mkdir(DEFAULT_DATA_DIR, { recursive: true })
  await fs.writeFile(
    path.join(DEFAULT_DATA_DIR, 'location.json'),
    JSON.stringify({ dataPath: target }, null, 2)
  )
  dataDirCache = target
  return target
}

/** 读取 JSON 文件，失败或缺失时返回 fallback */
export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const text = await fs.readFile(file, 'utf-8')
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

// ============ 自动备份（新功能，叠加在原写逻辑上） ============
const BACKED_UP_FILES = new Set(['library.json', 'settings.json', 'playtime.json'])
const BACKUP_KEEP = 5

function backupStamp(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

async function pruneBackups(backupDir: string, base: string): Promise<void> {
  let files: string[]
  try {
    files = await fs.readdir(backupDir)
  } catch {
    return
  }
  const prefix = `${base}.`
  const matching = files
    .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    .sort()
  if (matching.length > BACKUP_KEEP) {
    for (const f of matching.slice(0, matching.length - BACKUP_KEEP)) {
      await fs.unlink(path.join(backupDir, f)).catch(() => {})
    }
  }
}

/**
 * 原子写 JSON（先写临时文件再 rename）。
 * 写 library.json / settings.json / playtime.json 前，先把旧文件备份到
 * data/backup/<basename>.<yyyyMMdd-HHmmss>.json，每个 basename 保留最近 5 份。
 */
export async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  const dir = await resolveDataDir()
  await fs.mkdir(path.dirname(file), { recursive: true })
  const base = path.basename(file)
  if (BACKED_UP_FILES.has(base)) {
    try {
      const st = await fs.stat(file)
      if (st.isFile()) {
        const backupDir = path.join(dir, 'backup')
        await fs.mkdir(backupDir, { recursive: true })
        await fs.copyFile(file, path.join(backupDir, `${base}.${backupStamp(new Date())}.json`))
        await pruneBackups(backupDir, base)
      }
    } catch {
      // 旧文件不存在或备份失败时静默跳过，不阻塞主写入
    }
  }
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8')
  await fs.rename(tmp, file)
}

// ============ 模块 3247：settings 读写 ============
const SETTINGS_DEFAULTS: Settings = {
  rootPath: '',
  filterMode: 'strict',
  exeMap: {},
  coverMap: {},
  titleMap: {},
  devMap: {},
  proxy: '',
  ignorePaths: [],
}

let settingsCache: Settings | null = null
let settingsDir = ''

async function settingsFile(): Promise<string> {
  const dir = await resolveDataDir()
  if (dir !== settingsDir) settingsCache = null
  settingsDir = dir
  return path.join(dir, 'settings.json')
}

/** 读取 settings.json（带缓存；data 目录变化时自动失效） */
export async function loadSettings(): Promise<Settings> {
  if (settingsCache) return settingsCache
  const file = await settingsFile()
  try {
    const text = await fs.readFile(file, 'utf-8')
    const parsed = JSON.parse(text)
    settingsCache = {
      rootPath: typeof parsed.rootPath === 'string' ? parsed.rootPath : '',
      filterMode: parsed.filterMode === 'loose' ? 'loose' : 'strict',
      exeMap: parsed.exeMap && typeof parsed.exeMap === 'object' ? parsed.exeMap : {},
      coverMap: parsed.coverMap && typeof parsed.coverMap === 'object' ? parsed.coverMap : {},
      titleMap: parsed.titleMap && typeof parsed.titleMap === 'object' ? parsed.titleMap : {},
      devMap: parsed.devMap && typeof parsed.devMap === 'object' ? parsed.devMap : {},
      proxy: typeof parsed.proxy === 'string' ? parsed.proxy : '',
      ignorePaths: parsed.ignorePaths && Array.isArray(parsed.ignorePaths) ? parsed.ignorePaths : [],
    }
  } catch {
    settingsCache = { ...SETTINGS_DEFAULTS, exeMap: {}, coverMap: {}, titleMap: {}, devMap: {} }
  }
  return settingsCache
}

/** 模块 3247 z：按传入的部分字段合并并写回 settings.json，返回合并结果 */
export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings()
  const merged: Settings = {
    rootPath: typeof patch.rootPath === 'string' ? patch.rootPath : current.rootPath,
    filterMode:
      patch.filterMode === 'loose'
        ? 'loose'
        : patch.filterMode === 'strict'
          ? 'strict'
          : current.filterMode,
    exeMap: patch.exeMap && typeof patch.exeMap === 'object' ? patch.exeMap : current.exeMap,
    coverMap:
      patch.coverMap && typeof patch.coverMap === 'object' ? patch.coverMap : current.coverMap,
    titleMap:
      patch.titleMap && typeof patch.titleMap === 'object' ? patch.titleMap : current.titleMap,
    devMap: patch.devMap && typeof patch.devMap === 'object' ? patch.devMap : current.devMap,
    proxy: typeof patch.proxy === 'string' ? patch.proxy.trim() : current.proxy,
    ignorePaths: Array.isArray(patch.ignorePaths) ? patch.ignorePaths : current.ignorePaths,
  }
  settingsCache = merged
  const file = await settingsFile()
  await writeJsonAtomic(file, merged)
  return merged
}

/** 保存 settings（合并语义，等价于编译产物 3247 z） */
export async function saveSettings(settings: Settings): Promise<void> {
  await updateSettings(settings)
}

// ============ 模块 263：library 读写 ============
let libraryQueue: Promise<void> = Promise.resolve()

/** 读取 library.json 的 games 数组；失败返回 [] */
export async function loadLibrary(): Promise<LibraryGame[]> {
  try {
    const file = path.join(await resolveDataDir(), 'library.json')
    const text = await fs.readFile(file, 'utf-8')
    const parsed = JSON.parse(text)
    return Array.isArray(parsed.games) ? parsed.games : []
  } catch {
    return []
  }
}

/** 读取完整 library.json（含 version/updatedAt），供导出备份使用 */
export async function loadLibraryFile(): Promise<LibraryFile> {
  try {
    const file = path.join(await resolveDataDir(), 'library.json')
    const text = await fs.readFile(file, 'utf-8')
    const parsed = JSON.parse(text)
    return {
      version: typeof parsed.version === 'number' ? parsed.version : undefined,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined,
      games: Array.isArray(parsed.games) ? parsed.games : [],
    }
  } catch {
    return { games: [] }
  }
}

/** 写 library.json：{version:1, updatedAt, games}（串行队列，同 263 o） */
export function saveLibrary(games: LibraryGame[]): Promise<void> {
  const task = libraryQueue.then(async () => {
    const file = path.join(await resolveDataDir(), 'library.json')
    await writeJsonAtomic(file, { version: 1, updatedAt: new Date().toISOString(), games })
  })
  libraryQueue = task.catch(() => {})
  return task
}

// ============ 模块 281：cache 读写 ============
export const CACHE_SCHEMA = 2

let cacheQueue: Promise<void> = Promise.resolve()

/** 读取 cache.json 的 games 对象（同 281 tx）；失败返回 {} */
export async function loadCacheGames(): Promise<Record<string, CacheEntry>> {
  try {
    const file = path.join(await resolveDataDir(), 'cache.json')
    const text = await fs.readFile(file, 'utf-8')
    return JSON.parse(text).games ?? {}
  } catch {
    return {}
  }
}

/** 读取完整 cache.json（含 version/updatedAt） */
export async function loadCache(): Promise<CacheFile> {
  try {
    const file = path.join(await resolveDataDir(), 'cache.json')
    const text = await fs.readFile(file, 'utf-8')
    const parsed = JSON.parse(text)
    return {
      version: typeof parsed.version === 'number' ? parsed.version : undefined,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined,
      games: parsed.games ?? {},
    }
  } catch {
    return { games: {} }
  }
}

/** 保存/更新一条刮削缓存（同 281 NO：写入时强制 schema=2） */
export function saveCacheEntry(entry: CacheEntry): Promise<void> {
  const task = cacheQueue.then(async () => {
    const games = await loadCacheGames()
    games[entry.key] = { ...entry, schema: CACHE_SCHEMA }
    const file = path.join(await resolveDataDir(), 'cache.json')
    await writeJsonAtomic(file, { version: 1, updatedAt: new Date().toISOString(), games })
  })
  cacheQueue = task.catch(() => {})
  return task
}

/** 整体写回缓存 games（供迁移等批量操作使用） */
export function saveCacheGames(games: Record<string, CacheEntry>): Promise<void> {
  const task = cacheQueue.then(async () => {
    const file = path.join(await resolveDataDir(), 'cache.json')
    await writeJsonAtomic(file, { version: 1, updatedAt: new Date().toISOString(), games })
  })
  cacheQueue = task.catch(() => {})
  return task
}

/** 清空缓存（同 281 LK） */
export function clearCache(): Promise<void> {
  const task = cacheQueue.then(async () => {
    const file = path.join(await resolveDataDir(), 'cache.json')
    await writeJsonAtomic(file, { version: 1, updatedAt: new Date().toISOString(), games: {} })
  })
  cacheQueue = task.catch(() => {})
  return task
}

/** 条目是否新鲜（同 281 p7：成功 90 天 / 失败 3 天，且 scrape 时间不能在未来） */
export function isCacheFresh(entry: CacheEntry): boolean {
  const age = Date.now() - new Date(entry.scrapedAt).getTime()
  const maxAge = entry.success ? 7776e6 : 2592e5
  return age >= 0 && age < maxAge
}

/** 按键取新鲜缓存的数据（同 281 EM）；无有效数据返回 null */
export async function getCacheData(key: string): Promise<ScrapedData | null> {
  const entry = (await loadCacheGames())[key]
  return entry && entry.schema === CACHE_SCHEMA && isCacheFresh(entry) ? entry.data : null
}

// ============ 模块 667：playtime 读写 ============
let playtimeQueue: Promise<void> = Promise.resolve()

/** 读取 playtime.json 的 games 对象；失败返回 {} */
export async function loadPlaytimeGames(): Promise<Record<string, PlaytimeGame>> {
  try {
    const file = path.join(await resolveDataDir(), 'playtime.json')
    const text = await fs.readFile(file, 'utf-8')
    return JSON.parse(text).games ?? {}
  } catch {
    return {}
  }
}

/** 读取完整 playtime.json（含 version/updatedAt） */
export async function loadPlaytime(): Promise<PlaytimeFile> {
  try {
    const file = path.join(await resolveDataDir(), 'playtime.json')
    const text = await fs.readFile(file, 'utf-8')
    const parsed = JSON.parse(text)
    return {
      version: typeof parsed.version === 'number' ? parsed.version : 1,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
      games: parsed.games ?? {},
    }
  } catch {
    return { version: 1, updatedAt: '', games: {} }
  }
}

/** 写 playtime.json：{version:1, updatedAt, games}（串行队列） */
export function savePlaytime(file: PlaytimeFile): Promise<void> {
  const task = playtimeQueue.then(async () => {
    const target = path.join(await resolveDataDir(), 'playtime.json')
    await writeJsonAtomic(target, { version: 1, updatedAt: new Date().toISOString(), games: file.games })
  })
  playtimeQueue = task.catch(() => {})
  return task
}

/** 累加游玩时长（同 667 $：hash 为空或分钟数 <=0.15 时跳过，sessions+1） */
export function addPlaytime(hash: string, minutes: number, playedAt: number): Promise<void> {
  return accumulatePlaytime(hash, minutes, playedAt, false)
}

/**
 * 累加游玩时长（带 skipSession 的底层实现，同 launch 路由内嵌的 667 $）：
 * skipSession=true 时只加时长不加次数（用于 60 秒定时累计）。
 */
export function accumulatePlaytime(
  hash: string,
  minutes: number,
  playedAt: number,
  skipSession: boolean
): Promise<void> {
  if (!hash || !(minutes > 0.15)) return Promise.resolve()
  const task = playtimeQueue.then(async () => {
    const games = await loadPlaytimeGames()
    const prev = games[hash] ?? { minutes: 0, sessions: 0, lastPlayed: '' }
    games[hash] = {
      minutes: Math.round((prev.minutes + minutes) * 10) / 10,
      sessions: prev.sessions + (skipSession ? 0 : 1),
      lastPlayed: new Date(playedAt).toISOString(),
    }
    const file = path.join(await resolveDataDir(), 'playtime.json')
    await writeJsonAtomic(file, { version: 1, updatedAt: new Date().toISOString(), games })
  })
  playtimeQueue = task.catch(() => {})
  return task
}

// ============ 模块 644：pathHash / 缓存键 ============
/** 由字符串计算 8 位 hex hash（djb2：seed 5381，hash=(hash<<5)+hash+charCode） */
export function pathHashOf(p: string): string {
  let hash = 5381
  for (let i = 0; i < p.length; i++) {
    hash = ((hash << 5) + hash + p.charCodeAt(i)) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** 缓存键构建：`${folderName}::${pathHash}`（同 644 kw） */
export function cacheKeyOf(folderName: string, pathHash: string): string {
  return `${folderName}::${pathHash}`
}

/**
 * 修改游戏路径后迁移旧 pathHash 关联的数据：
 * settings 里的 exe/cover/title/dev 映射、playtime、以及刮削缓存键。
 * 1.5.2 新增：修改路径不再丢失自定义启动程序/封面/标题/厂商与游玩时长。
 */
export async function migrateGameAssociations(
  oldHash: string,
  newHash: string,
  newFolderName: string,
  newFolderPath?: string,
  newExeCandidates?: Array<{ name?: string; path?: string }>
): Promise<void> {
  if (!oldHash || !newHash || oldHash === newHash) return

  const fileBase = (p?: string) => (p ? p.split(/[\\/]/).pop() : '')

  // 1) settings 映射
  try {
    const settings = await loadSettings()
    let replacementExePath = settings.exeMap[oldHash]
    if (typeof replacementExePath === 'string' && newExeCandidates?.length) {
      const oldBase = fileBase(replacementExePath)
      const match = newExeCandidates.find(
        c => typeof c.path === 'string' && fileBase(c.path) === oldBase
      )
      replacementExePath =
        (match && typeof match.path === 'string' ? match.path : undefined) ||
        newExeCandidates[0]?.path ||
        replacementExePath
    }
    const maps = [settings.exeMap, settings.coverMap, settings.titleMap, settings.devMap]
    let changed = false
    for (const map of maps) {
      if (Object.prototype.hasOwnProperty.call(map, oldHash)) {
        if (!Object.prototype.hasOwnProperty.call(map, newHash)) {
          map[newHash] =
            map === settings.exeMap && typeof replacementExePath === 'string'
              ? replacementExePath
              : map[oldHash]
        }
        delete map[oldHash]
        changed = true
      }
    }
    if (changed) await saveSettings(settings)
  } catch {
    // 映射迁移失败不影响路径修改本身
  }

  // 2) 游玩时长
  try {
    const playtime = await loadPlaytime()
    const old = playtime.games[oldHash]
    if (old) {
      const cur = playtime.games[newHash]
      playtime.games[newHash] = {
        minutes: Math.round(((cur?.minutes ?? 0) + (old.minutes ?? 0)) * 10) / 10,
        sessions: (cur?.sessions ?? 0) + (old.sessions ?? 0),
        lastPlayed: [cur?.lastPlayed ?? '', old.lastPlayed ?? '']
          .filter(Boolean)
          .sort()
          .pop() || '',
      }
      delete playtime.games[oldHash]
      await savePlaytime(playtime)
    }
  } catch {
    // 游玩时长迁移失败不影响路径修改本身
  }

  // 3) 刮削缓存键（folderName::pathHash）
  try {
    const all = await loadCacheGames()
    const newKey = cacheKeyOf(newFolderName, newHash)
    let moved = false
    for (const key of Object.keys(all)) {
      if (key.endsWith(`::${oldHash}`) && key !== newKey && !all[newKey]) {
        all[newKey] = {
          ...all[key],
          key: newKey,
          name: newFolderName || all[key].name,
          folderPath: newFolderPath || all[key].folderPath,
        }
        delete all[key]
        moved = true
        break
      }
    }
    if (moved) await saveCacheGames(all)
  } catch {
    // 缓存迁移失败只意味着下次会重新刮削
  }
}

// ============ 模块 2849：路径安全校验 ============
export const PATH_DENIED_REASON = '拒绝访问：路径不在游戏根目录或本地库内'

function normalizeForCompare(p: string): string {
  const resolved = path.resolve(p)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

/**
 * 允许的路径：等于 settings.rootPath 或其子路径，或等于任一库条目的 folderPath
 * 或其子路径（win32 下大小写不敏感比较）。
 */
export async function isPathAllowed(p: string): Promise<boolean> {
  const target = normalizeForCompare(p)
  if (!target) return false
  try {
    const settings = await loadSettings()
    if (settings.rootPath) {
      const root = normalizeForCompare(settings.rootPath)
      if (target === root || target.startsWith(root + path.sep)) return true
    }
  } catch {
    // 忽略 settings 读取失败，继续用 library 校验
  }
  try {
    for (const game of await loadLibrary()) {
      if (!game.folderPath) continue
      const folder = normalizeForCompare(game.folderPath)
      if (target === folder || target.startsWith(folder + path.sep)) return true
    }
  } catch {
    // 忽略 library 读取失败
  }
  return false
}
