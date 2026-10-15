import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { str } from '../i18n'
import { Modal } from './Modal'
import { TACTILE_SPRING } from './tactile'
import { useHoldToFire } from './useHoldToFire'

// Ticket 17 hold-to-confirm (dqnamo kitchen pattern): destructive actions
// need press-and-hold — holding fills the danger button over HOLD_MS, early
// release rolls back, completion fires onConfirm then swaps the actions for a
// timed undo notice. Props API is unchanged so all 5 call sites keep working.
//
// HONEST UNDO NOTE: the destructive act fires inside onConfirm (usually an
// async API delete) the moment the hold completes — nothing here can roll the
// server state back. The 5s "تراجع" notice therefore only dismisses/closes
// the dialog; it never claims to restore the deleted thing.
// Ticket 19 codes repair: the idle label now names the hold explicitly
// (`اضغط مطولًا — {confirmLabel}` via str.holdConfirmLabel) so the
// press-and-hold reads unmissable in all 5 destructive flows — a plain
// click rolling back no longer looks "broken". Holding label + hint kept
// as-is; keyboard/pointer semantics byte-identical.
export const HOLD_MS = 1600
export const UNDO_MS = 5000

// Hold strings read from i18n.ts `str` at render time (never captured at
// module scope, so a future language switch re-renders them correctly).

// Pointer-capture guards live in tactile.ts (safePointerCapture) — the
// keyboard path (hold Enter/Space) is the testable seam in jsdom.

// Shared destructive-action confirm (replaces window.confirm everywhere):
// explicit consequence text + press-and-hold danger confirm + safe cancel.
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
}: {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
}) {
  const undoTimer = useRef<number | null>(null)
  const [done, setDone] = useState(false)

  // Hold state machine is shared (useHoldToFire); completion + the timed
  // dismiss notice stay here because only this dialog has them.
  const completeHold = () => {
    setDone(true)
    onConfirm()
    // Timed notice: auto-close after UNDO_MS. The act already fired —
    // this only dismisses the dialog (see HONEST UNDO NOTE above).
    undoTimer.current = window.setTimeout(() => {
      undoTimer.current = null
      onCancel()
    }, UNDO_MS)
  }
  const { holding, buttonRef, holdHandlers } = useHoldToFire({
    durationMs: HOLD_MS,
    disabled: busy || done,
    onFire: completeHold,
  })

  // The undo auto-close must not outlive the dialog.
  useEffect(() => {
    return () => {
      if (undoTimer.current !== null) window.clearTimeout(undoTimer.current)
    }
  }, [])

  const idleLabel = str.holdConfirmLabel(confirmLabel)

  // Overlay fill style. RTL: the dialog is RTL-only, so the fill grows from
  // the inline-start (right) edge — hidden state clips from the left at 100%,
  // holding reveals right-to-left. (dqnamo's LTR original clips the right.)
  // Reduced-motion needs no JS branch: the root MotionConfig (reducedMotion=
  // "user") freezes the motion press, and the global prefers-reduced-motion
  // CSS guard kills the clip-path transition — fully static, same timing.
  const overlayStyle: React.CSSProperties = {
    clipPath: holding ? 'inset(0 0 0 0)' : 'inset(0 0 0 100%)',
    transitionProperty: 'clip-path',
    transitionDuration: holding ? `${HOLD_MS}ms` : '200ms',
    transitionTimingFunction: holding ? 'linear' : 'var(--ease-tactile)',
  }

  return (
    <Modal title={title} onClose={onCancel}>
      <p className="muted-t text-sm">{message}</p>
      {done ? (
        <div role="status" className="mt-4 flex flex-wrap items-center gap-2">
          <p className="text-sm font-bold">
            {str.holdDone} · <span className="muted-t font-normal">{str.undoAutoClose}</span>
          </p>
          {/* Dismiss-only: the destructive act already fired in onConfirm, so
              this closes the dialog — honestly labelled حسنًا, never تراجع. */}
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary transition-ui clickable rounded-xl px-5 py-2"
          >
            {str.ok}
          </button>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <motion.button
            ref={buttonRef}
            type="button"
            disabled={busy}
            aria-busy={holding}
            aria-describedby="confirm-hold-hint"
            {...holdHandlers}
            whileTap={{ scale: 0.97 }}
            transition={TACTILE_SPRING}
            className="transition-ui clickable relative isolate touch-none overflow-hidden rounded-xl border px-5 py-2 font-bold select-none"
            style={{ borderColor: 'var(--secondary)', color: 'var(--secondary)' }}
          >
            <span className="relative">{holding ? str.holding : idleLabel}</span>
            {/* Fill overlay: mode-aware solid via btn-secondary (white text on
                terracotta in light, dark #052E22 text on emerald in dark —
                never white-on-gold per MASTER.md §4/§5). */}
            <span aria-hidden="true" className="btn-secondary absolute inset-0 flex items-center justify-center px-5" style={overlayStyle}>
              {holding ? str.holding : idleLabel}
            </span>
          </motion.button>
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary transition-ui clickable rounded-xl px-5 py-2"
          >
            {str.cancel}
          </button>
        </div>
      )}
      {!done && (
        <p id="confirm-hold-hint" className="muted-t mt-2 text-xs">
          {str.holdHint}
        </p>
      )}
    </Modal>
  )
}
