import { NextResponse } from 'next/server'
import { stream } from '@/lib/stream/session'
import {
  ensureDpiAware, findWindow, captureRect, frameToScreen, moveTo, setCursor,
  mouseButton, mouseWheel, typeKey, ensureForeground, restoreTopmost,
} from '@/lib/stream/input-win32'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** 手机有输入动作后，保持游戏窗口置顶的时间窗（避免电脑用户被抢焦点） */
const KEEP_TOPMOST_MS = 12000

/**
 * 手机端输入 → 注入到被串流的游戏窗口。
 * body: { type:'move'|'tap'|'down'|'up'|'wheel'|'key', nx?, ny?, button?, delta?, key? }
 * nx/ny 是相对「采集画面」的归一化坐标（0~1），按窗口矩形换算成屏幕物理坐标。
 */
export async function POST (req: Request) {
  ensureDpiAware()
  let b: any = {}
  try { b = await req.json() } catch {}

  const s = stream.get()
  const cap = s?.capture
  const win = cap?.windowTitle ? findWindow({ title: cap.windowTitle }) : null
  const rect = win ? captureRect(win, cap?.width, cap?.height) : null

  let detail: any = null
  const toScreen = () => (rect ? frameToScreen(rect, Number(b.nx) || 0, Number(b.ny) || 0) : null)

  switch (b.type) {
    case 'move': {
      const p = toScreen()
      if (p) { moveTo(p.x, p.y); detail = { ...p, base: rect!.how } }
      break
    }
    case 'tap':
    case 'down':
    case 'up': {
      const p = toScreen()
      if (p) { setCursor(p.x, p.y); detail = { ...p, base: rect!.how } }
      const button = b.button === 'right' ? 'right' : b.button === 'middle' ? 'middle' : 'left'
      if (b.type === 'tap') { mouseButton(button, true); mouseButton(button, false) }
      else mouseButton(button, b.type === 'down')
      break
    }
    case 'wheel': {
      mouseWheel(Math.round(Number(b.delta) || 0))
      detail = { delta: Math.round(Number(b.delta) || 0) }
      break
    }
    case 'key': {
      detail = { ok: typeKey(String(b.key || '')) }
      break
    }
    default:
      return NextResponse.json({ ok: false, error: 'unknown type' }, { status: 400 })
  }

  if (s) { s.input.count += 1; s.input.lastAt = Date.now(); s.input.last = { type: b.type, nx: b.nx, ny: b.ny, key: b.key, detail } }
  stream.touch('viewer')

  // 手机正在操作 → 确保游戏窗口在前台并置顶（实测：不在顶层时点击会被别的窗口收走）
  if (win && s && Date.now() - s.input.lastAt < KEEP_TOPMOST_MS) ensureForeground(win)

  return NextResponse.json({ ok: true, detail, window: win ? { title: win.title, how: rect?.how } : null })
}

/** 串流结束时还原置顶（由手机页面离开或采集端退出时调用） */
export async function DELETE () {
  restoreTopmost()
  return NextResponse.json({ ok: true })
}
