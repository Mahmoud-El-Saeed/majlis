import { describe, expect, it } from 'vitest'
import { courseHasBook, matchesArabic, normalizeArabic } from '../helpers'

// Ticket 16: kind is derived from the stored book name — single spelling.
describe('courseHasBook', () => {
  it('is true only for a stored non-empty book name', () => {
    expect(courseHasBook({ book_title: 'Kitab' })).toBe(true)
    expect(courseHasBook({ book_title: null })).toBe(false)
    expect(courseHasBook({ book_title: '' })).toBe(false)
    expect(courseHasBook({})).toBe(false)
  })
})

describe('matchesArabic (client-side search)', () => {
  it('empty or blank needle matches everything', () => {
    expect(matchesArabic('أي نص', '')).toBe(true)
    expect(matchesArabic('أي نص', '   ')).toBe(true)
    expect(matchesArabic(null, '')).toBe(true)
  })
  it('is case-insensitive', () => {
    expect(matchesArabic('Hello World', 'hello')).toBe(true)
    expect(matchesArabic('AB12', 'ab12')).toBe(true)
    expect(matchesArabic('مقدمة الفقه', 'الفقه')).toBe(true)
  })
  it('ignores Arabic diacritics and tatweel', () => {
    expect(normalizeArabic('مُقَدِّمَة')).toBe('مقدمة')
    expect(normalizeArabic('كــتاب')).toBe('كتاب')
    expect(matchesArabic('مُقَدِّمَة في الفقه', 'مقدمة')).toBe(true)
    expect(matchesArabic('مقدمة', 'مُقَدِّمَة')).toBe(true)
    expect(matchesArabic('كــتاب الطهارة', 'كتاب')).toBe(true)
  })
  it('matches substrings and rejects non-matches', () => {
    expect(matchesArabic('شرح كتاب الطهارة', 'الطهارة')).toBe(true)
    expect(matchesArabic('شرح كتاب الطهارة', 'الصيام')).toBe(false)
    expect(matchesArabic(null, 'شيء')).toBe(false)
    expect(matchesArabic('', 'شيء')).toBe(false)
  })
})
