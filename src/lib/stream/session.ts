/**
 * MoeShelf 手机串流 · 会话与信令（进程内状态）
 *
 * 注意：Next.js 的每个 route 文件各自打包，模块级变量不共享 → 状态必须挂在 globalThis 上。
 *
 * 信令契约（与已验证的测试台一致）：
 *   POST /api/stream/hello   { role:'host'|'viewer', agent?, capture?, game? }
 *   POST /api/stream/signal  { role, msg }          → 投递到对端队列
 *   GET  /api/stream/signal?role=host|viewer        → 取走队列（同时刷新心跳）
 *   POST /api/stream/input   { type, nx, ny, ... }  → 注入
 *   POST /api/stream/bye     { role }
 *   GET  /api/stream/state
 */

export interface CaptureInfo {
  width?: number
  height?: number
  frameRate?: number
  label?: string
  surface?: string
  windowTitle?: string
  audio?: boolean
}

export interface SignalMsg { type: string; sdp?: string; candidate?: any; sessionId?: string }

export interface StreamSession {
  id: string
  createdAt: number
  game?: string
  capture: CaptureInfo | null
  host: { seen: number; agent: string }
  viewer: { seen: number; agent: string; startedAt: number }
  signals: { host: SignalMsg[]; viewer: SignalMsg[] }
  input: { count: number; lastAt: number; last: any }
}

const STALE_MS = 7000
const MAX_QUEUE = 80

function createStore () {
  const store = {
    session: null as StreamSession | null,
    newSessionId: () => Math.random().toString(36).slice(2, 10),
    /** 会话是否还活着（host 或 viewer 有任一端在线） */
    alive (s: StreamSession | null): s is StreamSession {
      if (!s) return false
      const now = Date.now()
      return now - s.host.seen < STALE_MS || now - s.viewer.seen < STALE_MS
    },
    get (): StreamSession | null {
      if (!store.alive(store.session)) return null
      return store.session
    },
    /** 手机进入：开新会话（丢掉陈旧信令）并通知采集端重新推流 */
    viewerHello (agent: string): StreamSession {
      const s: StreamSession = {
        id: store.newSessionId(), createdAt: Date.now(),
        capture: null,
        host: { seen: 0, agent: '' },
        viewer: { seen: Date.now(), agent, startedAt: Date.now() },
        signals: { host: [], viewer: [] },
        input: { count: 0, lastAt: 0, last: null },
      }
      // 复用采集端信息（采集端可能先注册）
      const prev = store.session
      if (prev && Date.now() - prev.host.seen < STALE_MS * 3) {
        s.host = prev.host
        s.capture = prev.capture
        s.game = prev.game
      }
      s.signals.host.push({ type: 'viewer-joined', sessionId: s.id })
      store.session = s
      return s
    },
    /** 采集端注册（可先于手机） */
    hostHello (agent: string, capture: CaptureInfo | null, game?: string): StreamSession {
      let s = store.session
      if (!s) {
        s = {
          id: store.newSessionId(), createdAt: Date.now(), capture: null,
          host: { seen: 0, agent: '' }, viewer: { seen: 0, agent: '', startedAt: 0 },
          signals: { host: [], viewer: [] }, input: { count: 0, lastAt: 0, last: null },
        }
        store.session = s
      }
      s.host.seen = Date.now()
      s.host.agent = agent
      if (capture) s.capture = capture
      if (game) s.game = game
      return s
    },
    touch (role: 'host' | 'viewer') {
      const s = store.session
      if (s) s[role].seen = Date.now()
    },
    push (to: 'host' | 'viewer', msg: SignalMsg) {
      const s = store.session
      if (!s) return
      s.signals[to].push(msg)
      if (s.signals[to].length > MAX_QUEUE) s.signals[to].shift()
    },
    drain (role: 'host' | 'viewer'): SignalMsg[] {
      const s = store.session
      if (!s) return []
      s[role].seen = Date.now()
      return s.signals[role].splice(0, s.signals[role].length)
    },
    bye (role: 'host' | 'viewer') {
      const s = store.session
      if (!s) return
      s[role].seen = 0
      if (role === 'host') s.capture = null
      store.push(role === 'host' ? 'viewer' : 'host', { type: role === 'viewer' ? 'viewer-left' : 'bye' })
    },
    status () {
      const s = store.get()
      return {
        sessionId: s ? s.id : null,
        hostOnline: !!s && Date.now() - s.host.seen < STALE_MS,
        viewerOnline: !!s && Date.now() - s.viewer.seen < STALE_MS,
        capture: s ? s.capture : null,
        game: s ? s.game : null,
        hostAgent: s ? s.host.agent : '',
        viewerAgent: s ? s.viewer.agent : '',
        inputCount: s ? s.input.count : 0,
        lastInput: s ? s.input.last : null,
      }
    },
  }
  return store
}

type Store = ReturnType<typeof createStore>
const g = globalThis as unknown as { __moeshelfStream?: Store }
export const stream: Store = g.__moeshelfStream ?? (g.__moeshelfStream = createStore())
