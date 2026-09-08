import { NextResponse } from 'next/server'

export function GET() {
  return new NextResponse(
    JSON.stringify({
      name: 'Moeshelf · Galgame 收藏库',
      short_name: 'Moeshelf',
      description: '本地 Galgame 收藏管理：扫描、刮削、启动',
      start_url: '/',
      display: 'standalone',
      background_color: '#0a0b10',
      theme_color: '#0a0b10',
      lang: 'zh-CN',
    }),
    {
      headers: {
        'Content-Type': 'application/manifest+json; charset=utf-8',
      },
    }
  )
}
