/**
 * MoeShelf 手机串流 · 输入注入（Windows）
 *
 * 集中了测试台已实测通过的全部细节：
 *   · SetProcessDPIAware() —— 声明 DPI 感知后，屏幕坐标 / 窗口矩形 / 视频像素三者 1:1
 *     （实测不声明时 2560×1440 的屏幕被报成 2048×1152，坐标整体偏移）
 *   · 窗口矩形每次输入现算 —— 窗口被拖动/缩放后依然准（实测四角/中心全中）
 *   · client / window 矩形自动判定 —— 抓「窗口」含不含标题栏不确定，用画面尺寸反推
 *   · ensureForeground() —— 不在顶层时注入的点击会被别的窗口收走（实测 前台 False→True 后正常）
 *   · 60Hz 合并 move —— 手机连续拖拽不会打爆 SendInput
 *
 * ⚠️ koffi 的类型注册是**进程全局**的，而 Next.js 会把同一模块在多份 bundle 里各执行一次，
 *    重复注册会抛 `Duplicate type name`。所以全部绑定放进 globalThis 单例惰性初始化，只做一次。
 */
import koffi from 'koffi'
import { execFileSync } from 'node:child_process'

export interface WinInfo { hwnd: number; pid: number; process: string; title: string; exePath: string; left: number; top: number; width: number; height: number }
export interface CaptureRect { left: number; top: number; width: number; height: number; how: 'window' | 'client' | 'screen'; win: WinInfo }

const MOVE = 0x0001, LEFTDOWN = 0x0002, LEFTUP = 0x0004, RIGHTDOWN = 0x0008, RIGHTUP = 0x0010
const MIDDLEDOWN = 0x0020, MIDDLEUP = 0x0040, WHEEL = 0x0800, KEYUP = 0x0002
const INPUT_MOUSE = 0, INPUT_KEYBOARD = 1
const HWND_TOPMOST = -1n, HWND_NOTOPMOST = -2n
const SWP_NOMOVE = 0x0002, SWP_NOSIZE = 0x0001, SWP_SHOWWINDOW = 0x0040, SW_RESTORE = 9
const NAMED_KEYS: Record<string, number> = {
  Enter: 0x0d, ' ': 0x20, Escape: 0x1b, Backspace: 0x08, Tab: 0x09,
  ArrowLeft: 0x25, ArrowUp: 0x26, ArrowRight: 0x27, ArrowDown: 0x28,
  Control: 0x11, Shift: 0x10, PageUp: 0x21, PageDown: 0x22,
}

interface Bindings {
  inputSize: number
  GetCursorPos: (p: any) => boolean
  SetCursorPos: (x: number, y: number) => boolean
  SendInput: (n: number, p: any, cb: number) => number
  GetSystemMetrics: (i: number) => number
  VkKeyScanW: (ch: number) => number
  GetWindowRect: (h: any, r: any) => boolean
  GetClientRect: (h: any, r: any) => boolean
  ClientToScreen: (h: any, p: any) => boolean
  SetProcessDPIAware: () => boolean
  SetForegroundWindow: (h: any) => boolean
  BringWindowToTop: (h: any) => boolean
  ShowWindow: (h: any, cmd: number) => boolean
  IsIconic: (h: any) => boolean
  SetWindowPos: (h: any, after: any, x: number, y: number, cx: number, cy: number, f: number) => boolean
  GetForegroundWindow: () => any
}

function createBindings (): Bindings {
  const user32 = koffi.load('user32.dll')
  const POINT = koffi.struct('MS_POINT', { x: 'long', y: 'long' })
  const RECT = koffi.struct('MS_RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' })
  const MOUSEINPUT = koffi.struct('MS_MOUSEINPUT', { dx: 'long', dy: 'long', mouseData: 'uint32', dwFlags: 'uint32', time: 'uint32', dwExtraInfo: 'uint64' })
  const KEYBDINPUT = koffi.struct('MS_KEYBDINPUT', { wVk: 'uint16', wScan: 'uint16', dwFlags: 'uint32', time: 'uint32', dwExtraInfo: 'uint64' })
  const HARDWAREINPUT = koffi.struct('MS_HARDWAREINPUT', { uMsg: 'uint32', wParamL: 'uint16', wParamH: 'uint16' })
  const INPUTUNION = koffi.union('MS_INPUTUNION', { mi: MOUSEINPUT, ki: KEYBDINPUT, hi: HARDWAREINPUT })
  const INPUT = koffi.struct('MS_INPUT', { type: 'uint32', u: INPUTUNION })
  return {
    inputSize: koffi.sizeof(INPUT),
    GetCursorPos: user32.func('bool GetCursorPos(_Out_ MS_POINT *p)'),
    SetCursorPos: user32.func('bool SetCursorPos(int x, int y)'),
    SendInput: user32.func('uint32 SendInput(uint32 n, MS_INPUT *p, int cb)'),
    GetSystemMetrics: user32.func('int GetSystemMetrics(int i)'),
    VkKeyScanW: user32.func('short VkKeyScanW(uint16 ch)'),
    GetWindowRect: user32.func('bool GetWindowRect(void *h, _Out_ MS_RECT *r)'),
    GetClientRect: user32.func('bool GetClientRect(void *h, _Out_ MS_RECT *r)'),
    ClientToScreen: user32.func('bool ClientToScreen(void *h, _Inout_ MS_POINT *p)'),
    SetProcessDPIAware: user32.func('bool SetProcessDPIAware()'),
    SetForegroundWindow: user32.func('bool SetForegroundWindow(void *h)'),
    BringWindowToTop: user32.func('bool BringWindowToTop(void *h)'),
    ShowWindow: user32.func('bool ShowWindow(void *h, int cmd)'),
    IsIconic: user32.func('bool IsIconic(void *h)'),
    SetWindowPos: user32.func('bool SetWindowPos(void *h, void *after, int x, int y, int cx, int cy, uint32 f)'),
    GetForegroundWindow: user32.func('void *GetForegroundWindow()'),
  }
}

