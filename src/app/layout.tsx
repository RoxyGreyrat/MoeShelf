import type { Metadata, Viewport } from 'next'
import { ToastProvider } from '@/components/toast'
import './globals.css'

export const metadata: Metadata = {
  title: 'Moeshelf · Galgame 收藏库',
  description:
    '像 Infuse 管理本地视频一样，管理你的本地 Galgame 收藏，自动刮削封面与元数据',
  manifest: '/manifest.webmanifest',
}

export const viewport: Viewport = {
  themeColor: '#0a0b10',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="min-h-screen bg-ink-950 text-white antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
