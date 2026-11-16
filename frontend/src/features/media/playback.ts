// Per-lesson playback position (ticket 24). A long lesson must survive
// reloads: the last position lives in localStorage under a lesson-scoped key
// and is clamped to the real duration before it is ever applied to the
// element. Volume keeps its own shared key (mj_vol) — position is per lesson.
const PREFIX = 'mj_pos_'

export const SKIP_SECONDS = 10
export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 1.75, 2] as const

export function positionKey(lessonId: string): string {
  return `${PREFIX}${lessonId}`
}

/** Stored position for a lesson; null when absent, unreadable, or invalid. */
export function readPosition(lessonId: string): number | null {
  try {
    const raw = localStorage.getItem(positionKey(lessonId))
    if (raw === null) return null
    const v = Number(raw)
    return Number.isFinite(v) && v >= 0 ? v : null
  } catch {
    return null
  }
}

/** Persist the last position for a lesson; storage failures are ignored. */
export function writePosition(lessonId: string, seconds: number): void {
  try {
    if (!Number.isFinite(seconds) || seconds < 0) return
    localStorage.setItem(positionKey(lessonId), String(seconds))
  } catch {
    /* private mode / quota — resume simply does not persist */
  }
}

/**
 * Clamp a position to the playable range. Invalid positions become 0;
 * a finite duration caps the result; without a known duration the position
 * passes through unchanged (metadata has not landed yet).
 */
export function clampPosition(seconds: number, duration: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0
  return Number.isFinite(duration) && duration > 0 ? Math.min(seconds, duration) : seconds
}
