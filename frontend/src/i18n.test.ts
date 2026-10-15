import { describe, expect, it } from 'vitest'
import { localizeDetail, str } from './i18n'

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
  it('centralizes ticket-17 tactile strings (no component-local Arabic)', () => {
    expect(str.saveIdle).toBe('حفظ')
    expect(str.saveBusy).toMatch(/جارٍ الحفظ/)
    expect(str.saveDone).toMatch(/تم الحفظ/)
    expect(str.holdHint).toMatch(/مطولًا/)
    expect(str.holding).toMatch(/استمر/)
    expect(str.holdDone).toBeTruthy()
    expect(str.undoAutoClose).toBeTruthy()
    expect(str.ok).toBe('حسنًا')
    expect(str.cancel).toBe('إلغاء')
    expect(str.dropHint).toMatch(/اسحب/)
    expect(str.chosenFile).toMatch(/المختار/)
    expect(str.pdfFileLabel).toMatch(/100MB/)
  })
  it('centralizes ticket-18 auth + upload strings', () => {
    expect(str.missingFields).toBeTruthy()
    expect(str.passwordMin).toMatch(/8/)
    expect(str.passwordMismatch).toMatch(/متطابقتين/)
    expect(str.confirmPassword).toBeTruthy()
    expect(str.tokenReadonlyHint).toMatch(/الرابط/)
    expect(str.pwStrength).toBeTruthy()
    expect(str.pwWeak).toBeTruthy()
    expect(str.pwStrong).toBeTruthy()
    expect(str.createLesson).toBe('إنشاء الدرس')
    expect(str.upload).toBe('رفع')
    expect(str.uploadDone).toMatch(/تم الرفع/)
    expect(str.addAndUpload).toBe('إضافة ورفع')
    expect(str.formatPages('٤٥', '٦٢')).toMatch(/صفحات/)
  })
})
