import { useCallback, useEffect, useRef, useState } from 'react'
import { safePointerCapture } from './tactile'

// Shared press-and-hold state machine (ticket 19 review fix): ConfirmDialog
// and HoldButton ran identical copies (timer, pointer-capture guards,
// slide-off cancel, Enter/Space keyboard seam). Completion (done/undo vs
// fired) stays in the caller via onFire; everything timed or positional
// lives here. Fully static under reduced-motion (callers own no JS branch —
// the root MotionConfig + CSS guard freeze them).
export function useHoldToFire(opts: { durationMs: number; disabled: boolean; onFire: () => void }) {
  const { durationMs, disabled, onFire } = opts
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const timerRef = useRef<number | null>(null)
  const holdingRef = useRef(false)
  const activePointerRef = useRef<number | null>(null)
  const [holding, setHolding] = useState(false)
  const onFireRef = useRef(onFire)
  onFireRef.current = onFire

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const cancelHold = useCallback(() => {
    if (!holdingRef.current) return
    holdingRef.current = false
    activePointerRef.current = null
    clearTimer()
    setHolding(false)
  }, [clearTimer])

  const startHold = useCallback(() => {
    if (disabled || holdingRef.current) return
    holdingRef.current = true
    setHolding(true)
    timerRef.current = window.setTimeout(() => {
      holdingRef.current = false
      activePointerRef.current = null
      clearTimer()
      setHolding(false)
      onFireRef.current()
    }, durationMs)
  }, [disabled, durationMs, clearTimer])

  const releasePointer = useCallback(
    (pointerId: number) => {
      if (buttonRef.current && safePointerCapture(buttonRef.current, pointerId, 'hasPointerCapture')) {
        safePointerCapture(buttonRef.current, pointerId, 'releasePointerCapture')
      }
    },
    [],
  )

  // Never leave a hold dangling across unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      holdingRef.current = false
    }
  }, [])

  // A disabled parent (e.g. the delete in flight) cancels any fill.
  useEffect(() => {
    if (disabled) cancelHold()
  }, [disabled, cancelHold])

  const samePointer = (pointerId: number | undefined) =>
    typeof pointerId !== 'number' || activePointerRef.current === pointerId

  return {
    holding,
    buttonRef,
    startHold,
    cancelHold,
    holdHandlers: {
      onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
        if (e.isPrimary === false) return
        if (typeof e.button === 'number' && e.button !== 0) return
        if (disabled) return
        if (typeof e.pointerId === 'number') {
          activePointerRef.current = e.pointerId
          safePointerCapture(e.currentTarget, e.pointerId, 'setPointerCapture')
        }
        startHold()
      },
      onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => {
        if (!holdingRef.current) return
        if (!samePointer(e.pointerId)) return
        const rect = e.currentTarget.getBoundingClientRect()
        const pad = 8
        const outside =
          e.clientX < rect.left - pad ||
          e.clientX > rect.right + pad ||
          e.clientY < rect.top - pad ||
          e.clientY > rect.bottom + pad
        if (outside) {
          cancelHold()
          if (typeof e.pointerId === 'number') releasePointer(e.pointerId)
        }
      },
      onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
        if (!samePointer(e.pointerId)) return
        cancelHold()
        if (typeof e.pointerId === 'number') releasePointer(e.pointerId)
      },
      onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => {
        if (!samePointer(e.pointerId)) return
        cancelHold()
        if (typeof e.pointerId === 'number') releasePointer(e.pointerId)
      },
      onLostPointerCapture: cancelHold,
      onBlur: cancelHold,
      onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (e.repeat || (e.key !== 'Enter' && e.key !== ' ')) return
        e.preventDefault()
        startHold()
      },
      onKeyUp: (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        cancelHold()
      },
    },
  }
}
