const fs = require('fs')
const api = 'E:/galgame-library-build-1.4.2/.next/server/app/api/'
const names = ['scrape','search','characters','covers','cn-description']
const files = names.map((n) => api + n + '/route.js')
files.push('E:/galgame-library-build-1.4.2/.next/server/chunks/85.js')
const all = new Map()
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8')
  const re = /"((?:[^"\\]|\\.)*[\u4e00-\u9fff](?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*[\u4e00-\u9fff](?:[^'\\]|\\.)*)'/g
  let m
  while ((m = re.exec(s))) {
    const v = (m[1] ?? m[2]).replace(/\\(.)/g, '$1')
    if (v.length > 400) continue
    if (!all.has(v)) all.set(v, f.split(/[\\/]/).pop())
  }
}
const out = [...all.entries()].map(([str, file]) => ({ str, file }))
fs.writeFileSync('E:/galgame-library-src/_cjk-strings-others.json', JSON.stringify(out, null, 1), 'utf8')
console.log('extracted', out.length, 'unique CJK strings from other files')
