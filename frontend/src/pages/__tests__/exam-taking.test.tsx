import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ExamTakePage } from '../ExamTake'
import { MyAttemptsPage } from '../MyAttempts'

// Ticket 20 — the exam-taking flow. The backend answers with English
// details; the UI must read as Arabic and must never create a second
// attempt for the same exam.

type Call = { method: string; path: string; body: unknown }

const EXAM = {
  id: 'E1',
  course_id: 'C1',
  lesson_id: null,
  title: 'اختبار الوحدة الأولى',
  description: 'وصف الاختبار',
  attempts_limit: 2,
  duration_minutes: 30,
  open_at: null,
  close_at: null,
  pass_score: 50,
  show_result: 'immediate',
  created_by: 'T1',
  created_at: '2026-09-01T00:00:00Z',
  attempts_used: 1,
  attempts_left: 1,
  window_status: 'open',
  has_in_progress: false,
  last_score: null,
  questions_count: 3,
}

const QUESTIONS = [
  { id: 'Q1', type: 'mcq', prompt: 'ما هو الحكم؟', options: ['أ', 'ب'], max_score: 5, position: 0 },
  { id: 'Q2', type: 'tf', prompt: 'صح أم خطأ؟', options: null, max_score: 5, position: 1 },
  { id: 'Q3', type: 'essay', prompt: 'اشرح باختصار', options: null, max_score: 5, position: 2 },
]

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000).toISOString()
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString()

const LIVE_ATTEMPT = {
  id: 'A1',
  exam_id: 'E1',
  course_id: 'C1',
  student_id: 'S1',
  status: 'in_progress',
  started_at: daysAgo(2),
  expires_at: hoursFromNow(1.5),
  submitted_at: null,
  score: null,
  max_score: 15,
  is_published: false,
  is_late: false,
  questions: QUESTIONS,
  answers: [
    {
      question_id: 'Q1',
      selected_index: 1,
      selected_bool: null,
      text_answer: null,
      awarded_score: null,
      is_correct: null,
      needs_grading: false,
      feedback: null,
    },
    {
      question_id: 'Q2',
      selected_index: null,
      selected_bool: true,
      text_answer: null,
      awarded_score: null,
      is_correct: null,
      needs_grading: false,
      feedback: null,
    },
    {
      question_id: 'Q3',
      selected_index: null,
      selected_bool: null,
      text_answer: 'إجابتي المحفوظة',
      awarded_score: null,
      is_correct: null,
      needs_grading: false,
      feedback: null,
    },
  ],
}

const SUBMITTED_SCORED = {
  ...LIVE_ATTEMPT,
  id: 'A2',
  status: 'submitted',
  started_at: daysAgo(9),
  expires_at: null,
  submitted_at: daysAgo(8),
  score: 8,
  is_published: true,
}

const SUBMITTED_UNPUBLISHED = {
  ...LIVE_ATTEMPT,
  id: 'A3',
  status: 'submitted',
  started_at: daysAgo(20),
  expires_at: null,
  submitted_at: daysAgo(19),
  score: null,
  is_published: false,
}

const SUBMITTED_UNPUBLISHED_PENDING = {
  ...SUBMITTED_UNPUBLISHED,
  id: 'A5',
  started_at: daysAgo(40),
  submitted_at: daysAgo(39),
  answers: LIVE_ATTEMPT.answers.map((a) => ({ ...a, needs_grading: true })),
}

const SUBMITTED_UNGRADED = {
  ...SUBMITTED_SCORED,
  id: 'A4',
  started_at: daysAgo(30),
  submitted_at: daysAgo(29),
  answers: LIVE_ATTEMPT.answers.map((a) => ({ ...a, needs_grading: true })),
}

