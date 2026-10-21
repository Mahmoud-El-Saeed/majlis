import { expect, test, type Page, type Route } from '@playwright/test'

// ---------------------------------------------------------------------------
// Ticket 21 — Arabic UX: specific error copy and a scoped language choice.
//
// Mocked on purpose: no backend is needed, and the fake lets us assert what
// the REAL backend must never do — answer a deterministic failure with a
// generic "try again" message.
//
// Every **/api/v1/** request is served by a small fake held in the test
// closure, so the English details are exactly the ones the backend raises.
// ---------------------------------------------------------------------------

const EXAM_ID = 'E1'
const EXAM_TITLE = 'اختبار الوحدة الأولى'
const DURATION_MINUTES = 30
const ATTEMPTS_LIMIT = 2

// The app talks to the API cross-origin (VITE_API_URL defaults to
// http://localhost:8000/api/v1), so the fake answers the CORS preflight and
// marks every response as readable by the page.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
}

type FakeOptions = {
  /** The English detail the join endpoint refuses with. */
  joinDetail?: string
  /** The English detail the attempt-start endpoint refuses with. */
  startDetail?: string
  /** The role the fake student/teacher has. */
  role?: 'student' | 'teacher'
}

function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: { ...CORS_HEADERS },
    body: JSON.stringify(body),
  })
}

const COURSE = {
  id: 'C1',
  title: 'سلسلة الفقه',
  description: 'وصف السلسلة',
  book_title: null,
  owner_id: 'T1',
  created_at: '2026-01-01T00:00:00Z',
}

const LESSON = {
  id: 'L1',
  course_id: 'C1',
  title: 'الدرس الأول',
  description: 'وصف الدرس',
  lesson_date: '2026-01-02',
  pages_from: null,
  pages_to: null,
  media_type: 'audio',
  status: 'ready',
  attachment_count: 0,
  created_at: '2026-01-02T00:00:00Z',
  audio_key: 'lessons/L1/audio.m4a',
  transcript_voice: null,
  transcript_book: null,
  can_manage: true,
}

function studentExam() {
  return {
    id: EXAM_ID,
    course_id: 'C1',
    lesson_id: null,
    title: EXAM_TITLE,
    description: 'وصف الاختبار',
    attempts_limit: ATTEMPTS_LIMIT,
    duration_minutes: DURATION_MINUTES,
    open_at: null,
    close_at: null,
    pass_score: 50,
    show_result: 'immediate',
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    attempts_used: 0,
    attempts_left: ATTEMPTS_LIMIT,
    window_status: 'open',
    has_in_progress: false,
    last_score: null,
    questions_count: 1,
  }
}

async function installFakeApi(page: Page, options: FakeOptions = {}): Promise<void> {
  await page.route('**/api/v1/**', async (route: Route) => {
    const request = route.request()
    const method = request.method()
    const path = new URL(request.url()).pathname.replace(/^.*\/api\/v1/, '') || '/'

    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: { ...CORS_HEADERS }, body: '' })
      return
    }

    // The AuthProvider asks who the student is.
    if (path === '/auth/me') {
      await json(route, {
        id: options.role === 'teacher' ? 'T1' : 'S1',
        email: options.role === 'teacher' ? 'teacher@example.com' : 'student@example.com',
        full_name: options.role === 'teacher' ? 'المعلم' : 'طالب الاختبار',
        role: options.role ?? 'student',
        is_verified: true,
      })
      return
    }

    if (path === '/dashboard') {
      await json(route, { items: [] })
      return
    }

    // The course, its lessons and its files — the pages the direction scope
    // has to leave alone.
    if (path === '/courses/C1') {
      await json(route, COURSE)
      return
    }
    if (path === '/courses/C1/lessons') {
      await json(route, [LESSON])
      return
    }
    if (path === '/courses/C1/my-enrollment') {
      await json(route, null)
      return
    }
    if (path === '/courses/C1/student-exams') {
      await json(route, [])
      return
    }
    if (path === '/courses/C1/attachments' || path === '/courses/C1/lessons/L1/attachments') {
      await json(route, [])
      return
    }
    if (path === '/lessons/L1') {
      await json(route, LESSON)
      return
    }

    // The join endpoint refuses with the English detail the backend raises.
    if (path === '/enrollments/join' && method === 'POST') {
      await json(route, { detail: options.joinDetail ?? 'Invalid join code.' }, 400)
      return
    }

    if (path === `/exams/${EXAM_ID}/student-exam` && method === 'GET') {
      await json(route, studentExam())
      return
    }

    if (path === `/exams/${EXAM_ID}/attempts/me` && method === 'GET') {
      await json(route, [])
      return
    }

    // Starting an attempt is refused with the English detail the backend
    // raises (a live attempt, or an exhausted attempts limit).
    if (path === `/exams/${EXAM_ID}/attempts` && method === 'POST') {
      await json(route, { detail: options.startDetail ?? 'An attempt is already in progress.' }, 400)
      return
    }

    await json(route, { detail: 'Not Found' }, 404)
  })
}

