import { expect, test, type Page, type Route } from '@playwright/test'

// ---------------------------------------------------------------------------
// Ticket 20 — the exam-taking resume contract.
//
// Mocked on purpose: no backend is needed to prove the contract, and the fake
// lets us assert what the REAL backend must never do (a second attempt).
//
// Every **/api/v1/** request is served by a small stateful fake held in the
// test closure. page.route() handlers stay attached to the page across a
// reload, so the fake — and the attempt it created — survives the mid-exam
// reload exactly the way a real backend would.
//
// The fake mirrors the real contract:
//   * attempts_used / attempts_left / has_in_progress are computed from its
//     own attempt rows (like exam_service._student_progress),
//   * a second start is refused with 400 "An attempt is already in progress."
//     and never creates a second row (attempt_service.start_attempt).
// ---------------------------------------------------------------------------

const EXAM_ID = 'E1'
const COURSE_ID = 'C1'
const QUESTION_ID = 'Q1'
const EXAM_TITLE = 'اختبار الوحدة الأولى'
const EXAM_DESCRIPTION = 'وصف الاختبار'
const QUESTION_PROMPT = 'ما هو الحكم؟'
const OPTIONS = ['أ', 'ب', 'ج', 'د']
const DURATION_MINUTES = 30
const ATTEMPTS_LIMIT = 2
const MAX_SCORE = 4
const ATTEMPT_ID = 'A1'

// The app talks to the API cross-origin (VITE_API_URL defaults to
// http://localhost:8000/api/v1), so the fake answers the CORS preflight and
// marks every response as readable by the page.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
}

type FakeAnswer = {
  question_id: string
  selected_index: number | null
  selected_bool: boolean | null
  text_answer: string | null
  awarded_score: number | null
  is_correct: boolean | null
  needs_grading: boolean
  feedback: string | null
}

type FakeQuestion = {
  id: string
  type: 'mcq'
  prompt: string
  options: string[]
  max_score: number
  position: number
}

type FakeAttempt = {
  id: string
  exam_id: string
  course_id: string
  student_id: string
  status: 'in_progress' | 'submitted'
  started_at: string
  expires_at: string | null
  submitted_at: string | null
  score: number | null
  max_score: number
  is_published: boolean
  is_late: boolean
  questions: FakeQuestion[]
  answers: FakeAnswer[]
}

type Recorded = { method: string; path: string; url: string }

type FakeState = {
  attempts: FakeAttempt[]
  requests: Recorded[]
}

function newState(): FakeState {
  return { attempts: [], requests: [] }
}

function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: { ...CORS_HEADERS },
    body: JSON.stringify(body),
  })
}

function questions(): FakeQuestion[] {
  return [
    {
      id: QUESTION_ID,
      type: 'mcq',
      prompt: QUESTION_PROMPT,
      options: [...OPTIONS],
      max_score: MAX_SCORE,
      position: 0,
    },
  ]
}

function newLiveAttempt(): FakeAttempt {
  const now = Date.now()
  return {
    id: ATTEMPT_ID,
    exam_id: EXAM_ID,
    course_id: COURSE_ID,
    student_id: 'S1',
    status: 'in_progress',
    started_at: new Date(now).toISOString(),
    expires_at: new Date(now + DURATION_MINUTES * 60_000).toISOString(),
    submitted_at: null,
    score: null,
    max_score: MAX_SCORE,
    is_published: false,
    is_late: false,
    questions: questions(),
    answers: [],
  }
}

/** The student-safe single exam read (never the writer-only /exams/{id}). */
function studentExam(state: FakeState) {
  const used = state.attempts.length
  const submitted = state.attempts.filter((a) => a.status === 'submitted')
  const latest = submitted[submitted.length - 1]
  return {
    id: EXAM_ID,
    course_id: COURSE_ID,
    lesson_id: null,
    title: EXAM_TITLE,
    description: EXAM_DESCRIPTION,
    attempts_limit: ATTEMPTS_LIMIT,
    duration_minutes: DURATION_MINUTES,
    open_at: null,
    close_at: null,
    pass_score: 50,
    show_result: 'immediate',
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    attempts_used: used,
    attempts_left: Math.max(ATTEMPTS_LIMIT - used, 0),
    window_status: 'open',
    has_in_progress: state.attempts.some((a) => a.status === 'in_progress'),
    last_score: latest?.score ?? null,
    questions_count: 1,
  }
}

