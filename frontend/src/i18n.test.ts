import { describe, expect, it } from 'vitest'
import { localizeDetail } from './i18n'

describe('i18n detail mapping', () => {
  it('maps 429 to Arabic', () => {
    expect(localizeDetail('Too many requests')).toMatch(/كثيرة|الطلبات/)
  })
  it('maps 401 to Arabic login prompt', () => {
    expect(localizeDetail('Not authenticated')).toMatch(/سجّل الدخول/)
  })
  it('passes through unknown English detail', () => {
    expect(localizeDetail('Invalid MCQ options')).toBe('Invalid MCQ options')
  })
})
