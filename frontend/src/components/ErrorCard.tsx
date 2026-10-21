import type { ReactNode } from 'react'
import { str } from '../i18n'

/** The shared "something failed" card: a message plus an optional retry. */
export function ErrorCard({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div className="card mt-3 rounded-2xl p-4" role="alert">
      {children}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="btn-secondary transition-ui mt-3 rounded-xl px-4 py-1.5"
        >
          {str.retry}
        </button>
      )}
    </div>
  )
}
