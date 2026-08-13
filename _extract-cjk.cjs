const fs = require('fs')
const path = require('path')
const api = 'E:/galgame-library-build-1.4.2/.next/server/app/api/'
const names = ['library','settings','cache','storage','playtime','network','drives','list-dir','list-exes','launch','open-folder','image','proxy-test','scan']
const files = names.map((n) => api + n + '/route.js')
files.push('E:/galgame-library-build-1.4.2/.next/server/chunks/147.js')
files.push('E:/galgame-library-build-1.4.2/.next/server/chunks/247.js')
const all = new Map()
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8')
  const re = /"((?:[^"\\]|\\.)*[\u4e00-\u9fff](?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*[\u4e00-\u9fff](?:[^'\\]|\\.)*)'/g
  let m
  while ((m = re.exec(s))) {
    const v = (m[1] ?? m[2]).replace(/\\(.)/g, '$1')
    if (!all.has(v)) all.set(v, f.split(/[\\/]/).pop())
  }
}
const out = [...all.entries()].map(([str, file]) => ({ str, file }))
fs.writeFileSync('E:/galgame-library-src/_cjk-strings.json', JSON.stringify(out, null, 1), 'utf8')
console.log('extracted', out.length, 'unique CJK strings from', files.length, 'files')