const g = globalThis as unknown as { __moeshelfKoffi?: Bindings; __moeshelfDpi?: boolean }
function bind (): Bindings {
  if (!g.__moeshelfKoffi) g.__moeshelfKoffi = createBindings()
  if (!g.__moeshelfDpi) { try { g.__moeshelfKoffi.SetProcessDPIAware() } catch {} ; g.__moeshelfDpi = true }
  return g.__moeshelfKoffi
}

export function ensureDpiAware (): void { bind() }
export const screenSize = () => { const b = bind(); return { w: b.GetSystemMetrics(0), h: b.GetSystemMetrics(1) } }

export function cursor (): { x: number; y: number } {
  const p: any = {}
  bind().GetCursorPos(p)
  return { x: p.x, y: p.y }
}

const mouseInput = (flags: number, data = 0) => [{ type: INPUT_MOUSE, u: { mi: { dx: 0, dy: 0, mouseData: data, dwFlags: flags, time: 0, dwExtraInfo: 0 } } }]

export function setCursor (x: number, y: number): void { bind().SetCursorPos(x, y) }

export function mouseButton (kind: 'left' | 'right' | 'middle', down: boolean): number {
  const b = bind()
  const flags = kind === 'left' ? (down ? LEFTDOWN : LEFTUP)
    : kind === 'right' ? (down ? RIGHTDOWN : RIGHTUP)
      : (down ? MIDDLEDOWN : MIDDLEUP)
  return b.SendInput(1, mouseInput(flags), b.inputSize)
}

export function mouseWheel (delta: number): number { const b = bind(); return b.SendInput(1, mouseInput(WHEEL, delta), b.inputSize) }

function keyPress (vk: number, down: boolean): number {
  const b = bind()
  return b.SendInput(1, [{ type: INPUT_KEYBOARD, u: { ki: { wVk: vk, wScan: 0, dwFlags: down ? 0 : KEYUP, time: 0, dwExtraInfo: 0 } } }], b.inputSize)
}

/** 命名键或单字符（含中英文）；返回是否成功 */
export function typeKey (key: string): boolean {
  const b = bind()
  if (NAMED_KEYS[key] !== undefined) { keyPress(NAMED_KEYS[key], true); keyPress(NAMED_KEYS[key], false); return true }
  if (key.length !== 1) return false
  const r = b.VkKeyScanW(key.charCodeAt(0))
  const vk = r & 0xff
  if (vk === 0xff || vk === 0) return false
  const shift = (r >> 8) & 1, ctrl = (r >> 8) & 2, alt = (r >> 8) & 4
  if (shift) keyPress(0x10, true); if (ctrl) keyPress(0x11, true); if (alt) keyPress(0x12, true)
  keyPress(vk, true); keyPress(vk, false)
  if (alt) keyPress(0x12, false); if (ctrl) keyPress(0x11, false); if (shift) keyPress(0x10, false)
  return true
}

// ── 窗口 ────────────────────────────────────────────────────────────────────
const winCache = { at: 0, list: [] as WinInfo[] }

export function listWindows (force = false): WinInfo[] {
  const b = bind()
  if (!force && Date.now() - winCache.at < 4000) return winCache.list
  let raw: any[] = []
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command',
      '[Console]::OutputEncoding=[Text.Encoding]::UTF8; $h=@{}; Get-CimInstance Win32_Process | ForEach-Object { $h[[int]$_.ProcessId]=$_.ExecutablePath }; Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object ProcessName,Id,MainWindowTitle,MainWindowHandle,@{n="ExePath";e={$h[[int]$_.Id]}} | ConvertTo-Json -Compress',
    ], { encoding: 'utf8', timeout: 10000 })
    const parsed = JSON.parse(out || '[]')
    raw = Array.isArray(parsed) ? parsed : [parsed]
  } catch { return winCache.list }
  const list: WinInfo[] = []
  for (const w of raw) {
    const hwnd = Number(w.MainWindowHandle)
    if (!hwnd || !w.MainWindowTitle) continue
    const r: any = {}
    try { b.GetWindowRect(BigInt(hwnd), r) } catch { continue }
    const width = r.right - r.left, height = r.bottom - r.top
    if (width < 80 || height < 60) continue
    list.push({ hwnd, pid: Number(w.Id), process: String(w.ProcessName), title: String(w.MainWindowTitle), exePath: String(w.ExePath || ''), left: r.left, top: r.top, width, height })
  }
  winCache.at = Date.now(); winCache.list = list
  return list
}

