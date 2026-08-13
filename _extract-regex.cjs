const fs = require('fs')
const api = 'E:/galgame-library-build-1.4.2/.next/server/app/api/'
const names = ['library','settings','cache','storage','playtime','network','drives','list-dir','list-exes','launch','open-folder','image','proxy-test','scan']
const files = names.map((n) => api + n + '/route.js')
files.push('E:/galgame-library-build-1.4.2/.next/server/chunks/147.js')
files.push('E:/galgame-library-build-1.4.2/.next/server/chunks/247.js')
const all = new Map()
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8')
  // 正则字面量内也含中文（如 /卸载|卸载程序|汉化|中文/），单独扫描 /.../ 片段
  const re2 = /\/((?:[^/\n\\]|\\.)*[\u4e00-\u9fff](?:[^/\n\\]|\\.)*)\/[a-z]*/g
  let m
  while ((m = re2.exec(s))) {
    const v = m[1].replace(/\\(.)/g, '$1')
    if (!all.has(v)) all.set(v, f.split(/[\\/]/).pop())
  }
}
const out = [...all.entries()].map(([str, file]) => ({ str, file }))
fs.writeFileSync('E:/galgame-library-src/_cjk-regex.json', JSON.stringify(out, null, 1), 'utf8')
console.log('extracted', out.length, 'CJK regex literals')
