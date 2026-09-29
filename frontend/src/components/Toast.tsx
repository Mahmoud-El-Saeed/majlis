import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { setGlobalToast } from '../api/http'

type ToastCtx = { toast: (msg: string) => void }

const Ctx = createContext<ToastCtx>({ toast: () => {} })

export function useToast(): ToastCtx {
  return useContext(Ctx)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  const toast = useCallback((m: string) => {
    setMsg(m)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(null), 2600)
  }, [])

  setGlobalToast(toast)

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      {msg && (
        <div className="fixed bottom-6 inset-x-0 z-50 flex justify-center px-4" aria-live="polite">
          <div role="status" className="toast-msg transition-ui rounded-xl px-5 py-3 text-sm shadow-lg">
            {msg}
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}
