import { describe, expect, it } from 'vitest'
import {
  attemptResultLabel,
  attemptStatusLabel,
  blankDraft,
  canResumeAttempt,
  draftToBody,
  formatArabicDateTime,
  hasAnswerLeak,
  isScoreVisible,
  normalizeOptions,
  positionsForOrder,
  toLocalInput,
  validateDraft,
  windowLabel,
  windowStatusFromDates,
} from '../helpers'

// Seam: exam discovery — no correct_* leak, attempts-left, publish gate,
// window status display (enforcement lives server-side).

describe('exam helpers', () => {
  it('detects correct_* leak in student payload', () => {
    expect(hasAnswerLeak({ id: 'x', title: 't' })).toBe(false)
    expect(hasAnswerLeak({ correct_index: 1 })).toBe(true)
    expect(hasAnswerLeak({ correct_answer: 'a' })).toBe(true)
    expect(hasAnswerLeak({ questions: [{ correct_index: 0 }] })).toBe(true)
  })

  it('score visible only per publish setting', () => {
    expect(isScoreVisible('immediate', true)).toBe(true)
    expect(isScoreVisible('immediate', false)).toBe(true)
    expect(isScoreVisible('after_publish', true)).toBe(true)
    expect(isScoreVisible('after_publish', false)).toBe(false)
  })

  it('window labels are Arabic', () => {
    expect(windowLabel('open')).toMatch(/مفتوح/)
    expect(windowLabel('upcoming')).toMatch(/قريب|لم يبدأ/)
    expect(windowLabel('closed')).toMatch(/مغلق|انتهى/)
  })

  it('derives writer-preview window status from dates', () => {
    expect(windowStatusFromDates(new Date(Date.now() + 3600_000).toISOString(), null)).toBe('upcoming')
    expect(windowStatusFromDates(null, new Date(Date.now() - 1000).toISOString())).toBe('closed')
    expect(windowStatusFromDates(null, null)).toBe('open')
  })

  it('window labels are Arabic-only', () => {
    expect(windowLabel('open')).toBe('مفتوح')
    expect(windowLabel('upcoming')).toBe('لم يبدأ بعد')
    expect(windowLabel('closed')).toBe('انتهى')
  })
})

