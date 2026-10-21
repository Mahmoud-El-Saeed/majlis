import type {
  AttemptAnswerOut,
  AttemptOut,
  AttemptStatus,
  QuestionType,
  ShowResultMode,
  WindowStatus,
} from '../../api/types'
import { str } from '../../i18n'

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
      return 'مفتوح'
    case 'upcoming':
      return 'لم يبدأ بعد'
    case 'closed':
      return 'انتهى'
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

export type QuestionDraft = {
  type: QuestionType
  prompt: string
  /** One input per option, Google-Forms-style (mcq only). */
  options: string[]
  correctIndex: string
  tfAnswer: 'true' | 'false'
  maxScore: string
}

export const MAX_MCQ_OPTIONS = 10
export const MIN_MCQ_OPTIONS = 2

export const blankDraft = (type: QuestionType = 'mcq'): QuestionDraft => ({
  type,
  prompt: '',
  options: ['', ''],
  correctIndex: '0',
  tfAnswer: 'true',
  maxScore: '5',
})

// Google-Forms-style authoring helpers (pure, unit-tested): the same rules
// the backend enforces, mirrored for instant inline validation.
export function normalizeOptions(input: string): string[] {
  return input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function cleanOptions(options: string[]): string[] {
  return options.map((s) => s.trim()).filter(Boolean)
}

export function validateDraft(d: QuestionDraft): string | null {
  if (!d.prompt.trim()) return 'اكتب نص السؤال أولًا'
  const max = Number(d.maxScore)
  if (!Number.isFinite(max) || max <= 0) return 'الدرجة العظمى يجب أن تكون رقمًا موجبًا'
  if (d.type === 'mcq') {
    const opts = cleanOptions(d.options)
    if (opts.length < MIN_MCQ_OPTIONS) return 'الاختيار من متعدد يحتاج اختيارين على الأقل'
    const ci = Number(d.correctIndex)
    if (!Number.isInteger(ci) || ci < 0 || ci >= opts.length)
      return 'اختر الإجابة الصحيحة من الاختيارات'
  }
  return null
}

export function draftToBody(d: QuestionDraft, position: number): Record<string, unknown> {
  const body: Record<string, unknown> = {
    type: d.type,
    prompt: d.prompt.trim(),
    max_score: Number(d.maxScore),
    position,
  }
  if (d.type === 'mcq') {
    const opts = cleanOptions(d.options)
    body['options'] = opts
    body['correct_index'] = Math.min(Number(d.correctIndex), opts.length - 1)
    body['clear_correct_answer'] = true
  }
  if (d.type === 'tf') {
    body['correct_answer'] = d.tfAnswer === 'true'
    body['clear_options'] = true
    body['clear_correct_index'] = true
  }
  if (d.type === 'essay') {
    body['clear_options'] = true
    body['clear_correct_index'] = true
    body['clear_correct_answer'] = true
  }
  return body
}

// Reorder helper: new position per id after a drag (caller PUTs the changed).
export function positionsForOrder(ids: string[]): Array<{ id: string; position: number }> {
  return ids.map((id, position) => ({ id, position }))
}

const pad2 = (n: number) => String(n).padStart(2, '0')

// ISO → datetime-local input value (local timezone).
export function toLocalInput(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

// ---------------------------------------------------------------------------
// Ticket 20: taking an exam (recovery, autosave, history labels).
// Pure helpers only — no fetching, no clocks beyond the ones passed in.
// ---------------------------------------------------------------------------

// Arabic month names, Latin digits (the app shows Latin numbers everywhere).
const AR_DATE_TIME = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/** Localized Arabic date+time; '' for missing or unparsable input. */
export function formatArabicDateTime(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return AR_DATE_TIME.format(d)
}

/** Arabic label for an attempt's lifecycle state. */
export function attemptStatusLabel(status: AttemptStatus): string {
  return status === 'in_progress' ? str.inProgress : str.submitted
}

/** A resumable attempt: still in progress AND its timer has not run out.
 *
 * The server settles expired attempts on the next read, but a cached list or
 * a page left open past the timer must not offer "continue" for one.
 */
export function canResumeAttempt(
  attempt: Pick<AttemptOut, 'status' | 'expires_at'>,
  now: number = Date.now(),
): boolean {
  if (attempt.status !== 'in_progress') return false
  if (!attempt.expires_at) return true
  return new Date(attempt.expires_at).getTime() > now
}

export type AttemptResultInput = {
  status: AttemptStatus
  score?: number | null
  max_score: number
  answers: Pick<AttemptAnswerOut, 'needs_grading'>[]
}

/**
 * The outcome line of a submitted attempt, or null while it is still live.
 * The score is only set by the server when the exam's publish rules allow
 * showing it, so a missing score means the result is NOT published yet — and
 * that is the reason the student sees, whatever the essay state is. A visible
 * score with a pending essay is the "graded but not finished" case.
 */
export function attemptResultLabel(attempt: AttemptResultInput): string | null {
  if (attempt.status === 'in_progress') return null
  const pendingGrading = attempt.answers.some((a) => a.needs_grading)
  if (attempt.score !== null && attempt.score !== undefined) {
    const score = str.examScore(attempt.score, attempt.max_score)
    return pendingGrading ? `${score} — ${str.awaitingGrading}` : score
  }
  return str.awaitingPublish
}
