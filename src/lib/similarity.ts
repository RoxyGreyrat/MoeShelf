// 模块 644 的相似度工具（hY / Li / _v），供各刮削数据源做名称匹配。
// 逐行对应编译产物 chunk 136 模块 644：
//   hY = similarityOf，Li = pickBest，_v = sleep。

/** 模块 644 _v：延时 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 内部：编辑距离（与模块 644 内嵌实现一致） */
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const row = [i]
    for (let j = 1; j <= n; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
    prev = row
  }
  return prev[n]
}

/**
 * 模块 644 hY：字符串相似度。
 * 空串 → 0；相等（trim + 小写）→ 1；互为子串 → 0.85；
 * 否则 1 - levenshtein / max(len)。
 */
export function similarityOf(a: string, b: string): number {
  if (!a || !b) return 0
  const x = a.trim().toLowerCase()
  const y = b.trim().toLowerCase()
  if (x === y) return 1
  if (x.includes(y) || y.includes(x)) return 0.85
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length)
}

/**
 * 模块 644 Li：从候选中选出相似度最高者，达到阈值（默认 0.4）才返回，
 * 否则返回 null。
 */
export function pickBest<T>(
  query: string,
  items: T[],
  keyOf: (item: T) => string,
  threshold = 0.4
): T | null {
  let best: T | null = null
  let bestScore = 0
  for (const item of items) {
    const score = similarityOf(query, keyOf(item))
    if (score > bestScore) {
      bestScore = score
      best = item
    }
  }
  return bestScore >= threshold ? best : null
}