/** Serve the whole /api/v1 surface from the fake state. */
async function installFakeApi(page: Page, state: FakeState): Promise<void> {
  await page.route('**/api/v1/**', async (route: Route) => {
    const request = route.request()
    const method = request.method()
    const path = new URL(request.url()).pathname.replace(/^.*\/api\/v1/, '') || '/'

    // Preflight for the cross-origin JSON requests.
    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: { ...CORS_HEADERS }, body: '' })
      return
    }

    state.requests.push({ method, path, url: request.url() })

    // The AuthProvider asks who the student is.
    if (path === '/auth/me') {
      await json(route, {
        id: 'S1',
        email: 'student@example.com',
        full_name: 'طالب الاختبار',
        role: 'student',
        is_verified: true,
      })
      return
    }

    if (path === `/exams/${EXAM_ID}/student-exam` && method === 'GET') {
      await json(route, studentExam(state))
      return
    }

    // The student's own attempts — the recovery source after a reload.
    if (path === `/exams/${EXAM_ID}/attempts/me` && method === 'GET') {
      await json(route, state.attempts)
      return
    }

    // Start an attempt — one live attempt at a time.
    if (path === `/exams/${EXAM_ID}/attempts` && method === 'POST') {
      if (state.attempts.some((a) => a.status === 'in_progress')) {
        await json(route, { detail: 'An attempt is already in progress.' }, 400)
        return
      }
      const attempt = newLiveAttempt()
      state.attempts.push(attempt)
      await json(route, attempt, 201)
      return
    }

    // The autosave endpoint: the current selection, stored without a verdict.
    const answersPath = path.match(/^\/attempts\/([^/]+)\/answers$/)
    if (answersPath && method === 'POST') {
      const attempt = state.attempts.find((a) => a.id === answersPath[1])
      if (!attempt) {
        await json(route, { detail: 'Attempt not found.' }, 404)
        return
      }
      const body = JSON.parse(request.postData() ?? '{}') as {
        answers?: Array<{
          question_id: string
          selected_index?: number | null
          selected_bool?: boolean | null
          text_answer?: string | null
        }>
      }
      for (const incoming of body.answers ?? []) {
        const row: FakeAnswer = {
          question_id: incoming.question_id,
          selected_index: incoming.selected_index ?? null,
          selected_bool: incoming.selected_bool ?? null,
          text_answer: incoming.text_answer ?? null,
          awarded_score: null,
          is_correct: null,
          needs_grading: false,
          feedback: null,
        }
        const existing = attempt.answers.find((a) => a.question_id === incoming.question_id)
        if (existing) Object.assign(existing, row)
        else attempt.answers.push(row)
      }
      await json(route, attempt)
      return
    }

    // A single attempt read (with the saved answers).
    const attemptPath = path.match(/^\/attempts\/([^/]+)$/)
    if (attemptPath && method === 'GET') {
      const attempt = state.attempts.find((a) => a.id === attemptPath[1])
      if (!attempt) {
        await json(route, { detail: 'Attempt not found.' }, 404)
        return
      }
      await json(route, attempt)
      return
    }

    // Everything else — including the writer-only GET /exams/{id} — is 404.
    await json(route, { detail: 'Not found.' }, 404)
  })
}