function pathOf(url: string): string {
  return new URL(url).pathname.replace(/^\/api\/v1/, '')
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

type StubOptions = {
  exam?: () => Response | Promise<Response>
  attempts?: () => Response | Promise<Response>
  start?: () => Response | Promise<Response>
  answers?: () => Response | Promise<Response>
  submit?: () => Response | Promise<Response>
}

function stubApi(opts: StubOptions = {}) {
  const calls: Call[] = []
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const path = pathOf(String(input))
    const method = init?.method ?? 'GET'
    calls.push({
      method,
      path,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    })
    if (path === '/exams/E1/student-exam') return (opts.exam ?? (() => json(EXAM)))()
    if (path === '/exams/E1/attempts/me') return (opts.attempts ?? (() => json([])))()
    if (path === '/exams/E1/attempts' && method === 'POST') {
      return (opts.start ?? (() => json(LIVE_ATTEMPT, 201)))()
    }
    if (path === '/attempts/A1/answers') return (opts.answers ?? (() => json(LIVE_ATTEMPT)))()
    if (path === '/attempts/A1/submit') return (opts.submit ?? (() => json(SUBMITTED_SCORED)))()
    return json({ detail: 'Not found' }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

function renderExamPage(path = '/exams/E1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/exams/:id" element={<ExamTakePage />} />
          <Route path="/exams/:id/mine" element={<MyAttemptsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('exam taking (ticket 20)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the student-safe summary without touching the writer-only path', async () => {
    const { calls } = stubApi()
    renderExamPage()

    expect(await screen.findByText('اختبار الوحدة الأولى')).toBeInTheDocument()
    const card = screen.getByText('وصف الاختبار').closest('div')!
    expect(card).toHaveTextContent('المدة: 30 دقيقة')
    expect(card).toHaveTextContent('الأسئلة: 3')
    expect(card).toHaveTextContent('محاولاتك: 1 / 2')
    expect(screen.getByText('مفتوح')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'محاولاتي' })).toHaveAttribute(
      'href',
      '/exams/E1/mine',
    )
    expect(screen.getByRole('button', { name: 'بدء المحاولة' })).toBeEnabled()

    // The writer-only read is never called, and the student-safe one is.
    expect(calls.some((c) => c.path === '/exams/E1')).toBe(false)
    expect(calls.some((c) => c.path === '/exams/E1/student-exam')).toBe(true)
  })

  it('falls back to an Arabic line when the exam has no description', async () => {
    stubApi({ exam: () => json({ ...EXAM, description: '' }) })
    renderExamPage()

    expect(await screen.findByText('لا يوجد وصف لهذا الاختبار')).toBeInTheDocument()
  })

  it('shows an Arabic loading state', async () => {
    stubApi({ exam: () => new Promise<Response>(() => {}) })
    renderExamPage()

    expect(screen.getByRole('status', { name: 'جار تحميل الاختبار' })).toBeInTheDocument()
  })

  it('shows a missing exam in Arabic', async () => {
    stubApi({ exam: () => json({ detail: 'Exam not found.' }, 404) })
    renderExamPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('الاختبار غير موجود')
  })

  it('shows a not-enrolled student in Arabic', async () => {
    stubApi({ exam: () => json({ detail: 'Not authorized.' }, 403) })
    renderExamPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('لست مقيدًا في هذه السلسلة')
  })
  it('offers a retry when the exam cannot be loaded', async () => {
    stubApi({ exam: () => json({ detail: 'Boom' }, 500) })
    renderExamPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('تعذّر تحميل الاختبار')
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument()
  })

  it('blocks the start when the attempts are used up', async () => {
    stubApi({ exam: () => json({ ...EXAM, attempts_used: 2, attempts_left: 0 }) })
    renderExamPage()

    await screen.findByText('اختبار الوحدة الأولى')
    expect(screen.getByRole('button', { name: 'بدء المحاولة' })).toBeDisabled()
    expect(screen.getByText('نفدت محاولاتك')).toBeInTheDocument()
  })

  it('blocks the start when the window is closed', async () => {
    stubApi({ exam: () => json({ ...EXAM, window_status: 'closed' }) })
    renderExamPage()

    await screen.findByText('اختبار الوحدة الأولى')
    expect(screen.getByRole('button', { name: 'بدء المحاولة' })).toBeDisabled()
    expect(screen.getByText('انتهى وقت الاختبار')).toBeInTheDocument()
    expect(screen.getByText('مغلق')).toBeInTheDocument()
  })

  it('points a teacher at the preview instead of a dead end', async () => {
    // The writer may read the exam (can_view) but the server refuses the
    // start — its detail says so, and the UI repeats it in Arabic.
    stubApi({ start: () => json({ detail: 'Only enrolled students may take exams.' }, 403) })
    renderExamPage()

    fireEvent.click(await screen.findByRole('button', { name: 'بدء المحاولة' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'بدء المحاولة للطلاب فقط — المعلم يستخدم المعاينة',
    )
  })

  it('recovers the running attempt instead of starting a new one', async () => {
    const { calls } = stubApi({ attempts: () => json([LIVE_ATTEMPT]) })
    renderExamPage()

    expect(await screen.findByText(/ما هو الحكم/)).toBeInTheDocument()
    // The saved answers are prefilled.
    expect(screen.getByRole('radio', { name: 'ب' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'صح' })).toBeChecked()
    expect(screen.getByRole('textbox')).toHaveValue('إجابتي المحفوظة')
    // The running timer is there.
    expect(screen.getByRole('timer')).toBeInTheDocument()
    // No second attempt is created, and nothing is autosaved yet.
    expect(calls.some((c) => c.method === 'POST' && c.path === '/exams/E1/attempts')).toBe(false)
    expect(calls.some((c) => c.path === '/attempts/A1/answers')).toBe(false)
    // The intro card (and its start button) is gone.
    expect(screen.queryByRole('button', { name: 'بدء المحاولة' })).toBeNull()
  })

  it('recovers the existing attempt when the server refuses a second one', async () => {
    let seen = 0
    const { calls } = stubApi({
      attempts: () => {
        seen += 1
        return json(seen === 1 ? [] : [LIVE_ATTEMPT])
      },
      // The server reports the attempts limit BEFORE the live-attempt guard,
      // so the refusal may not even mention the live attempt.
      start: () => json({ detail: 'Attempts limit reached.' }, 400),
    })
    renderExamPage()

    fireEvent.click(await screen.findByRole('button', { name: 'بدء المحاولة' }))

    expect(await screen.findByText(/ما هو الحكم/)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'ب' })).toBeChecked()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(calls.some((c) => c.method === 'POST' && c.path === '/exams/E1/attempts')).toBe(true)
  })

  it('autosaves the current selections', async () => {
    const { calls } = stubApi({ attempts: () => json([LIVE_ATTEMPT]) })
    renderExamPage()

    await screen.findByText(/ما هو الحكم/)
    fireEvent.click(screen.getByRole('radio', { name: 'أ' }))

    await waitFor(
      () => expect(calls.some((c) => c.path === '/attempts/A1/answers')).toBe(true),
      { timeout: 3000 },
    )
    const save = calls.find((c) => c.path === '/attempts/A1/answers')!
    expect(save.method).toBe('POST')
    expect(JSON.stringify(save.body)).toContain('"selected_index":0')
  })

  it('saves immediately when the page is hidden', async () => {
    const { calls } = stubApi({ attempts: () => json([LIVE_ATTEMPT]) })
    renderExamPage()

    await screen.findByText(/ما هو الحكم/)
    fireEvent.click(screen.getByRole('radio', { name: 'أ' }))
    // Reloading/closing right after an edit must not wait out the debounce.
    fireEvent(window, new Event('pagehide'))

    await waitFor(() =>
      expect(calls.some((c) => c.path === '/attempts/A1/answers')).toBe(true),
    )
  })

  it('does not resume an attempt whose timer has run out', async () => {
    const expired = { ...LIVE_ATTEMPT, expires_at: daysAgo(1) }
    const { calls } = stubApi({ attempts: () => json([expired]) })
    renderExamPage()

    // The server settles it at 0 on the next read; until then do not offer a
    // dead attempt as resumable.
    expect(await screen.findByRole('button', { name: 'بدء المحاولة' })).toBeInTheDocument()
    expect(screen.queryByRole('timer')).toBeNull()
    expect(calls.some((c) => c.path === '/attempts/A1/answers')).toBe(false)
  })

  it('never claims an empty history while the list is loading', async () => {
    stubApi({ attempts: () => new Promise<Response>(() => {}) })
    renderExamPage('/exams/E1/mine')

    expect(await screen.findByRole('status', { name: 'محاولاتي' })).toBeInTheDocument()
    expect(screen.queryByText('لا توجد محاولات بعد')).toBeNull()
  })

  it('submits the current drafts and shows the receipt', async () => {
    const { calls } = stubApi({ attempts: () => json([LIVE_ATTEMPT]) })
    renderExamPage()

    await screen.findByText(/ما هو الحكم/)
    fireEvent.click(screen.getByRole('radio', { name: 'أ' }))
    fireEvent.click(screen.getByRole('button', { name: 'تسليم' }))

    const confirm = await screen.findByRole('button', { name: 'تأكيد التسليم' })
    fireEvent.click(confirm)

    await waitFor(() =>
      expect(calls.some((c) => c.method === 'POST' && c.path === '/attempts/A1/submit')).toBe(
        true,
      ),
    )
    const sent = calls.find((c) => c.path === '/attempts/A1/submit')!
    expect(JSON.stringify(sent.body)).toContain('"selected_index":0')
    expect(JSON.stringify(sent.body)).toContain('إجابتي المحفوظة')

    // The receipt keeps the Arabic UX and the way back.
    expect(await screen.findByText('تم التسليم')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'عودة إلى السلسلة' })).toHaveAttribute(
      'href',
      '/courses/C1',
    )
    expect(screen.getByRole('link', { name: 'محاولاتي' })).toHaveAttribute('href', '/exams/E1/mine')
  })

  it('lists the attempts with Arabic labels, dates and a resume action', async () => {
    stubApi({
      attempts: () =>
        json([
          LIVE_ATTEMPT,
          SUBMITTED_SCORED,
          SUBMITTED_UNPUBLISHED,
          SUBMITTED_UNPUBLISHED_PENDING,
          SUBMITTED_UNGRADED,
        ]),
    })
    renderExamPage('/exams/E1/mine')

    expect(await screen.findByText('قيد الأداء')).toBeInTheDocument()
    expect(screen.getAllByText('تم التسليم')).toHaveLength(4)
    // Localized dates, not raw ISO strings.
    const rows = screen.getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent(/\d{1,2}\s+\S+\s+\d{4}/)
    expect(screen.queryByText(/T\d{2}:\d{2}:\d{2}Z/)).toBeNull()
    // Visible score, unpublished result, pending grading.
    expect(screen.getByText('الدرجة 8 / 15')).toBeInTheDocument()
    // Two rows are unpublished (one of them also has a pending essay).
    expect(screen.getAllByText('بانتظار النشر')).toHaveLength(2)
    expect(screen.getByText('الدرجة 8 / 15 — بانتظار التصحيح')).toBeInTheDocument()
    // Resume action for the live attempt only.
    const resume = screen.getByRole('link', { name: 'متابعة' })
    expect(resume).toHaveAttribute('href', '/exams/E1')
  })

  it('shows an empty history with a back link to the course', async () => {
    stubApi({ attempts: () => json([]) })
    renderExamPage('/exams/E1/mine')

    expect(await screen.findByText('لا توجد محاولات بعد')).toBeInTheDocument()
    const back = await screen.findByRole('link', { name: 'عودة إلى السلسلة' })
    expect(back).toHaveAttribute('href', '/courses/C1')
  })

  it('shows the not-enrolled state in the history', async () => {
    stubApi({ attempts: () => json({ detail: 'Not authorized.' }, 403) })
    renderExamPage('/exams/E1/mine')

    expect(await screen.findByRole('alert')).toHaveTextContent('لست مقيدًا في هذه السلسلة')
  })

  it('offers a retry when the history cannot be loaded', async () => {
    stubApi({ attempts: () => json({ detail: 'Boom' }, 500) })
    renderExamPage('/exams/E1/mine')

    expect(await screen.findByRole('alert')).toHaveTextContent('تعذّر تحميل المحاولات')
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument()
  })
})
