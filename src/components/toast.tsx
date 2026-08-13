'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from '@/components/icons'

// 模块 724 Toast 系统：接口与编译产物一致 —— 默认导出 ToastProvider、命名导出 useToast。
export type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

const ToastContext = createContext<{ push: (message: string, type?: ToastType) => void }>({
  push: () => {},
})

export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const push = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++idRef.current
    setToasts(s => [...s, { id, message, type }])
    setTimeout(() => {
      setToasts(s => s.filter(t => t.id !== id))
    }, 4200)
  }, [])

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[calc(100%-2.5rem)] max-w-sm flex-col gap-2">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm shadow-2xl backdrop-blur animate-slide-up ${
              t.type === 'success'
                ? 'border-emerald-400/30 bg-emerald-950/85 text-emerald-100'
                : t.type === 'error'
                  ? 'border-red-400/30 bg-red-950/85 text-red-100'
                  : 'border-white/10 bg-ink-900/95 text-white/85'
            }`}
          >
            <Icon
              name={t.type === 'success' ? 'check' : t.type === 'error' ? 'x' : 'info'}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span className="leading-snug">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
