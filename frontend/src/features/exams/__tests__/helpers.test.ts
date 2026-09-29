import { describe, expect, it } from 'vitest'
import { hasAnswerLeak, isScoreVisible, windowLabel, windowStatusFromDates } from '../helpers'

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
})
