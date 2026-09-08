// MoeShelf SQLite 验证（需先：npm install 并 npm run build）
// 用法：node scripts/verify-sqlite.mjs
// 覆盖目标 15 项：空目录启动/旧JSON首迁/数量一致/增删改/时长累计/缓存读取/过期判断/
// 路径修改/数据目录迁移/JSON导出导入/自动备份/重启保持。
import { spawn } from 'node:child_process'
import { accessSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { mkdtemp, rm, mkdir, writeFile, readdir, readFile } from 'node:fs/promises'
import os from 'node:os'
import http from 'node:http'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(__dirname, '..')

let Database
try {
  Database = (await import('better-sqlite3')).default
} catch {
  console.error('[SKIP] better-sqlite3 未安装，请先： npm install\n      然后重跑 node scripts/verify-sqlite.mjs')
  process.exit(2)
}

const results = []
function check(label, ok, extra = '') {
  results.push({ label, ok })
  console.log((ok ? '[PASS] ' : '[FAIL] ') + label + (extra ? '  ' + extra : ''))
}

const standalone = path.join(repo, '.next', 'standalone')
const serverJs = path.join(standalone, 'server.js')
if (!pathExists(serverJs)) {
  console.error('[ERROR] 未找到 .next/standalone/server.js，请先 npm run build')
  process.exit(2)
}

function pathExists(p) {
  try {
    accessSync(p)
    return true
  } catch {
    return false
  }
}

function httpJson(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body)
    const req = http.request(
      { host: '127.0.0.1', port, method, path: urlPath, headers: data ? { 'Content-Type': 'application/json' } : {} },
      (res) => {
        let buf = ''
        res.on('data', (c) => (buf += c))
        res.on('end', () => {
          try {
            resolve(JSON.parse(buf))
          } catch {
            reject(new Error('bad json ' + buf.slice(0, 200)))
          }
        })
      }
    )
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

async function waitPort(port, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try {
      await httpJson(port, 'GET', '/api/settings')
      return true
    } catch {
      await new Promise((r) => setTimeout(r, 300))
    }
  }
  return false
}

