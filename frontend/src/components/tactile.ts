import { useReducedMotion } from 'motion/react'

// Ticket 17 foundation: the ONE shared tactile spring for every kitchen
// pattern (buttons, reels, drop glow, foil). Agents: import this, do not
// invent a second spring. Resolved-motion users get zero animation via the
// root MotionConfig (reducedMotion="user") + the CSS reduced-motion guard.
export const TACTILE_SPRING = {
  type: 'spring',
  stiffness: 500,
  damping: 32,
} as const

export const TACTILE_EASE = [0.23, 1, 0.32, 1] as const

export { useReducedMotion }

// Pointer-capture guards shared by hold-to-confirm interactions: jsdom has
// no setPointerCapture and older Safari throws. Every capture call goes
// through here so a hold never crashes there — the keyboard path (hold
// Enter/Space) is the testable seam in jsdom.
export function safePointerCapture(
  el: HTMLButtonElement,
  pointerId: number,
  method: 'setPointerCapture' | 'hasPointerCapture' | 'releasePointerCapture',
): boolean {
  try {
    const fn = el[method]
    if (typeof fn !== 'function') return method === 'hasPointerCapture' ? false : true
    const result = fn.call(el, pointerId)
    return typeof result === 'boolean' ? result : true
  } catch {
    return method === 'hasPointerCapture' ? false : true
  }
}
