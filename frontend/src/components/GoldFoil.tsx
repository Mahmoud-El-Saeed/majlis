import { useCallback, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react'
import { TACTILE_SPRING } from './tactile'

// Ticket 17 gold foil (agent E): gold-ONLY sheen for exactly one surface (the
// main-book badge). Restrained by design — a faint gold wash + soft specular
// glow tracking the pointer. The sheen layer is decorative (aria-hidden,
// pointer-events none, painted behind the text) so semantics, layout, and
// text contrast are untouched. Under reduced-motion the wrapper is a plain
// static surface with the sheen hidden by CSS.
export function GoldFoil({ children, className }: { children: ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion()
  const px = useMotionValue(50)
  const py = useMotionValue(50)
  const sx = useSpring(px, TACTILE_SPRING)
  const sy = useSpring(py, TACTILE_SPRING)
  // Scroll drift: the sheen breathes ±6% with page scroll (restrained —
  // the badge is small, so this is felt, not seen). Hooks stay above the
  // reduced-motion early return; the static branch never reads these.
  const { scrollY } = useScroll()
  const scrollDrift = useTransform(scrollY, [0, 800], [6, -6])
  const scrollSpring = useSpring(scrollDrift, TACTILE_SPRING)
  const foilX = useMotionTemplate`${sx}%`
  const foilY = useMotionTemplate`${sy}%`
  const foilScroll = useMotionTemplate`${scrollSpring}%`

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLSpanElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      if (rect.width > 0) {
        const x = ((e.clientX - rect.left) / rect.width) * 100
        px.set(Math.min(100, Math.max(0, x)))
      }
      if (rect.height > 0) {
        const y = ((e.clientY - rect.top) / rect.height) * 100
        py.set(Math.min(100, Math.max(0, y)))
      }
    },
    [px, py],
  )

  const handlePointerLeave = useCallback(() => {
    px.set(50)
    py.set(50)
  }, [px, py])

  const cls = `gold-foil${className ? ` ${className}` : ''}`

  if (reduceMotion) {
    return (
      <span className={`${cls} gold-foil--static`}>
        {children}
        <span aria-hidden="true" className="gold-foil-sheen" />
      </span>
    )
  }

  const style = { '--foil-x': foilX, '--foil-y': foilY, '--foil-scroll': foilScroll } as CSSProperties

  return (
    <motion.span
      className={cls}
      style={style}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {children}
      <span aria-hidden="true" className="gold-foil-sheen" />
    </motion.span>
  )
}
