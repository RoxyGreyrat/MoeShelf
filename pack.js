// 打包脚本：把 next build 的 standalone 产物组装成"解压即用"的发布目录。
// 用法：node pack.js <目标目录> [--with-data]
// 布局与 E:\galgame-library-build-1.4.2 一致：根目录 = server.js + node_modules + .next + 启动脚本 + data。
const fs = require('fs')
const path = require('path')

const root = __dirname
const version = require('./package.json').version
const target = path.resolve(process.argv[2] || path.join(root, '..', 'galgame-library-build-' + version))
const withData = process.argv.includes('--with-data')

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true })
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name)
    const d = path.join(dst, e.name)
    if (e.isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}

function fail(msg) {
  console.error('[pack] ' + msg)
  process.exit(1)
}

const standalone = path.join(root, '.next', 'standalone')
if (!fs.existsSync(standalone)) fail('未找到 .next/standalone，请先 npm run build')
if (!fs.existsSync(path.join(root, '.next', 'static'))) fail('未找到 .next/static')
if (fs.existsSync(target)) fail('目标目录已存在，拒绝覆盖：' + target)

console.log('[pack] 目标目录：' + target)
fs.mkdirSync(target, { recursive: true })

// 1. standalone 根文件（server.js / node_modules / package.json 等）
for (const e of fs.readdirSync(standalone, { withFileTypes: true })) {
  const s = path.join(standalone, e.name)
  const d = path.join(target, e.name)
  if (e.isDirectory()) copyDir(s, d)
  else fs.copyFileSync(s, d)
}

// 2. 完整 .next 覆盖（含 static/ 与全部 manifest，与 1.4.2 布局一致）
const nextDir = path.join(target, '.next')
fs.rmSync(nextDir, { recursive: true, force: true })
copyDir(path.join(root, '.next'), nextDir)

// 3. 启动脚本与文档
for (const f of ['launcher.js', '启动.bat', '开启局域网访问.bat', 'README.md', '更新日志.md']) {
  const s = path.join(root, f)
  if (fs.existsSync(s)) fs.copyFileSync(s, path.join(target, f))
}

// 4. 数据（可选）
if (withData) {
  const dataSrc = path.join(root, 'data')
  if (fs.existsSync(dataSrc)) {
    console.log('[pack] 复制 data ...')
    copyDir(dataSrc, path.join(target, 'data'))
  }
}

console.log('[pack] 完成：' + target)
