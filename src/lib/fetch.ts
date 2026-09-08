// 网络请求共享库（S1 依据编译产物重建）。
// 对应编译产物：模块 8026（kv / yZ，fetch 代理封装）+ 模块 1085（nE=ProxyAgent，he=fetch）。
import { AsyncLocalStorage } from 'async_hooks'
import { ProxyAgent } from 'undici'
import { loadSettings } from './core'

/** 模块 8026 yZ：通用 UA */
export const UA_STRING =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Moeshelf/1.6.1'

let cachedAgent: ProxyAgent | null = null
let cachedProxy = ''

// 代理回退标记：按请求（AsyncLocalStorage）隔离，避免并发请求之间互相误报。
interface ProxyFallbackState {
  fallback: boolean
}
const proxyFallbackContext = new AsyncLocalStorage<ProxyFallbackState>()

/** 在独立上下文中执行请求逻辑 */
export async function withProxyFallbackContext<T>(fn: () => Promise<T>): Promise<T> {
  return proxyFallbackContext.run({ fallback: false }, fn)
}

/** 本次请求是否发生过代理回退（只能在 withProxyFallbackContext 内读取） */
export function proxyFallbackUsedInRequest(): boolean {
  return proxyFallbackContext.getStore()?.fallback ?? false
}

/** 模块 8026 内部：按 settings.proxy 缓存 ProxyAgent（地址变化时重建） */
async function getProxyAgent(): Promise<ProxyAgent | null> {
  try {
    const proxy = ((await loadSettings()).proxy ?? '').trim()
    if (proxy !== cachedProxy) {
      cachedAgent = proxy && /^https?:\/\//i.test(proxy) ? new ProxyAgent(proxy) : null
      cachedProxy = proxy
    }
  } catch {
    cachedAgent = null
  }
  return cachedAgent
}

/** 模块 1085 he：fetch 包装（失败时补 captureStackTrace 后原样抛出） */
async function fetchWithStack(
  url: string,
  opts: RequestInit
): Promise<Response> {
  try {
    return await fetch(url, opts)
  } catch (err) {
    if (err && typeof err === 'object') Error.captureStackTrace(err as Error)
    throw err
  }
}

/**
 * 带超时的一次性请求。每次调用使用独立的 AbortController，
 * 使代理失败后的直连重试拿到全新的 signal（不会因上次超时被 abort）。
 */
async function fetchOnce(
  url: string,
  opts: RequestInit,
  timeoutMs: number,
  dispatcher?: unknown
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const merged: RequestInit = { ...opts, signal: controller.signal, cache: 'no-store' }
    if (dispatcher) {
      return await fetchWithStack(url, { ...merged, dispatcher } as unknown as RequestInit)
    }
    return await fetch(url, merged)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 模块 8026 kv：带超时与代理的 fetch。
 * 默认 12s 超时、cache:no-store；配置了代理时先走 ProxyAgent。
 * 若代理连接失败/超时（抛错），对同一请求用直连重试一次（保留代理正常时的行为），
 * 并累计回退计数供上层在响应中提示「代理不可用，已尝试直连」；直连仍失败时原样抛错。
 */
export async function fetchWithProxy(
  url: string,
  opts: RequestInit = {},
  timeoutMs = 12000
): Promise<Response> {
  const agent = await getProxyAgent()
  if (!agent) {
    return fetchOnce(url, opts, timeoutMs)
  }
  try {
    return await fetchOnce(url, opts, timeoutMs, agent)
  } catch {
    // 代理连接错误/超时 → 直连重试一次；在请求上下文中记录本次回退
    const state = proxyFallbackContext.getStore()
    if (state) state.fallback = true
    return fetchOnce(url, opts, timeoutMs)
  }
}
