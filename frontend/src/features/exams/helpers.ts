import type { ShowResultMode, WindowStatus } from '../../api/types'

// Student payload must never carry answer keys (server enforces; UI double-checks).
export function hasAnswerLeak(payload: unknown): boolean {
  if (payload === null || typeof payload !== 'object') return false
  if (Array.isArray(payload)) return payload.some(hasAnswerLeak)
  const obj = payload as Record<string, unknown>
  if ('correct_index' in obj || 'correct_answer' in obj) return true
  return Object.values(obj).some((v) => typeof v === 'object' && v !== null && hasAnswerLeak(v))
}

export function isScoreVisible(mode: ShowResultMode, isPublished: boolean): boolean {
  if (mode === 'immediate') return true
  return isPublished
}

export function windowLabel(status: WindowStatus): string {
  switch (status) {
    case 'open':
      return 'مفتوح open'
    case 'upcoming':
      return 'لم يبدأ بعد upcoming'
    case 'closed':
      return 'انتهى مغلق closed'
  }
}

// Writer preview has no server window_status — derive display-only status
// from open/close dates (enforcement lives server-side at start/submit).
export function windowStatusFromDates(openAt?: string | null, closeAt?: string | null): WindowStatus {
  const now = Date.now()
  if (openAt && new Date(openAt).getTime() > now) return 'upcoming'
  if (closeAt && new Date(closeAt).getTime() < now) return 'closed'
  return 'open'
}
