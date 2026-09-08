// 扫描辅助库（S1 依据编译产物模块 2147 重建，取 scan 路由内嵌的最新版，
// 含 identify 与 removedPaths 逻辑）。
// 对应编译产物：.next/server/chunks/147.js 与 scan/route.js 内嵌 2147。
import fs from 'fs/promises'
import path from 'path'
import { pathHashOf, resolveDataDir } from './core'
import type { ExeCandidate } from './types'

/** 工具/安装类 exe 名称（含中英文安装卸载补丁等，判定为非游戏程序） */
const JUNK_EXE_NAMES = new Set([
  'setup', 'setup1', 'setup2', 'setup3', 'setup_x86', 'setup_x64',
  'unins000', 'unins001', 'unins002', 'uninstall', 'uninst', 'inst', 'install',
  'installer', 'update', 'updater', 'updata', 'patch', 'patcher', 'config',
  'configure', 'cfg', 'autorun', 'readme', 'eula', 'license', 'reg', 'register',
  'regist', 'vcredist', 'vcredist_x86', 'vcredist_x64', 'vc_redist',
  'vc_redist.x86', 'vc_redist.x64', 'dxsetup', 'dxwebsetup', 'directx',
  'dotnetfx', 'dotnetfx35', 'dotnetfx40', 'dotnet', 'redist', 'gxsetup',
  'crashreporter', 'sendto', 'msvcp', 'msvcr', 'd3dx9', 'd3dx10', 'unarc',
  'unrar', '7z', '7za', 'winrar', 'notepad', 'cmd', 'explorer',
  '安装', '卸载', '更新', '补丁', '说明', '常见问题', '注册表',
  '0', '1', '2',
])

/** 数据/资源类文件夹名（编译产物中定义但未被引用，保留以保持一致性） */
const DATA_DIR_NAMES = new Set([
  'data', 'savedata', 'save_data', 'save', 'bgm', 'bgs', 'se', 'voice', 'movie',
  'movie2', 'op', 'ed', 'system', 'sys', 'script', 'scenario', 'scenario2', 'cg',
  'graph', 'graphics', 'image', 'images', 'sound', 'sounds', 'resource',
  'resources', 'font', 'fonts', 'dll', 'common', 'patch', 'update', 'readme',
  'manual', 'doc', 'docs', 'config', 'setting', 'settings', 'log', 'logs',
  'cache', 'temp', 'tmp', 'debug', 'screenshot', 'capture', 'icon', 'icons',
  'text', 'bin', 'lib', 'libs', 'ext', 'extensions', 'plugin', 'plugins', 'mod',
  'mods', 'tool', 'tools', 'backup',
  '存档', '语音', '音乐', '背景', '立绘', '头像', '补丁', '说明', '文档',
  '临时', '备份', '字体', '图片', 'cg集', '演出', '效果', '脚本', '资源', '数据',
])

/** 扫描时直接跳过的系统/工具目录 */
const SKIP_DIR_NAMES = [
  '$recycle.bin', 'system volume information', 'windows', 'program files',
  'program files (x86)', 'node_modules', '.git', '.svn', 'msocache',
  'perflogs', 'recovery', 'config.msi',
]

export interface CollectedExe {
  name: string
  path: string
  rel: string
}

export interface ScannedGame {
  folderName: string
  folderPath: string
  pathHash: string
  fileCount: number
  exeCandidates: ExeCandidate[]
  matchScore: number
  matchedTypes: string[]
}

export interface ScanResult {
  games: ScannedGame[]
  skipped: number
  removedPaths: string[]
}

/** 递归收集文件名（限深度与数量），用于评分 */
async function collectNames(
  dir: string,
  out: string[],
  depth: number,
  maxDepth: number,
  cap: number
): Promise<void> {
  if (depth > maxDepth || out.length >= cap) return
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (out.length >= cap) return
    if (entry.isFile()) out.push(entry.name)
    else if (entry.isDirectory() || entry.isSymbolicLink()) {
      if (depth < maxDepth) await collectNames(path.join(dir, entry.name), out, depth + 1, maxDepth, cap)
    }
  }
}

