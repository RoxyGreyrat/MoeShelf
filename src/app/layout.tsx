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

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('moeshelf-theme');var d;if(t==='light'||t==='dark'){d=t}else{d=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.setAttribute('data-theme',d)}catch(e){document.documentElement.setAttribute('data-theme','dark')}})()`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" className="dark" data-theme="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-surface-0 text-primary antialiased">
        <div
          id="moeshelf-root"
          className="min-h-screen"
          style={{ filter: 'var(--theme-filter, none)' }}
        >
          <ToastProvider>{children}</ToastProvider>
        </div>
      </body>
    </html>
  )
}