/** The Arabic the UI must show for a backend detail that has its own copy. */
const ARABIC: Record<string, string> = {
  'Invalid join code.': 'رمز السلسلة غير صحيح',
  'Join code expired.': 'انتهت صلاحية رمز السلسلة',
  'Join code revoked.': 'رُفض رمز السلسلة — أوقفه الشيخ',
  'Join code has no uses left.': 'استُهلك رمز السلسلة بالكامل — اطلب رمزًا جديدًا من الشيخ',
  'An attempt is already in progress.': 'لديك محاولة قيد الأداء — أكملها قبل بدء محاولة جديدة',
  'Attempts limit reached.': 'نفدت محاولاتك في هذا الاختبار',
}

/** The generic fallback — never shown for a failure that has its own copy. */
const GENERIC_FALLBACK = 'تعذّر إتمام الطلب'

test('mocked: an invalid join code shows its own Arabic, not the generic fallback', async ({
  page,
}) => {
  await installFakeApi(page, { joinDetail: 'Invalid join code.' })

  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'انضم برمز السلسلة' }).click()
  await page.getByLabel('الرمز').fill('WRONG1')
  await page.getByRole('button', { name: 'انضم', exact: true }).click()

  const alert = page.getByRole('alert')
  await expect(alert).toHaveText(ARABIC['Invalid join code.'])
  await expect(alert).not.toHaveText(GENERIC_FALLBACK)
})

test('mocked: an expired join code shows its own Arabic', async ({ page }) => {
  await installFakeApi(page, { joinDetail: 'Join code expired.' })

  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'انضم برمز السلسلة' }).click()
  await page.getByLabel('الرمز').fill('EXPIRED')
  await page.getByRole('button', { name: 'انضم', exact: true }).click()

  const alert = page.getByRole('alert')
  await expect(alert).toHaveText(ARABIC['Join code expired.'])
  await expect(alert).not.toHaveText(GENERIC_FALLBACK)
})

test('mocked: an active-attempt conflict shows its own Arabic', async ({ page }) => {
  await installFakeApi(page, { startDetail: 'An attempt is already in progress.' })

  await page.goto(`/exams/${EXAM_ID}`)
  await page.getByRole('button', { name: 'بدء المحاولة' }).click()

  const alert = page.getByRole('alert')
  await expect(alert).toHaveText(ARABIC['An attempt is already in progress.'])
  await expect(alert).not.toHaveText(GENERIC_FALLBACK)
})

test('mocked: the attempts limit shows its own Arabic', async ({ page }) => {
  await installFakeApi(page, { startDetail: 'Attempts limit reached.' })

  await page.goto(`/exams/${EXAM_ID}`)
  await page.getByRole('button', { name: 'بدء المحاولة' }).click()

  const alert = page.getByRole('alert')
  await expect(alert).toHaveText(ARABIC['Attempts limit reached.'])
  await expect(alert).not.toHaveText(GENERIC_FALLBACK)
})

/** The account page owns the direction; the document keeps Arabic RTL. */
async function expectScopedLanguage(page: Page): Promise<void> {
  await page.goto('/account')
  await expect(page.getByRole('heading', { name: 'حسابي' })).toBeVisible()

  // The account page is RTL in Arabic.
  await expect(page.locator('main')).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')

  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.getByRole('heading', { name: 'My account' })).toBeVisible()

  // The account page flips to LTR...
  await expect(page.locator('main')).toHaveAttribute('dir', 'ltr')
  // ...but the document does not, so no other page can reflow.
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar')

  // The pages the spec names keep their Arabic RTL direction: the
  // dashboard, the course, the lesson, the exam and the teacher pages.
  const pages: Array<[string, string]> = [
    ['/dashboard', 'سلاسلي'],
    ['/courses/C1', 'سلسلة الفقه'],
    ['/lessons/L1', 'الدرس الأول'],
    [`/exams/${EXAM_ID}`, EXAM_TITLE],
    ['/teach', 'لوحة المعلم'],
  ]
  for (const [path, heading] of pages) {
    await page.goto(path)
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible()
  }

  // The choice survives a reload, with no direction flash.
  await page.goto('/account')
  await expect(page.getByRole('heading', { name: 'My account' })).toBeVisible()
  await expect(page.locator('main')).toHaveAttribute('dir', 'ltr')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')

  // Switching back restores RTL everywhere.
  await page.getByRole('button', { name: 'العربية' }).click()
  await expect(page.getByRole('heading', { name: 'حسابي' })).toBeVisible()
  await expect(page.locator('main')).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
}

test('scoped language: English flips the account page only (desktop)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await installFakeApi(page, { role: 'teacher' })
  await expectScopedLanguage(page)
})

test('scoped language: English flips the account page only (390px)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await installFakeApi(page, { role: 'teacher' })
  await expectScopedLanguage(page)
})
