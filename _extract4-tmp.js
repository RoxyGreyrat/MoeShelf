const fs = require('fs')
function extract(file, startMarker, endMarker, label) {
  const s = fs.readFileSync(file, 'utf8')
  const i = s.indexOf(startMarker)
  if (i < 0) { console.log('[' + label + '] MARKER NOT FOUND'); return }
  const j = endMarker ? s.indexOf(endMarker, i) : s.length
  fs.appendFileSync('E:/galgame-library-src/_extracted-more.txt', '===== ' + label + ' =====\n' + s.slice(i, j < 0 ? s.length : j) + '\n\n', 'utf8')
  console.log(label, 'extracted', (j < 0 ? s.length : j) - i, 'chars')
}
fs.writeFileSync('E:/galgame-library-src/_extracted-more.txt', '', 'utf8')
const base = 'E:/galgame-library-build-1.4.2/.next/server/app/api/'
extract(base + 'cn-description/route.js', 'let ', 'let m=new', 'cn-description (first let)')