/** 收集目录下 exe/bat/cmd（深度≤4、最多 60 个，跳过隐藏与系统目录） */
export async function collectExes(dir: string): Promise<CollectedExe[]> {
  const out: CollectedExe[] = []
  const walk = async (cur: string, rel: string, depth: number): Promise<void> => {
    if (depth > 4 || out.length >= 60) return
    let entries
    try {
      entries = await fs.readdir(cur, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (out.length >= 60) return
      const full = path.join(cur, entry.name)
      if (entry.isDirectory() || entry.isSymbolicLink()) {
        const lower = entry.name.toLowerCase()
        if (entry.name.startsWith('.') || SKIP_DIR_NAMES.includes(lower)) continue
        await walk(full, rel ? rel + '/' + entry.name : entry.name, depth + 1)
      } else if (entry.isFile()) {
        const lower = entry.name.toLowerCase()
        if (lower.endsWith('.exe') || lower.endsWith('.bat') || lower.endsWith('.cmd')) {
          out.push({ name: entry.name, path: full, rel: rel ? rel + '/' + entry.name : entry.name })
        }
      }
    }
  }
  await walk(dir, '', 0)
  return out.sort((a, b) => {
    const ra = path.dirname(a.path) === dir ? 0 : 1
    const rb = path.dirname(b.path) === dir ? 0 : 1
    if (ra !== rb) return ra - rb
    const ea = a.name.toLowerCase().endsWith('.exe') ? 0 : 1
    const eb = b.name.toLowerCase().endsWith('.exe') ? 0 : 1
    return ea !== eb ? ea - eb : a.name.localeCompare(b.name)
  })
}

function levenshtein(a: string, b: string): number {
  const la = a.length
  const lb = b.length
  if (!la) return lb
  if (!lb) return la
  let prev = Array.from({ length: lb + 1 }, (_, i) => i)
  for (let i = 1; i <= la; i++) {
    const cur = [i]
    for (let j = 1; j <= lb; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[lb]
}

/** 汉化/破解版主程序特征（排序时优先） */
function isPreferredExeName(name: string): boolean {
  return (
    /(^|[^a-z0-9])(chs|sc|cn|crack|汉化|中文|chinese|cht)([^a-z0-9]|$)/i.test(name) ||
    /汉化版|中文版|破解版|整合版|hardcoded/.test(name)
  )
}

/**
 * 过滤并排序可启动候选（最多 10 个）：
 * 先剔除工具/安装/补丁类 exe，再按“汉化/破解特征”优先、名称相似度排序。
 */
async function rankExeCandidates(dir: string, query: string): Promise<ExeCandidate[]> {
  const all = (await collectExes(dir)).filter((e) => {
    if (!e.name.toLowerCase().endsWith('.exe')) return true
    const base = e.name.slice(0, -4).toLowerCase()
    return (
      !JUNK_EXE_NAMES.has(base) &&
      !/uninstall|uninst|unins\d+|卸载|卸载程序|updater?|updata|setup|installer|config|readme|license|eula|regedit|regedt|register|registry|vcredist|redist|dxsetup|dxwebsetup|directx|dotnet/.test(base)
    )
  })
  const norm = query.toLowerCase().replace(/[^\w\u4e00-\u9fa5]/g, '')
  const mapped = all.map((e) => ({ name: e.name, path: e.path }))
  return mapped
    .sort((a, b) => {
      const na = a.name.toLowerCase()
      const nb = b.name.toLowerCase()
      const ga = isPreferredExeName(na) ? 0 : 1
      const gb = isPreferredExeName(nb) ? 0 : 1
      if (ga !== gb) return ga - gb
      const na2 = na.replace(/[^\w\u4e00-\u9fa5]/g, '')
      const nb2 = nb.replace(/[^\w\u4e00-\u9fa5]/g, '')
      return (norm ? (na2.includes(norm) ? 0 : levenshtein(na2, norm)) : 0) -
        (norm ? (nb2.includes(norm) ? 0 : levenshtein(nb2, norm)) : 0)
    })
    .slice(0, 10)
}

function extWeight(ext: string, base: string): number {
  switch (ext) {
    case '.xp3':
      return 6
    case '.nsa':
    case '.noa':
    case '.nmc':
    case '.cvd':
      return 5
    case '.exe':
      return JUNK_EXE_NAMES.has(base) ? 1 : 4
    case '.iso':
    case '.img':
    case '.mdf':
    case '.mds':
      return 4
    case '.arc': case '.pak': case '.ks': case '.tjs': case '.pkd': case '.pfs':
    case '.s3r': case '.ypf': case '.mpk': case '.pck': case '.pac': case '.ald':
    case '.g00': case '.sdc': case '.xfl': case '.ns2':
      return 2
    case '.dat':
    case '.bin':
    case '.dll':
    case '.txt':
      return 1
    case '.rpa':
    case '.rpi':
      return 6
    case '.rvdata2': case '.rvdata': case '.rxdata': case '.ldb': case '.lmu':
    case '.wolfsave': case '.int': case '.majiro': case '.assets': case '.unity3d':
      return 4
    case '.lcf': case '.wolfdata': case '.stx': case '.maj': case '.rpy':
    case '.rpyc': case '.resS': case '.bundle': case '.nsc': case '.obb':
      return 3
    case '.dat2':
      return 2
    default:
      return 0
  }
}

/** 依据目录内文件名打分，判定是否为游戏目录 */
function scoreFiles(
  names: string[],
  filterMode: string
): { isGame: boolean; score: number; matchedTypes: string[] } {
  const weights = new Map<string, number>()
  const types = new Set<string>()
  let count = 0
  const exeBases: string[] = []
  for (const name of names) {
    const dot = name.lastIndexOf('.')
    if (dot <= 0) continue
    const ext = name.slice(dot).toLowerCase()
    const base = name.slice(0, dot).toLowerCase()
    const weight = extWeight(ext, base)
    if (ext === '.exe') exeBases.push(base)
    if (weight) {
      types.add(ext)
      count++
      if (weight > (weights.get(ext) ?? 0)) weights.set(ext, weight)
    }
  }
  let score = 0
  for (const w of weights.values()) score += w
  if (count === 1 && weights.has('.exe') && exeBases.length && exeBases.every((x) => JUNK_EXE_NAMES.has(x))) {
    score = Math.min(score, 2)
  }
  const isGame = exeBases.some((x) => !JUNK_EXE_NAMES.has(x)) || score >= (filterMode === 'loose' ? 2 : 3)
  return { isGame, score, matchedTypes: [...types].sort() }
}

/**
 * 扫描根目录（深度≤4）：识别游戏目录、忽略工具目录；
 * 依据 settings.json 的 ignorePaths 过滤；并统计 library.json 中
 * 已不存在（被移动/删除）的条目 pathHash 列表。
 */
export async function scanRoot(root: string, filterMode: string): Promise<ScanResult> {
  const games: ScannedGame[] = []
  let skipped = 0

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > 4) return
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
      const name = entry.name
      const lower = name.toLowerCase()
      if (
        name.startsWith('.') || SKIP_DIR_NAMES.includes(lower) ||
        lower.includes('galtools') || lower.includes('解压') || lower.includes('解包') ||
        lower.includes('提取工具') || lower.includes('汉化补丁') || lower.includes('备份') ||
        lower === 'tools' || lower === 'tool' || lower === 'backup' || lower === '补丁' ||
        lower === 'patch' || lower === 'crack' || lower === '破解' || lower === 'directx' ||
        lower === '运行库' || lower === 'vcredist'
      ) {
        skipped++
        continue
      }
      const sub = path.join(dir, name)
      const names: string[] = []
      await collectNames(sub, names, 0, 0, 5000)
      const { isGame, score, matchedTypes } = scoreFiles(names, filterMode)
      if (isGame) {
        const exeCandidates = await rankExeCandidates(sub, name)
        games.push({
          folderName: name,
          folderPath: sub,
          pathHash: pathHashOf(sub),
          fileCount: names.length,
          exeCandidates,
          matchScore: score,
          matchedTypes,
        })
      } else {
        skipped++
        await walk(sub, depth + 1)
      }
    }
  }

  await walk(root, 0)

  // ignorePaths 过滤：读取“当前生效的数据目录”（location.json 重定向也生效）
  await (async () => {
    try {
      const dir = await resolveDataDir()
      const text = await fs.readFile(path.join(dir, 'settings.json'), 'utf-8')
      const parsed = JSON.parse(text)
      const ignore = parsed.ignorePaths || []
      if (ignore.length) {
        const filtered = games.filter((g) => !ignore.includes(g.folderPath))
        games.length = 0
        games.push(...filtered)
      }
    } catch {
      // 读取失败则不做过滤
    }
  })()

  games.sort((a, b) => a.folderName.localeCompare(b.folderName, 'zh-Hans-CN'))

  // 统计库中已失效的目录（用于前端移除提示）
  let removedPaths: string[] = []
  await (async () => {
    try {
      const dir = await resolveDataDir()
      const text = await fs.readFile(path.join(dir, 'library.json'), 'utf-8')
      const parsed = JSON.parse(text)
      const libGames: Array<{ folderPath?: string; pathHash?: string }> = Array.isArray(parsed.games)
        ? parsed.games
        : []
      const rm: string[] = []
      for (const g of libGames) {
        if (!g || !g.folderPath) continue
        try {
          const st = await fs.stat(g.folderPath)
          if (!st.isDirectory()) rm.push(g.pathHash ?? '')
        } catch {
          rm.push(g.pathHash ?? '')
        }
      }
      removedPaths = rm
    } catch {
      // 读取失败则不统计
    }
  })()

  return { games, skipped, removedPaths }
}

/** 单路径识别：对指定目录打分并生成游戏条目；不是游戏目录时返回 null */
export async function identify(
  dir: string,
  filterMode: string,
  rootPath: string
): Promise<(ScannedGame & { rootPath: string }) | null> {
  const names: string[] = []
  await collectNames(dir, names, 0, 0, 5000)
  const folderName = path.basename(dir)
  const { isGame, score, matchedTypes } = scoreFiles(names, filterMode)
  if (!isGame) return null
  return {
    folderName,
    folderPath: dir,
    pathHash: pathHashOf(dir),
    fileCount: names.length,
    exeCandidates: await rankExeCandidates(dir, folderName),
    matchScore: score,
    matchedTypes,
    rootPath: rootPath || '',
  }
}
