import { describe, expect, it } from 'vitest'
import {
  blankDraft,
  draftToBody,
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
