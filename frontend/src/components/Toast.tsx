import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { setGlobalToast } from '../api/http'

type ToastCtx = { toast: (msg: string) => void }

const Ctx = createContext<ToastCtx>({ toast: () => {} })

export function useToast(): ToastCtx {
  return useContext(Ctx)
}

type ToastItem = { id: number; msg: string }

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef(new Map<number, number>())

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const toast = useCallback(
    (m: string) => {
      const id = nextId++
      // Bounded queue: newest 3 win, oldest drops with its timer cleared.
      setItems((prev) => {
        const dropped = prev.length >= 3 ? prev.slice(0, prev.length - 2) : prev
        for (const d of prev) {
          if (!dropped.includes(d)) {
            const timer = timers.current.get(d.id)
            if (timer) {
              window.clearTimeout(timer)
              timers.current.delete(d.id)
            }
          }
        }
        return [...dropped, { id, msg: m }]
      })
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), 2600),
      )
    },
    [dismiss],
  )

  useEffect(() => {
    setGlobalToast(toast)
  }, [toast])

  useEffect(() => {
    const leftovers = timers.current
    return () => {
      for (const timer of leftovers.values()) window.clearTimeout(timer)
      leftovers.clear()
    }
  }, [])

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      {/* Offset above the FAB layer so messages never cover the primary action. */}
      <div className="fixed bottom-24 inset-x-0 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} role="status" className="toast-msg transition-ui flex items-center gap-3 rounded-xl px-5 py-3 text-sm shadow-lg">
            <span>{t.msg}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="إغلاق التنبيه"
              className="transition-ui clickable underline"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
