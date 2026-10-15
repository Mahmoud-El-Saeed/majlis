import { AnimatePresence, motion } from 'motion/react'
import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { str } from '../i18n'
import { TACTILE_EASE, TACTILE_SPRING, useReducedMotion } from './tactile'

export type DynamicButtonState = 'idle' | 'busy' | 'done'
export type DynamicButtonVariant = 'primary' | 'secondary'

// Default labels read from i18n.ts `str` at render time via default
// parameters (evaluated per render, never captured at module scope).

interface DynamicButtonProps {
  state: DynamicButtonState
  idleLabel?: string
  busyLabel?: string
  doneLabel?: string
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  variant?: DynamicButtonVariant
  /** 'content' animates width to fit each label; 'full' spans the container. */
  width?: 'content' | 'full'
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  className?: string
}

function SpinnerIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4 animate-spin">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
      <path d="M14.5 8a6.5 6.5 0 0 0-6.5-6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
      <path
        d="M3 8.5 6.5 12 13 4.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Width animation bounces on the one shared tactile spring; the label
// crossfade uses the matching tactile ease. Reduced-motion users get an
// instant swap (MotionConfig reducedMotion="user" + the CSS guard).
export function DynamicButton({
  state,
  idleLabel = str.saveIdle,
  busyLabel = str.saveBusy,
  doneLabel = str.saveDone,
  onClick,
  variant = 'primary',
  width = 'content',
  type = 'button',
  disabled = false,
  className,
}: DynamicButtonProps) {
  // One state→view map (not cascades): label + icon per state, keyed once.
  const stateView: Record<DynamicButtonState, { label: string; icon: ReactNode }> = {
    idle: { label: idleLabel, icon: null },
    busy: { label: busyLabel, icon: <SpinnerIcon /> },
    done: { label: doneLabel, icon: <CheckIcon /> },
  }
  const { label, icon: stateIcon } = stateView[state]
  const reduceMotion = useReducedMotion()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const measureRef = useRef<HTMLSpanElement>(null)
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null)

  const measureContent = width === 'content'

  // Hidden measurer mirrors the visible label+icon so the button animates
  // to exactly the next label's width — the button node itself never
  // remounts, so surrounding layout never shifts.
  useLayoutEffect(() => {
    const button = buttonRef.current
    const measure = measureRef.current
    if (!measureContent || !button || !measure) {
      setMeasuredWidth(null)
      return
    }
    const sync = () => {
      const styles = window.getComputedStyle(button)
      const chrome =
        Number.parseFloat(styles.paddingLeft) +
        Number.parseFloat(styles.paddingRight) +
        Number.parseFloat(styles.borderLeftWidth) +
        Number.parseFloat(styles.borderRightWidth)
      const next = Math.ceil(measure.scrollWidth + chrome)
      if (!Number.isFinite(next)) return
      setMeasuredWidth((cur) => (cur === next ? cur : next))
    }
    sync()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(sync)
    observer.observe(measure)
    window.addEventListener('resize', sync)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', sync)
    }
  }, [measureContent, label, variant])

  const widthTransition = reduceMotion ? { duration: 0 } : { ...TACTILE_SPRING }
  const contentTransition = {
    duration: reduceMotion ? 0 : 0.2,
    ease: [...TACTILE_EASE] as [number, number, number, number],
  }

  return (
    <motion.button
      ref={buttonRef}
      type={type}
      onClick={onClick}
      disabled={disabled || state === 'busy'}
      aria-busy={state === 'busy'}
      initial={false}
      animate={measureContent ? { width: measuredWidth ?? 'auto' } : undefined}
      transition={measureContent ? widthTransition : undefined}
      className={[
        variant === 'primary' ? 'btn-primary' : 'btn-secondary',
        'relative inline-flex cursor-pointer items-center justify-center gap-1.5 overflow-hidden rounded-xl px-4 py-1.5 font-bold whitespace-nowrap',
        width === 'full' ? 'w-full' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span aria-live="polite" className="relative inline-grid overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={label}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={contentTransition}
            className="col-start-1 row-start-1 flex items-center gap-1.5"
          >
            {stateIcon}
            {label}
          </motion.span>
        </AnimatePresence>
      </span>
      {measureContent && (
        <span
          aria-hidden="true"
          ref={measureRef}
          className="pointer-events-none absolute inline-flex items-center gap-1.5 opacity-0"
        >
          {stateIcon}
          <span>{label}</span>
        </span>
      )}
    </motion.button>
  )
}
