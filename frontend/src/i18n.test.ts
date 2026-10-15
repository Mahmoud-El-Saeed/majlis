import { describe, expect, it } from 'vitest'
import { localizeDetail } from './i18n'

describe('i18n detail mapping', () => {
  it('maps 429 to Arabic', () => {
    expect(localizeDetail('Too many requests')).toMatch(/كثيرة|الطلبات/)
  })
  it('maps 401 to Arabic login prompt', () => {
    expect(localizeDetail('Not authenticated')).toMatch(/سجّل الدخول/)
  })
  it('falls back to a generic Arabic message (never raw English)', () => {
    expect(localizeDetail('Invalid MCQ options')).toBe('تعذّر — حاول مجددًا')
  })
  it('maps login failures to actionable Arabic', () => {
    expect(localizeDetail('Incorrect email or password.')).toMatch(/غير صحيحة/)
    expect(localizeDetail('Please verify your email before logging in.')).toMatch(/غير مفعّل/)
    expect(localizeDetail('Account disabled.')).toMatch(/موقوف/)
    expect(localizeDetail('Email already registered.')).toMatch(/مسجل بالفعل/)
  })
  it('maps ticket-16 backend messages to Arabic', () => {
    expect(localizeDetail('A book-based course keeps its book.')).toMatch(/ثابت/)
    expect(localizeDetail('Pages range is only allowed on book-based courses.')).toMatch(/الصفحات/)
    expect(localizeDetail('Only PDF, PNG, JPEG, and WEBP attachments are supported.')).toMatch(
      /صيغة/,
    )
    expect(localizeDetail('File is too large (max 100MB). Please compress it and retry.')).toMatch(
      /100MB/,
    )
    expect(localizeDetail('Only book-based courses have a main book.')).toMatch(/الأساسي/)
  })
})
