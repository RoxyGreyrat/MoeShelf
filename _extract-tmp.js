const fs = require('fs')
function extract(file, startMarker, endMarker, label) {
  const s = fs.readFileSync(file, 'utf8')
  const i = s.indexOf(startMarker)
  if (i < 0) { console.log('[' + label + '] MARKER NOT FOUND: ' + startMarker); return }
  const j = endMarker ? s.indexOf(endMarker, i) : s.length
  console.log('===== ' + label + ' =====')
  console.log(s.slice(i, j < 0 ? s.length : j))
  console.log()
}
const base = 'E:/galgame-library-build-1.4.2/.next/server/app/api/'
extract(base + 'search/route.js', 'let u="force-dynamic"', 'let m=new n.AppRouteRouteModule', 'search route')
extract(base + 'characters/route.js', 'let v="force-dynamic"', 'let S=new n.AppRouteRouteModule', 'characters route')
extract(base + 'characters/route.js', 'async function m(e)', 'let S=new n.AppRouteRouteModule', 'characters route fn m')
extract(base + 'cn-description/route.js', 'let u="force-dynamic"', 'let m=new n.AppRouteRouteModule', 'cn-description route')