test('mocked: reloading mid-exam reopens the same attempt — saved answer, running timer, attempts left unchanged', async ({
  page,
}) => {
  const state = newState()
  await installFakeApi(page, state)

  await page.goto(`/exams/${EXAM_ID}`)

  // The intro card: title, duration, question count, attempts used/limit.
  await expect(page.getByRole('heading', { name: EXAM_TITLE })).toBeVisible()
  await expect(page.getByText(/المدة:\s*30/)).toBeVisible()
  await expect(page.getByText(/الأسئلة:\s*1/)).toBeVisible()
  await expect(page.getByText(/محاولاتك:\s*0\s*\/\s*2/)).toBeVisible()
  await expect(page.getByText('مفتوح')).toBeVisible()

  const start = page.getByRole('button', { name: 'بدء المحاولة' })
  await expect(start).toBeEnabled()
  await start.click()

  // The question is live.
  await expect(page.getByRole('radiogroup', { name: QUESTION_PROMPT })).toBeVisible()

  // Pick the option 'ب' (index 1).
  await page.getByRole('radio', { name: 'ب', exact: true }).click()

  // The autosave is debounced (~600ms) — wait for it to reach the fake.
  await expect
    .poll(
      () =>
        state.requests.filter((r) => r.method === 'POST' && r.path === `/attempts/${ATTEMPT_ID}/answers`)
          .length,
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0)
  expect(state.attempts[0]?.answers[0]?.selected_index).toBe(1)

  // Reload in the middle of the exam.
  await page.reload()

  // The SAME attempt is reopened: the question, the running timer, the answer.
  await expect(page.getByRole('radiogroup', { name: QUESTION_PROMPT })).toBeVisible()
  const timer = page.getByRole('timer')
  await expect(timer).toBeVisible()
  await expect(timer).toHaveAttribute('aria-label', 'الوقت المتبقي')
  await expect(page.getByRole('radio', { name: 'ب', exact: true })).toBeChecked()

  // No second attempt: the intro card (and its start button) is gone.
  await expect(page.getByRole('button', { name: 'بدء المحاولة' })).toHaveCount(0)
  await expect(page.getByText('محاولاتك:')).toHaveCount(0)

  // The fake never created a second attempt, and the reload consumed nothing.
  expect(state.attempts).toHaveLength(1)
  expect(state.attempts[0]?.id).toBe(ATTEMPT_ID)
  // The app asked for exactly one start and never retried it.
  expect(
    state.requests.filter((r) => r.method === 'POST' && r.path === `/exams/${EXAM_ID}/attempts`),
  ).toHaveLength(1)

  // The writer-only read was never requested.
  expect(state.requests.some((r) => r.path === `/exams/${EXAM_ID}`)).toBe(false)

  // Attempts left are unchanged, seen the way the student sees it: the
  // history holds the one live attempt and offers to continue it.
  await page.goto('/exams/E1/mine')
  await expect(page.getByRole('listitem')).toHaveCount(1)
  await expect(page.getByText('قيد الأداء')).toBeVisible()
  await expect(page.getByRole('link', { name: 'متابعة' })).toBeVisible()
  await expect(page.getByText('لا توجد محاولات بعد')).toHaveCount(0)
})

test('mocked: "محاولاتي" lists the attempts with Arabic labels, a resume link and an empty state', async ({
  page,
}) => {
  const state = newState()
  const live: FakeAttempt = {
    ...newLiveAttempt(),
    started_at: '2026-03-15T09:30:00Z',
  }
  const submitted: FakeAttempt = {
    ...newLiveAttempt(),
    id: 'A2',
    status: 'submitted',
    started_at: '2026-03-15T09:30:00Z',
    submitted_at: '2026-03-15T10:05:00Z',
    expires_at: null,
    score: MAX_SCORE,
    is_published: true,
  }
  state.attempts.push(live, submitted)
  await installFakeApi(page, state)

  await page.goto(`/exams/${EXAM_ID}/mine`)

  await expect(page.getByRole('heading', { name: 'محاولاتي' })).toBeVisible()

  const rows = page.getByRole('listitem')
  await expect(rows).toHaveCount(2)

  // The live attempt: 'قيد الأداء' + a resume link back into the exam.
  const liveRow = rows.nth(0)
  await expect(liveRow.getByText('قيد الأداء')).toBeVisible()
  const resume = liveRow.getByRole('link', { name: 'متابعة', exact: true })
  await expect(resume).toHaveAttribute('href', `/exams/${EXAM_ID}`)

  // The submitted attempt: 'تم التسليم' + a localized date (never raw ISO).
  const submittedRow = rows.nth(1)
  await expect(submittedRow.getByText('تم التسليم')).toBeVisible()
  await expect(submittedRow).toHaveText(/\d{1,2}\s+\S+\s+\d{4}/)
  await expect(page.getByText(/T\d{2}:\d{2}:\d{2}Z/)).toHaveCount(0)

  // The empty-state variant: no attempts at all, with a way back.
  state.attempts = []
  await page.reload()
  await expect(page.getByText('لا توجد محاولات بعد')).toBeVisible()
  await expect(page.getByRole('link', { name: 'عودة إلى السلسلة' })).toHaveAttribute(
    'href',
    `/courses/${COURSE_ID}`,
  )
})
