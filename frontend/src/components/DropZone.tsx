import { useEffect, useId, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { str } from '../i18n'
import { TACTILE_SPRING } from './tactile'

// Ticket 17 magnetic drop zone (agent C): upload target that pulls toward an
// incoming drag (proximity → --dz-proximity CSS var, travel via TACTILE_SPRING).
// This component performs NO format/size validation — page-level validators own
// all rejections and stay byte-identical; onFile only forwards the picked file.

// Hint defaults read from i18n.ts `str` at render time (never captured at
// module scope, so a future language switch re-renders them correctly).

const MAGNET_DISTANCE = 180
const MAX_MAGNET_OFFSET = 12

export interface DropZoneProps {
  accept: string
  onFile: (file: File) => void
  disabled?: boolean
  /** Visible Arabic title — always a real <label>, never placeholder-only. */
  label: string
  /** Secondary Arabic hint line under the title. */
  hint?: string
  /** Chosen file name to display; owned by the parent (single source of truth). */
  fileName?: string | null
  id?: string
}

function isFileDrag(dt: DataTransfer | null): boolean {
  return dt ? Array.from(dt.types).includes('Files') : false
}

export function DropZone({
  accept,
  onFile,
  disabled = false,
  label,
  hint = str.dropHint,
  fileName = null,
  id,
}: DropZoneProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const zoneRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const reduceMotion = useReducedMotion()
  const [pull, setPull] = useState({ x: 0, y: 0 })
  const [near, setNear] = useState(false)
  const [over, setOver] = useState(false)

  // Proximity tracking: while a file drag is anywhere on the page, pull the
  // zone toward the pointer and expose proximity (0..1) as --dz-proximity for
  // the gold-glow CSS. Static when reduced-motion is preferred or disabled.
  useEffect(() => {
    if (disabled) return
    function reset() {
      const el = zoneRef.current
      if (el) el.style.setProperty('--dz-proximity', '0')
      setPull({ x: 0, y: 0 })
      setNear(false)
      setOver(false)
    }
    function onWindowDragOver(e: globalThis.DragEvent) {
      const el = zoneRef.current
      if (!el || !isFileDrag(e.dataTransfer)) return
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dxEdge = Math.max(Math.abs(e.clientX - cx) - rect.width / 2, 0)
      const dyEdge = Math.max(Math.abs(e.clientY - cy) - rect.height / 2, 0)
      const distance = Math.hypot(dxEdge, dyEdge)
      const proximity = Math.max(0, 1 - distance / MAGNET_DISTANCE)
      el.style.setProperty('--dz-proximity', proximity.toFixed(3))
      if (proximity === 0) {
        setPull({ x: 0, y: 0 })
        setNear(false)
        setOver(false)
        return
      }
      const pointerOver =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      const dx = e.clientX - cx
      const dy = e.clientY - cy
      const len = Math.max(Math.hypot(dx, dy), 1)
      const offset = pointerOver ? 0 : proximity * MAX_MAGNET_OFFSET
      // Reduced-motion users (and the root MotionConfig reducedMotion="user")
      // get zero travel; the gold state change still applies instantly.
      setPull(reduceMotion ? { x: 0, y: 0 } : { x: (dx / len) * offset, y: (dy / len) * offset })
      setNear(true)
      setOver(pointerOver)
    }
    window.addEventListener('dragover', onWindowDragOver)
    window.addEventListener('dragend', reset)
    window.addEventListener('drop', reset)
    return () => {
      window.removeEventListener('dragover', onWindowDragOver)
      window.removeEventListener('dragend', reset)
      window.removeEventListener('drop', reset)
    }
  }, [disabled, reduceMotion])

  const openPicker = () => {
    if (!disabled) inputRef.current?.click()
  }

  const handleZoneDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (disabled || !isFileDrag(e.dataTransfer)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleZoneDrop = (e: DragEvent<HTMLDivElement>) => {
    if (disabled) return
    e.preventDefault()
    e.stopPropagation()
    const f = e.dataTransfer.files?.[0]
    if (f) onFile(f)
    const el = zoneRef.current
    if (el) el.style.setProperty('--dz-proximity', '0')
    setPull({ x: 0, y: 0 })
    setNear(false)
    setOver(false)
  }

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) onFile(f)
    // Reset so picking the same file twice still fires onChange.
    e.target.value = ''
  }

  return (
    <motion.div
      ref={zoneRef}
      className="dropzone"
      data-near={near}
      data-over={over}
      data-disabled={disabled}
      animate={reduceMotion ? { x: 0, y: 0 } : { x: pull.x, y: pull.y }}
      transition={TACTILE_SPRING}
      onDragOver={handleZoneDragOver}
      onDrop={handleZoneDrop}
      onClick={openPicker}
    >
      {/* Real label (click opens the picker natively); stopPropagation avoids a
          double open via the zone onClick fallback. */}
      <label htmlFor={inputId} className="dropzone-label" onClick={(e) => e.stopPropagation()}>
        <span className="dropzone-title">{label}</span>
        <span className="dropzone-hint">{hint}</span>
      </label>
      {/* Visually hidden but focusable: the keyboard/click file-picker fallback.
          Enter/Space on the focused input opens the native picker. */}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={handleInputChange}
        className="dropzone-input"
        aria-label={label}
      />
      {fileName && (
        <p className="dropzone-chosen">
          {str.chosenFile} <span dir="auto">{fileName}</span>
        </p>
      )}
    </motion.div>
  )
}
