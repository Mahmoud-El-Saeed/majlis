import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { localizeDetail, localizeExamError, str, type CatalogEntry } from './i18n'
import details from './i18n/details.json'

const catalog = details.entries as CatalogEntry[]

describe('i18n detail mapping', () => {
  it('maps 429 to Arabic', () => {
    expect(localizeDetail('Too many requests. Try again in a minute.')).toMatch(/كثيرة|الطلبات/)
  })
  it('maps 401 to Arabic login prompt', () => {
    expect(localizeDetail('Not authenticated')).toMatch(/سجّل الدخول/)
  })
  it('falls back to a neutral Arabic message (never raw English)', () => {
    expect(localizeDetail('Invalid MCQ options')).toBe(str.unexpectedError)
  })
  it('never tells the user to retry a failure that retrying cannot fix', () => {
    expect(str.unexpectedError).not.toMatch(/حاول مجددًا|أعد المحاولة/)
    expect(localizeDetail('Invalid MCQ options')).not.toMatch(/حاول مجددًا|أعد المحاولة/)
    // A failure that IS worth retrying still says so.
    expect(localizeDetail('Upload not found. Retry with a fresh upload URL.')).toMatch(/رابط رفع جديد/)
    expect(localizeDetail('Too many requests. Try again in a minute.')).toMatch(/أعد المحاولة/)
  })
  it('maps login failures to actionable Arabic', () => {
    expect(localizeDetail('Incorrect email or password.')).toMatch(/غير صحيحة/)
    expect(localizeDetail('Please verify your email before logging in.')).toMatch(/لم تُفعّل/)
    expect(localizeDetail('Account disabled.')).toMatch(/موقوف/)
    expect(localizeDetail('Email already registered.')).toMatch(/مسجّل بالفعل/)
  })
  it('maps ticket-16 backend messages to Arabic', () => {
    expect(localizeDetail('A book-based course keeps its book.')).toMatch(/تحتفظ/)
    expect(localizeDetail('Pages range is only allowed on book-based courses.')).toMatch(/الصفحات/)
    expect(localizeDetail('Only PDF, PNG, JPEG, and WEBP attachments are supported.')).toMatch(
      /PDF/,
    )
    expect(localizeDetail('File is too large (max 100MB). Please compress it and retry.')).toMatch(
      /حجم الملف/,
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
  it('centralizes ticket-20 exam-taking strings (Arabic only)', () => {
    expect(str.resumeExam).toBe('متابعة الاختبار')
    expect(str.enterExam).toBe('دخول الاختبار')
    expect(str.myAttempts).toBe('محاولاتي')
    expect(str.inProgress).toBe('قيد الأداء')
    expect(str.submitted).toBe('تم التسليم')
    expect(str.awaitingGrading).toBe('بانتظار التصحيح')
    expect(str.awaitingPublish).toBe('بانتظار النشر')
    expect(str.noAttempts).toBe('لا توجد محاولات بعد')
    expect(str.backToCourse).toBe('عودة إلى السلسلة')
    expect(str.examNotFound).toBe('الاختبار غير موجود')
    expect(str.examNoDescription).toBe('لا يوجد وصف لهذا الاختبار')
    expect(str.loadingExam).toBe('جار تحميل الاختبار')
    expect(str.resume).toBe('متابعة')
    expect(str.attemptsExhausted).toBe('نفدت محاولاتك')
    expect(str.startAttempt).toBe('بدء المحاولة')
    expect(str.examLoadFailed).toBe('تعذّر تحميل الاختبار')
    expect(str.examNotOpenYet).toBeTruthy()
    expect(str.examWindowClosed).toBeTruthy()
    expect(str.examStartFailed).toBeTruthy()
    expect(str.examSubmitFailed).toBeTruthy()
    expect(str.examAutosaveFailed).toMatch(/الحفظ التلقائي/)
    expect(str.examScore(8, 10)).toBe('الدرجة 8 / 10')
  })
  it('maps the ticket-20 "already in progress" refusal to Arabic', () => {
    expect(localizeDetail('An attempt is already in progress.')).toMatch(/قيد الأداء/)
  })
  it('tells a writer apart from a non-member without reading the role', () => {
    expect(localizeExamError('Only enrolled students may take exams.')).toMatch(/لطلاب/)
    expect(localizeExamError('Not enrolled in this course.')).toMatch(/لست مقيدًا/)
    expect(localizeExamError('Not authorized.')).toMatch(/لست مقيدًا/)
    expect(localizeExamError('Account disabled.')).toMatch(/موقوف/)
  })
})

describe('ticket 21 — the error-detail catalog', () => {
  it('maps every catalog entry to a specific Arabic message', () => {
    for (const entry of catalog) {
      if (entry.ar === null) {
        // A pass-through is a decision, and it must carry its reason.
        expect(entry.note, `catalog entry ${entry.id} passes through with no reason`).toBeTruthy()
        continue
      }
      expect(entry.ar.trim(), `catalog entry ${entry.id} has empty Arabic`).not.toBe('')
      expect(entry.ar, `catalog entry ${entry.id} is not Arabic`).toMatch(/[؀-ۿ]/)
    }
  })

  it('resolves every catalog entry to its own message (no entry is shadowed)', () => {
    for (const entry of catalog) {
      const sample = entry.sample ?? entry.detail
      expect(sample, `catalog entry ${entry.id} has no sample`).toBeTruthy()
      expect(localizeDetail(sample as string), `catalog entry ${entry.id} did not resolve`).toBe(
        entry.ar ?? sample,
      )
    }
  })

  it('gives the join-code failures their own copy', () => {
    expect(localizeDetail('Invalid join code.')).toBe('رمز السلسلة غير صحيح')
    expect(localizeDetail('Join code expired.')).toBe('انتهت صلاحية رمز السلسلة')
    expect(localizeDetail('Join code revoked.')).toMatch(/أُلغي/)
    expect(localizeDetail('Join code has no uses left.')).toMatch(/استُهلك/)
    expect(localizeDetail('Too many active codes for this course (max 5). Revoke an old code first.'))
      .toMatch(/الحد الأقصى/)
  })

  it('gives the invite failures their own copy', () => {
    expect(localizeDetail('Invalid invite link.')).toMatch(/غير صالح/)
    expect(localizeDetail('Invite link expired.')).toMatch(/انتهت صلاحية/)
    expect(localizeDetail('Invite link already used.')).toMatch(/استُخدم/)
    expect(localizeDetail('Invite link revoked.')).toMatch(/أُلغي/)
  })

  it('gives the attempt failures their own copy', () => {
    expect(localizeDetail('Attempts limit reached.')).toMatch(/نفدت محاولاتك/)
    expect(localizeDetail('An attempt is already in progress.')).toMatch(/قيد الأداء/)
    expect(localizeDetail('Attempt already submitted.')).toMatch(/تم تسليم/)
  })

  it('gives the exam-window failures their own copy', () => {
    expect(localizeDetail('Exam window is closed.')).toMatch(/انتهى وقت الاختبار/)
    expect(localizeDetail('Exam has not opened yet.')).toMatch(/لم يبدأ الاختبار/)
  })

  it('gives blank and duplicate input their own copy', () => {
    expect(localizeDetail('Email already registered.')).toMatch(/مسجّل بالفعل/)
    expect(localizeDetail('String should have at least 1 character')).toMatch(/فارغًا/)
    expect(localizeDetail('String should have at least 8 characters')).toMatch(/أقصر من الحد/)
    expect(localizeDetail('Value error, Name must not be blank.')).toMatch(/الاسم/)
  })

  it('gives every 422 validation message its own copy', () => {
    expect(localizeDetail('Field required')).toMatch(/مطلوب/)
    expect(localizeDetail('String should have at most 200 characters')).toMatch(/أطول/)
    expect(localizeDetail('Input should be greater than or equal to 0')).toMatch(/أقل/)
    expect(localizeDetail('Input should be less than or equal to 1000')).toMatch(/أكبر/)
    expect(localizeDetail('Input should be greater than 0')).toMatch(/أكبر من صفر/)
    expect(localizeDetail('Input should be a valid UUID, invalid character')).toMatch(/غير صالحة/)
    expect(localizeDetail('Input should be a valid integer, unable to parse string as an integer')).toMatch(/غير صالحة/)
    expect(localizeDetail("Input should be 'mcq', 'tf' or 'essay'")).toMatch(/غير مدعومة/)
    expect(localizeDetail("Input should be 'audio'")).toMatch(/التسجيل الصوتي/)
    expect(localizeDetail('value is not a valid email address')).toMatch(/البريد/)
  })

  it('names a real entry at every detailById call site', () => {
    // detailById falls back to the generic message on an unknown id, which is
    // safe at runtime but silently loses the specific copy. Pin the ids the
    // source asks for, so a rename cannot degrade a call site unnoticed.
    const ids = new Set(catalog.map((entry) => entry.id))
    const root = join(process.cwd(), 'src')
    const files: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue
        const path = join(dir, entry.name)
        if (entry.isDirectory()) walk(path)
        else if (path.endsWith('.ts') || path.endsWith('.tsx')) files.push(path)
      }
    }
    walk(root)

    const used: Array<[string, string]> = []
    for (const file of files) {
      for (const match of readFileSync(file, 'utf8').matchAll(/detailById\(\s*'([^']+)'\s*\)/g)) {
        used.push([file, match[1]])
      }
    }
    expect(used.length).toBeGreaterThan(0)
    for (const [file, id] of used) {
      expect(ids.has(id), `${file} uses unknown catalog id ${id}`).toBe(true)
    }
  })

  it('translates every validation message of a 422 (one per field)', () => {
    const detail = 'String should have at least 8 characters\nvalue is not a valid email address'
    const arabic = localizeDetail(detail)
    expect(arabic).toMatch(/أقصر من الحد/)
    expect(arabic).toMatch(/البريد/)
    expect(arabic).not.toMatch(/String should have/)
  })
})
