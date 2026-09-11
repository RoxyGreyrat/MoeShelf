import fs from 'node:fs'
import path from 'node:path'

/**
 * 手机串流的质量参数（用户可在 /stream/settings 手动调）
 * 注意：路由文件（route.ts）只能导出 GET/POST 等白名单符号，
 * 所以共享的类型与读写函数必须放在普通 lib 文件里（否则 next build 会直接报错）。
 */
export interface StreamConfig {
  videoBitrateMbps: number        // 0 = 不限制
  scaleToWidth: number            // 0 = 不缩放
  contentHint: 'text' | 'detail' | 'motion'
  degradationPreference: 'maintain-resolution' | 'maintain-framerate' | 'balanced'
  frameRate: number
  audioBitrateKbps: number        // 0 = 不限制
  disableAudioProcessing: boolean
  audioHint: 'music' | 'speech'
  preferH264: boolean
}

export const DEFAULT_CONFIG: StreamConfig = {
  videoBitrateMbps: 0,
  scaleToWidth: 0,
  contentHint: 'text',
  degradationPreference: 'maintain-resolution',
  frameRate: 30,
  audioBitrateKbps: 0,
  disableAudioProcessing: true,
  audioHint: 'music',
  preferH264: true,
}

export function configPath (): string {
  const dir = process.env.MOESHELF_DATA_DIR || path.join(process.cwd(), 'data')
  return path.join(dir, 'stream-config.json')
}

export function readStreamConfig (): StreamConfig {
  try {
    const j = JSON.parse(fs.readFileSync(configPath(), 'utf8'))
    return { ...DEFAULT_CONFIG, ...j }
  } catch { return { ...DEFAULT_CONFIG } }
}

export function writeStreamConfig (cfg: StreamConfig): string {
  const p = configPath()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n')
  return p
}
