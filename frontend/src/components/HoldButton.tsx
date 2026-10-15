import { useState } from 'react'
import { motion } from 'motion/react'
import { TACTILE_SPRING } from './tactile'
import { HOLD_MS } from './ConfirmDialog'
import { useHoldToFire } from './useHoldToFire'

// Standalone hold-to-fire button (ticket 18): same press-and-hold language
// as ConfirmDialog's danger button, but without a modal — the parent owns
// the aftermath (e.g. logout + "signed out" toast + redirect). Holding
// fills over HOLD_MS; early release/blur/leave rolls back; keyboard users
// hold Enter/Space (the testable seam — jsdom has no pointer capture).
// Fully static under reduced-motion via the root MotionConfig + CSS guard.
export function HoldButton({
  onFire,
  children,
  holdingLabel,
  hint,
  disabled = false,
  className = '',
}: {
  onFire: () => void
  children: React.ReactNode
  holdingLabel: React.ReactNode
  hint?: string
  disabled?: boolean
  className?: string
}) {
  const [fired, setFired] = useState(false)
  // Hold state machine is shared (useHoldToFire); the fired latch stays here.
  const { holding, buttonRef, holdHandlers } = useHoldToFire({
    durationMs: HOLD_MS,
    disabled: disabled || fired,
    onFire: () => {
      setFired(true)
      onFire()
    },
  })

  // RTL: fill grows from the inline-start (right) edge, mirroring ConfirmDialog.
  const overlayStyle: React.CSSProperties = {
    clipPath: holding ? 'inset(0 0 0 0)' : 'inset(0 0 0 100%)',
    transitionProperty: 'clip-path',
    transitionDuration: holding ? `${HOLD_MS}ms` : '200ms',
    transitionTimingFunction: holding ? 'linear' : 'var(--ease-tactile)',
  }

  const hintId = hint ? 'hold-button-hint' : undefined

  return (
    <span className="inline-flex flex-col gap-1">
      <motion.button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-busy={holding}
        aria-describedby={hintId}
        {...holdHandlers}
        whileTap={{ scale: 0.97 }}
        transition={TACTILE_SPRING}
        className={`transition-ui clickable relative isolate touch-none overflow-hidden rounded-xl border px-5 py-2 font-bold select-none ${className}`}
        style={{ borderColor: 'var(--secondary)', color: 'var(--secondary)' }}
      >
        <span className="relative">{holding ? holdingLabel : children}</span>
        <span
          aria-hidden="true"
          className="btn-secondary absolute inset-0 flex items-center justify-center px-5"
          style={overlayStyle}
        >
          {holding ? holdingLabel : children}
        </span>
      </motion.button>
      {hint && (
        <span id={hintId} className="muted-t text-xs">
          {hint}
        </span>
      )}
    </span>
  )
}
