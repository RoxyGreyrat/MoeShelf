// 网络请求共享库（S1 依据编译产物重建）。
// 对应编译产物：模块 8026（kv / yZ，fetch 代理封装）+ 模块 1085（nE=ProxyAgent，he=fetch）。
import { ProxyAgent } from 'undici'
import { loadSettings } from './core'

/** 模块 8026 yZ：通用 UA */
export const UA_STRING =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 GalgameLibrary/1.0.5'

let cachedAgent: ProxyAgent | null = null
let cachedProxy = ''

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
 * 模块 8026 kv：带超时与代理的 fetch。
 * 默认 12s 超时、cache:no-store；配置了代理时走 ProxyAgent。
 */
export async function fetchWithProxy(
  url: string,
  opts: RequestInit = {},
  timeoutMs = 12000
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const agent = await getProxyAgent()
    const merged: RequestInit = { ...opts, signal: controller.signal, cache: 'no-store' }
    if (agent) {
      return await fetchWithStack(url, { ...merged, dispatcher: agent } as unknown as RequestInit)
    }
    return await fetch(url, merged)
  } finally {
    clearTimeout(timer)
  }
}