/**
 * 找游戏窗口。优先级（实测得出）：
 *   1. exeDir —— 进程可执行文件所在目录 == 游戏目录。
 *      很多引擎（BGI/Ethornell 等）的启动器会自我重启成同目录的引擎主程序，
 *      进程名与 exe 名不同（实测 BGI_CHS_130321.exe → BGI.exe）、pid 也变了，只有「同目录」始终成立。
 *   2. pid / process —— 简单引擎直接可用。
 *   3. title —— 兜底。
 */
export function findWindow (opts: { title?: string; pid?: number; process?: string; exeDir?: string }): WinInfo | null {
  const list = listWindows()
  if (opts.exeDir) {
    const dir = opts.exeDir.replace(/[\\/]+$/, '').toLowerCase()
    const hit = list.find(w => w.exePath && w.exePath.toLowerCase().startsWith(dir + '\\')) ||
      list.find(w => w.exePath && w.exePath.toLowerCase().startsWith(dir + '/'))
    if (hit) return hit
  }
  if (opts.pid) { const w = list.find(x => x.pid === opts.pid); if (w) return w }
  if (opts.process) {
    const p = opts.process.toLowerCase()
    const w = list.find(x => x.process.toLowerCase() === p) || list.find(x => x.process.toLowerCase().startsWith(p))
    if (w) return w
  }
  if (opts.title) {
    const t = opts.title
    return list.find(w => w.title === t) || list.find(w => w.title.includes(t)) || list.find(w => w.title.toLowerCase().includes(t.toLowerCase())) || null
  }
  return null
}

/** 被采集窗口的屏幕矩形（物理像素）；用画面尺寸反推该用 window 还是 client 矩形 */
export function captureRect (win: WinInfo, frameW?: number, frameH?: number): CaptureRect {
  const b = bind()
  const wr: any = {}
  b.GetWindowRect(BigInt(win.hwnd), wr)
  const windowRect = { left: wr.left, top: wr.top, width: wr.right - wr.left, height: wr.bottom - wr.top }
  let clientRect: { left: number; top: number; width: number; height: number } | null = null
  try {
    const cr: any = {}
    b.GetClientRect(BigInt(win.hwnd), cr)
    const p: any = { x: 0, y: 0 }
    b.ClientToScreen(BigInt(win.hwnd), p)
    clientRect = { left: p.x, top: p.y, width: cr.right - cr.left, height: cr.bottom - cr.top }
  } catch {}
  if (frameW && frameH) {
    const near = (a: number, v: number) => Math.abs(a - v) <= 4
    if (clientRect && near(clientRect.width, frameW) && near(clientRect.height, frameH)) return { ...clientRect, how: 'client', win }
    if (near(windowRect.width, frameW) && near(windowRect.height, frameH)) return { ...windowRect, how: 'window', win }
  }
  return { ...windowRect, how: 'window', win }
}

/** 画面归一化坐标 → 屏幕物理坐标 */
export function frameToScreen (rect: CaptureRect, nx: number, ny: number): { x: number; y: number } {
  const s = screenSize()
  return {
    x: Math.max(0, Math.min(s.w - 1, Math.round(rect.left + nx * rect.width))),
    y: Math.max(0, Math.min(s.h - 1, Math.round(rect.top + ny * rect.height))),
  }
}

// ── 前台 / 置顶 ─────────────────────────────────────────────────────────────
const topState = { hwnd: null as bigint | null }

export function ensureForeground (win: WinInfo): void {
  const b = bind()
  const h = BigInt(win.hwnd)
  try {
    if (b.IsIconic(h)) b.ShowWindow(h, SW_RESTORE)
    b.BringWindowToTop(h)
    b.SetForegroundWindow(h)
    b.SetWindowPos(h, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW)
    topState.hwnd = h
  } catch {}
}

export function restoreTopmost (): void {
  const b = bind()
  if (topState.hwnd === null) return
  try { b.SetWindowPos(topState.hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE) } catch {}
  topState.hwnd = null
}

export function isForeground (win: WinInfo): boolean {
  try { return bind().GetForegroundWindow() === BigInt(win.hwnd) } catch { return false }
}

// ── 移动合并到 60Hz ─────────────────────────────────────────────────────────
let pending: { x: number; y: number } | null = null
let timer: ReturnType<typeof setInterval> | null = null

export function moveTo (x: number, y: number): void {
  const b = bind()
  pending = { x, y }
  if (timer) return
  timer = setInterval(() => { if (pending) { const p = pending; pending = null; b.SetCursorPos(p.x, p.y) } }, 16)
}
