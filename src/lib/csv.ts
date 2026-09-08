// 资料库 CSV 导出工具（前端使用）。
// 生成带 UTF-8 BOM 的 CSV，Excel 打开中文不乱码。

export interface CsvGameRow {
  title: string
  developer: string
  released: string
  rating: string
  completed: boolean
  favorite: boolean
  downloaded: boolean
  path: string
}

function esc(v: string): string {
  const s = v == null ? '' : String(v)
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

export function buildCsv(rows: CsvGameRow[]): string {
  const header = [
    '游戏名',
    '厂商',
    '发售日',
    '评分',
    '已通关',
    '收藏',
    '状态',
    '路径',
  ]
  const lines = [header.map(esc).join(',')]
  for (const r of rows) {
    lines.push(
      [
        esc(r.title),
        esc(r.developer),
        esc(r.released),
        esc(r.rating),
        r.completed ? '是' : '',
        r.favorite ? '是' : '',
        r.downloaded ? '已下载' : '未下载',
        esc(r.path),
      ].join(',')
    )
  }
  return '\uFEFF' + lines.join('\r\n')
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
