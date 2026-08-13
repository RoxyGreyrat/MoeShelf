import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({
    name: 'Galgame 启动器',
    short_name: 'Galgame',
    description: '本地 Galgame 启动器：扫描、刮削、启动',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0b10',
    theme_color: '#0a0b10',
    lang: 'zh-CN',
  })
}