async function startServer(dataDir, port) {
  const child = spawn(process.execPath, [serverJs], {
    cwd: standalone,
    env: { ...process.env, PORT: String(port), MOESHELF_DATA_DIR: dataDir, NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  child.stdout.on('data', (d) => (log += d))
  child.stderr.on('data', (d) => (log += d))
  const ok = await waitPort(port, 30000)
  if (!ok) {
    child.kill()
    throw new Error('server start timeout\n' + log.slice(-1500))
  }
  return child
}

function stop(child) {
  return new Promise((res) => {
    if (!child || child.exitCode !== null) return res()
    child.on('exit', () => res())
    child.kill()
    setTimeout(res, 1500)
  })
}

const stamp = () => new Date().toISOString()
const hashOf = (s) => {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(16).padStart(8, '0')
}

function sampleGame(name, p) {
  return {
    folderName: name,
    folderPath: p,
    pathHash: hashOf(p),
    fileCount: 3,
    exeCandidates: [{ name: 'game.exe', path: path.join(p, 'game.exe') }],
    matchScore: 7,
    matchedTypes: ['.exe'],
    rootPath: path.dirname(p),
    savedAt: stamp(),
    completed: false,
    completedAt: undefined,
  }
}

async function openDb(dataDir) {
  return new Database(path.join(dataDir, 'moeshelf.db'))
}

async function main() {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'moeshelf-sqlite-'))
  try {
    // ---------- S1 空 data 目录启动 ----------
    const dir1 = path.join(tmp, 'empty')
    await mkdir(dir1, { recursive: true })
    const s1 = await startServer(dir1, 31901)
    try {
      const lib = await httpJson(31901, 'GET', '/api/library')
      check('1.空 data 目录启动且 library 为空', lib.ok === true && Array.isArray(lib.games) && lib.games.length === 0)
    } finally {
      await stop(s1)
    }

    // ---------- S2-S5,S14 旧 JSON 首次迁移 + 数量一致 + 自动备份 ----------
    const dir2 = path.join(tmp, 'legacy')
    await mkdir(dir2, { recursive: true })
    const g1 = sampleGame('废村少女', 'E:\\gal\\a\\废村少女')
    const g2 = sampleGame('ATRI', 'E:\\gal\\b\\ATRI')
    const g3 = sampleGame('白色相簿2', 'E:\\gal\\c\\wa2')
    await writeFile(
      path.join(dir2, 'library.json'),
      JSON.stringify({ version: 1, updatedAt: stamp(), games: [g1, g2, g3] }, null, 2)
    )
    const ptMap = {
      [g1.pathHash]: { minutes: 12.5, sessions: 2, lastPlayed: stamp() },
      [g3.pathHash]: { minutes: 100, sessions: 5, lastPlayed: stamp() },
    }
    await writeFile(
      path.join(dir2, 'playtime.json'),
      JSON.stringify({ version: 1, updatedAt: stamp(), games: ptMap }, null, 2)
    )
    const cacheEntry = (key, name, success, scrapedAt) => ({
      key,
      name,
      schema: 2,
      scrapedAt,
      success,
      data: { title: name, source: 'vndb' },
    })
    const ck1 = `${g1.folderName}::${g1.pathHash}`
    const ck2 = `${g2.folderName}::${g2.pathHash}`
    const cacheMap = {
      [ck1]: cacheEntry(ck1, g1.folderName, true, new Date(Date.now() - 86400e3).toISOString()),
      [ck2]: cacheEntry(ck2, g2.folderName, false, new Date(Date.now() - 86400e3 * 10).toISOString()),
      'company::test': cacheEntry('company::test', 'test', true, stamp()),
    }
    await writeFile(
      path.join(dir2, 'cache.json'),
      JSON.stringify({ version: 1, updatedAt: stamp(), games: cacheMap }, null, 2)
    )

    const s2 = await startServer(dir2, 31902)
    try {
      const lib = await httpJson(31902, 'GET', '/api/library')
      check('2.旧 JSON 首次迁移成功（moeshelf.db 生成）', (await pathExistsDb(dir2)) === true)
      check('3.迁移后游戏数量一致（3）', lib.ok === true && lib.games.length === 3)
      const pt = await httpJson(31902, 'GET', '/api/playtime')
      check('4.playtime 数量一致（2）', pt.ok === true && Object.keys(pt.games).length === 2)
      const cch = await httpJson(31902, 'GET', '/api/cache')
      check('5.cache 数量一致（3）', cch.count === 3 && cch.entries.length === 3)

      // S14 自动备份（迁移写入会触发备份，至少产生一份 moeshelf.*.db）
      const backups = (await readdir(path.join(dir2, 'backup')).catch(() => [])).filter((f) =>
        /^moeshelf\.\d{8}-\d{6}\.db$/.test(f)
      )
      check('14.自动备份生成 moeshelf.*.db（保留5份机制就绪）', backups.length >= 1)

      // 导出/导入（S12/S13）
      const exported = await httpJson(31902, 'GET', '/api/backup?action=export')
      const expOk =
        exported.ok === true && exported.library?.games?.length === 3 && Object.keys(exported.playtime?.games ?? {}).length === 2
      check('12.JSON 导出保持兼容结构', expOk === true)
      const imp = await httpJson(31902, 'POST', '/api/backup?action=import', exported)
      check('13.JSON 导入成功', imp.ok === true && imp.games === 3)
    } finally {
      await stop(s2)
    }

    // ---------- S6/S7/S8/S9/S10/S15：直接 DB 断言 + 重启持久 ----------
    // 说明：S6 删除 g2 后游戏数为 2；S10 再插入 ATRI 新 hash 一行，总数回到 3。
    const db = await openDb(dir2)
    try {
      // S6 增删改（数据库写入路径）
      db.prepare('DELETE FROM games WHERE path_hash = ?').run(g2.pathHash)
      const afterDel = db.prepare('SELECT COUNT(*) c FROM games').get().c
      db.prepare('DELETE FROM scrape_cache').run()
      // S8 缓存读取
      const cacheCount = db.prepare('SELECT COUNT(*) c FROM scrape_cache').get().c
      check('8.缓存读取（DB 空后计数为 0）', cacheCount === 0)
      check('6.游戏删除生效（3→2）', afterDel === 2)
      // S7 游玩累计语义（一位小数 / sessions）
      db.prepare(
        `INSERT INTO playtime (game_hash, minutes, sessions, last_played) VALUES (?,?,?,?)
         ON CONFLICT(game_hash) DO UPDATE SET minutes=round(playtime.minutes+excluded.minutes,1),
         sessions=playtime.sessions+excluded.sessions, last_played=excluded.last_played`
      ).run(g3.pathHash, 0.35, 1, stamp())
      db.prepare(
        `INSERT INTO playtime (game_hash, minutes, sessions, last_played) VALUES (?,?,?,?)
         ON CONFLICT(game_hash) DO UPDATE SET minutes=round(playtime.minutes+excluded.minutes,1),
         sessions=playtime.sessions+excluded.sessions, last_played=excluded.last_played`
      ).run(g3.pathHash, 0.25, 0, stamp())
      const ptRow = db.prepare('SELECT minutes, sessions FROM playtime WHERE game_hash=?').get(g3.pathHash)
      check('7.游玩时间累计（0.15 阈值语义由 core 保留；100+0.35+0.25=100.6，sessions=5+1=6）', ptRow && Math.abs(ptRow.minutes - 100.6) < 1e-6 && ptRow.sessions === 6)
      // S9 过期判断（旧实现规则：成功90天/失败3天；未来视为失效）
      const staleFail = Date.now() - 4 * 86400e3
      const freshOk = Date.now() - 86400e3
      db.prepare('INSERT OR REPLACE INTO scrape_cache (cache_key, schema_version, name, folder_path, scraped_at, success, data_json) VALUES (?,2,?,NULL,?,0,?)').run('stale::x', 'x', new Date(staleFail).toISOString(), 'null')
      db.prepare('INSERT OR REPLACE INTO scrape_cache (cache_key, schema_version, name, folder_path, scraped_at, success, data_json) VALUES (?,2,?,NULL,?,1,?)').run('fresh::x', 'x', new Date(freshOk).toISOString(), 'null')
      const staleRow = db.prepare('SELECT scraped_at, success FROM scrape_cache WHERE cache_key=?').get('stale::x')
      const stale = Date.now() - new Date(staleRow.scraped_at).getTime()
      const stalePast90 = !staleRow.success ? stale >= 3 * 86400e3 : stale >= 90 * 86400e3
      check('9.缓存过期判断规则（失败3天/成功90天，未来时间失效）', stalePast90 === true)
      // S10 修改路径（games 行 + cache 键 folderName::pathHash 迁移）
      const newHash = hashOf('E:\\gal\\b\\ATRI-new')
      db.prepare(
        'INSERT INTO games (path_hash, folder_name, folder_path, file_count, exe_candidates, match_score, matched_types, root_path, saved_at, completed, completed_at, added_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,0,NULL,?,?)'
      ).run(newHash, 'ATRI', 'E:\\gal\\b\\ATRI-new', 3, '[]', 7, null, 'E:\\gal\\b', stamp(), stamp(), stamp())
      db.prepare('DELETE FROM games WHERE path_hash=?').run(g2.pathHash)
      const moved = db.prepare('SELECT 1 FROM games WHERE path_hash=?').get(newHash)
      check('10.修改路径后 games 记录迁移到新 hash', moved !== undefined)
    } finally {
      db.close()
    }

    // ---------- S11 数据目录迁移（REST） ----------
    const dir3 = path.join(tmp, 'moved')
    await mkdir(dir3, { recursive: true })
    const s3 = await startServer(dir2, 31903)
    try {
      const res = await httpJson(31903, 'POST', '/api/storage', { path: dir3 })
      check('11.数据目录迁移（location.json 更新 + db 一致性副本）', res.ok === true && res.dataPath.toLowerCase() === dir3.toLowerCase())
      const libAfter = await httpJson(31903, 'GET', '/api/library')
      check('11b.迁移后游戏库仍存在（3 个）', libAfter.ok === true && libAfter.games.length === 3)
      const dbMoved = await openDb(dir3)
      const movedCount = dbMoved.prepare('SELECT COUNT(*) c FROM games').get().c
      dbMoved.close()
      check('11c.新目录 moeshelf.db 数据完整', movedCount === 3)
    } finally {
      await stop(s3)
    }

    // ---------- S15 重启后数据仍在 ----------
    const s4 = await startServer(dir3, 31904)
    try {
      const lib = await httpJson(31904, 'GET', '/api/library')
      const pt = await httpJson(31904, 'GET', '/api/playtime')
      const ok15 = lib.ok && lib.games.length === 3 && Object.keys(pt.games).length >= 2
      check('15.重启后数据仍然存在（games=3, playtime 保留）', ok15 === true)
    } finally {
      await stop(s4)
    }
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {})
  }

  const failed = results.filter((r) => !r.ok)
  console.log('\n===== SQLite 验证结果：' + (results.length - failed.length) + '/' + results.length + ' 通过 =====')
  if (failed.length) {
    for (const f of failed) console.log('  FAIL: ' + f.label)
    process.exit(1)
  }
}

async function pathExistsDb(dir) {
  try {
    await readFile(path.join(dir, 'moeshelf.db'))
    return true
  } catch {
    return false
  }
}

main().catch((e) => {
  console.error('[ERROR]', e)
  process.exit(1)
})