describe('authoring helpers (Google-Forms-style)', () => {
  it('normalizes comma options', () => {
    expect(normalizeOptions('أ ,ب,, ج , د')).toEqual(['أ', 'ب', 'ج', 'د'])
    expect(normalizeOptions('')).toEqual([])
  })

  it('validates drafts like the backend', () => {
    expect(validateDraft({ ...blankDraft(), prompt: '' })).toMatch(/نص السؤال/)
    expect(validateDraft({ ...blankDraft(), prompt: 'س؟', options: ['أ'] })).toMatch(/اختيارين/)
    expect(validateDraft({ ...blankDraft(), prompt: 'س؟', options: ['أ', 'ب'], correctIndex: '5' })).toMatch(
      /الإجابة الصحيحة/,
    )
    expect(
      validateDraft({ ...blankDraft(), prompt: 'س؟', options: ['أ', 'ب', 'ج'], correctIndex: '2' }),
    ).toBeNull()
    expect(
      validateDraft({
        ...blankDraft(),
        prompt: 'س؟',
        options: ['أ', 'ب', 'ج', 'د', 'هـ'],
        correctIndex: '4',
      }),
    ).toBeNull()
    expect(validateDraft({ ...blankDraft('essay'), prompt: 'اشرح' })).toBeNull()
    expect(validateDraft({ ...blankDraft('tf'), prompt: 'صح؟' })).toBeNull()
  })

  it('builds create/update bodies with type-change clears', () => {
    const mcq = draftToBody({ ...blankDraft(), prompt: 'س؟', options: ['أ', 'ب', 'ج'], correctIndex: '2' }, 3)
    expect(mcq).toMatchObject({
      type: 'mcq',
      prompt: 'س؟',
      options: ['أ', 'ب', 'ج'],
      correct_index: 2,
      position: 3,
    })
    const tf = draftToBody({ ...blankDraft('tf'), prompt: 'ص؟' }, 0)
    expect(tf['correct_answer']).toBe(true)
    expect(tf['clear_options']).toBe(true)
    const essay = draftToBody({ ...blankDraft('essay'), prompt: 'ا؟' }, 1)
    expect(essay['clear_correct_index']).toBe(true)
  })

  it('computes positions for a new order', () => {
    expect(positionsForOrder(['c', 'a', 'b'])).toEqual([
      { id: 'c', position: 0 },
      { id: 'a', position: 1 },
      { id: 'b', position: 2 },
    ])
  })

  it('converts ISO to datetime-local input', () => {
    expect(toLocalInput(null)).toBe('')
    expect(toLocalInput('bad')).toBe('')
    expect(toLocalInput('2026-10-01T12:30:00Z')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })
})

// Seam: taking an exam (ticket 20) — Arabic labels, localized dates,
// resume rules and the "a second attempt exists" signal.
describe('attempt helpers (ticket 20)', () => {
  it('formats dates in Arabic with Latin digits', () => {
    const out = formatArabicDateTime('2026-10-20T12:00:00Z')
    expect(out).toContain('أكتوبر')
    expect(out).toMatch(/2026/)
    // Latin digits, never Arabic-Indic ones.
    expect(out).not.toMatch(/[٠-٩]/)
  })

  it('returns an empty string for missing or broken dates', () => {
    expect(formatArabicDateTime(null)).toBe('')
    expect(formatArabicDateTime(undefined)).toBe('')
    expect(formatArabicDateTime('not-a-date')).toBe('')
  })

  it('labels attempt statuses in Arabic', () => {
    expect(attemptStatusLabel('in_progress')).toBe('قيد الأداء')
    expect(attemptStatusLabel('submitted')).toBe('تم التسليم')
  })

  it('resumes only live, unexpired attempts', () => {
    expect(canResumeAttempt({ status: 'in_progress', expires_at: null })).toBe(true)
    expect(canResumeAttempt({ status: 'submitted', expires_at: null })).toBe(false)

    const soon = new Date(Date.now() + 60_000).toISOString()
    const past = new Date(Date.now() - 60_000).toISOString()
    expect(canResumeAttempt({ status: 'in_progress', expires_at: soon })).toBe(true)
    // A stale page/cache must not offer "continue" past the timer.
    expect(canResumeAttempt({ status: 'in_progress', expires_at: past })).toBe(false)
  })

  it('has no result line while the attempt is live', () => {
    expect(
      attemptResultLabel({ status: 'in_progress', score: null, max_score: 10, answers: [] }),
    ).toBeNull()
  })

  it('shows the score once it is visible', () => {
    expect(
      attemptResultLabel({ status: 'submitted', score: 8, max_score: 10, answers: [] }),
    ).toBe('الدرجة 8 / 10')
  })

  it('marks an ungraded answer as awaiting grading', () => {
    expect(
      attemptResultLabel({
        status: 'submitted',
        score: 5,
        max_score: 10,
        answers: [{ needs_grading: true }],
      }),
    ).toBe('الدرجة 5 / 10 — بانتظار التصحيح')
  })

  it('falls back to awaiting publication when the result is hidden', () => {
    expect(
      attemptResultLabel({ status: 'submitted', score: null, max_score: 10, answers: [] }),
    ).toBe('بانتظار النشر')
  })

  it('keeps an unpublished result unpublished even with a pending essay', () => {
    // The server hides the score until the teacher publishes; that is the
    // reason the student sees, whatever the essay state is.
    expect(
      attemptResultLabel({
        status: 'submitted',
        score: null,
        max_score: 10,
        answers: [{ needs_grading: true }],
      }),
    ).toBe('بانتظار النشر')
  })
})
