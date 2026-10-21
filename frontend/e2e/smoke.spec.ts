import { expect, test } from '@playwright/test'

// Ticket 15 E2E smoke. Shell tests run always (no backend needed).
// Live API flow (signup → join → approve → listen → exam → grade) runs only
// with E2E_LIVE=1 against a local stack (api :8000 + mailpit :8025) and leaves
// the Postgres-backed backend untouched (reads/writes only via public API).

test('shell: RTL home with Andalusian hero + auth routes', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
  await expect(page.getByRole('heading', { name: /مجلس/ }).first()).toBeVisible()
  await expect(page.getByText('الحلقة الخاصة').first()).toBeVisible()

  await page.goto('/login')
  await expect(page.getByLabel('البريد الإلكتروني')).toBeVisible()
  await expect(page.getByLabel('كلمة المرور')).toBeVisible()

  await page.goto('/signup')
  await expect(page.getByRole('heading', { name: /حساب جديد/ })).toBeVisible()
})

test('shell: per-course chat and vault require auth (anon → login)', async ({ page }) => {
  await page.goto('/courses/c1/chat')
  await expect(page).toHaveURL(/\/login/)

  await page.goto('/admin/vault')
  // Admin guard redirects anon to login; stub note visible when authed.
  // Anon assertion: redirected to login (no vault API attempted).
  await expect(page).toHaveURL(/\/login/)
})

test('shell: exam gating — anon redirected, writer message documented', async ({ page }) => {
  await page.goto('/exams/some-id')
  await expect(page).toHaveURL(/\/login/)
})

// Live flow: requires E2E_LIVE=1 + local API + Mailpit + admin seed creds
// (E2E_ADMIN_EMAIL/PASSWORD). Drives the full circle through the public API
// only — backend code untouched: teacher invite → course → code → student
// signup/verify → join → approve → exam author → take/auto-grade → gradebook+CSV.
test('live: signup → join → approve → listen → exam → grade', async ({ page, request }) => {
  test.skip(!process.env.E2E_LIVE, 'set E2E_LIVE=1 with local stack to run')
  const adminEmail = process.env.E2E_ADMIN_EMAIL
  const adminPassword = process.env.E2E_ADMIN_PASSWORD
  test.skip(!adminEmail || !adminPassword, 'set E2E_ADMIN_EMAIL/PASSWORD (seed admin)')
  const apiBase = process.env.E2E_API_URL ?? 'http://localhost:8000/api/v1'

  const health = await request.get(apiBase.replace(/\/api\/v1$/, '/health'))
  expect(health.ok()).toBeTruthy()

  const stamp = Date.now()
  const teacherEmail = `e2e-teacher-${stamp}@example.com`
  const studentEmail = `e2e-student-${stamp}@example.com`
  const password = 'Passw0rd!x'

  // Admin → teacher invite → accept (promotion path uses same endpoint).
  const adminLogin = await request.post(`${apiBase}/auth/login`, {
    data: { email: adminEmail, password: adminPassword },
  })
  expect(adminLogin.ok()).toBeTruthy()
  const adminTok = ((await adminLogin.json()) as { access_token: string }).access_token
  const invite = await request.post(`${apiBase}/invites`, {
    headers: { Authorization: `Bearer ${adminTok}` },
    data: { email: teacherEmail },
  })
  expect([200, 201]).toContain(invite.status())

  let inviteToken: string | null = null
  for (let i = 0; i < 20 && !inviteToken; i++) {
    const msgs = await request.get('http://localhost:8025/api/v1/messages?limit=20')
    if (msgs.ok()) {
      const body = (await msgs.json()) as { messages?: Array<{ ID: string }> }
      for (const m of body.messages ?? []) {
        const one = await request.get(`http://localhost:8025/api/v1/message/${m.ID}`)
        if (!one.ok()) continue
        const text = await one.text()
        const hit = text.match(/invite\?token=([A-Za-z0-9._-]+)/)
        if (hit && text.includes(teacherEmail)) {
          inviteToken = hit[1]
          break
        }
      }
    }
    if (!inviteToken) await page.waitForTimeout(1000)
  }
  expect(inviteToken, 'invite token from Mailpit').toBeTruthy()
  const accept = await request.post(`${apiBase}/invites/accept`, {
    data: { token: inviteToken, password, full_name: 'E2E Teacher' },
  })
  expect([200, 201]).toContain(accept.status())

  const teacherLogin = await request.post(`${apiBase}/auth/login`, {
    data: { email: teacherEmail, password },
  })
  const teacherTok = ((await teacherLogin.json()) as { access_token: string }).access_token
  const tHeaders = { Authorization: `Bearer ${teacherTok}` }

  // Teacher: course + join code (raw shown once) + lesson + exam + MCQ.
  const course = await request.post(`${apiBase}/courses`, {
    headers: tHeaders,
    data: { title: `E2E Book ${stamp}`, book_title: 'E2E' },
  })
  expect(course.status()).toBe(201)
  const courseId = ((await course.json()) as { id: string }).id

  const codeRes = await request.post(`${apiBase}/courses/${courseId}/codes`, { headers: tHeaders, data: {} })
  expect(codeRes.status()).toBe(201)
  const rawCode = ((await codeRes.json()) as { code: string }).code
  expect(rawCode).toBeTruthy()

  const lesson = await request.post(`${apiBase}/courses/${courseId}/lessons`, {
    headers: tHeaders,
    data: { title: 'E2E Lesson 1', pages_from: 1, pages_to: 5, media_type: 'audio' },
  })
  expect(lesson.status()).toBe(201)

  const exam = await request.post(`${apiBase}/courses/${courseId}/exams`, {
    headers: tHeaders,
    data: { title: 'E2E Exam', attempts_limit: 2, duration_minutes: 30, pass_score: 50, show_result: 'immediate' },
  })
  expect([200, 201]).toContain(exam.status())
  const examId = ((await exam.json()) as { id: string }).id
  const q = await request.post(`${apiBase}/exams/${examId}/questions`, {
    headers: tHeaders,
    data: { type: 'mcq', prompt: '1+1؟', options: ['1', '2', '3', '4'], correct_index: 1, max_score: 10, position: 0 },
  })
  expect([200, 201]).toContain(q.status())

  // Student: signup → verify (Mailpit) → login → join → pending.
  const signup = await request.post(`${apiBase}/auth/signup`, {
    data: { email: studentEmail, password, full_name: 'E2E Student' },
  })
  expect([200, 201]).toContain(signup.status())

  let verifyToken: string | null = null
  for (let i = 0; i < 20 && !verifyToken; i++) {
    const msgs = await request.get('http://localhost:8025/api/v1/messages?limit=20')
    if (msgs.ok()) {
      const body = (await msgs.json()) as { messages?: Array<{ ID: string }> }
      for (const m of body.messages ?? []) {
        const one = await request.get(`http://localhost:8025/api/v1/message/${m.ID}`)
        if (!one.ok()) continue
        const text = await one.text()
        const hit = text.match(/verify\?token=([A-Za-z0-9._-]+)/)
        if (hit && text.includes(studentEmail)) {
          verifyToken = hit[1]
          break
        }
      }
    }
    if (!verifyToken) await page.waitForTimeout(1000)
  }
  expect(verifyToken, 'verify token from Mailpit').toBeTruthy()

  const verify = await request.post(`${apiBase}/auth/verify`, { data: { token: verifyToken } })
  expect(verify.ok()).toBeTruthy()

  const login = await request.post(`${apiBase}/auth/login`, {
    data: { email: studentEmail, password },
  })
  expect(login.ok()).toBeTruthy()
  const studentTok = ((await login.json()) as { access_token: string }).access_token
  const sHeaders = { Authorization: `Bearer ${studentTok}` }

  const join = await request.post(`${apiBase}/enrollments/join`, {
    headers: sHeaders,
    data: { code: rawCode, display_name: 'E2E Student' },
  })
  expect(join.status()).toBe(201)

  // Teacher approves; student becomes approved (listen gate).
  const queue = await request.get(`${apiBase}/courses/${courseId}/enrollments?status=pending`, {
    headers: tHeaders,
  })
  const pendingList = (await queue.json()) as { enrollments?: Array<{ id: string }> } | Array<{ id: string }>
  const pendingArr = Array.isArray(pendingList) ? pendingList : (pendingList.enrollments ?? [])
  const mine = pendingArr[pendingArr.length - 1]
  expect(mine?.id).toBeTruthy()
  const approve = await request.post(`${apiBase}/enrollments/${mine.id}/approve`, { headers: tHeaders })
  expect(approve.ok()).toBeTruthy()

  const myEnrollment = await request.get(`${apiBase}/courses/${courseId}/my-enrollment`, {
    headers: sHeaders,
  })
  expect(((await myEnrollment.json()) as { status: string }).status).toBe('approved')

  // Listen gate: approved student lists lessons (ready-only — the processing
  // lesson stays hidden until audio confirm marks it ready; /play serves bytes).
  const lessons = await request.get(`${apiBase}/courses/${courseId}/lessons`, { headers: sHeaders })
  expect(lessons.ok()).toBeTruthy()
  expect(Array.isArray(await lessons.json())).toBeTruthy()

  // Exam discovery (no correct_* leak) → take → auto-graded immediate score.
  const discovered = await request.get(`${apiBase}/courses/${courseId}/student-exams`, {
    headers: sHeaders,
  })
  const examsList = (await discovered.json()) as Array<Record<string, unknown>>
  expect(examsList.length).toBeGreaterThan(0)
  expect(JSON.stringify(examsList[0])).not.toMatch(/correct_index|correct_answer/)

  const start = await request.post(`${apiBase}/exams/${examId}/attempts`, { headers: sHeaders, data: {} })
  expect(start.status()).toBe(201)
  const attempt = (await start.json()) as {
    id: string
    questions: Array<{ id: string }>
    expires_at: string | null
  }
  expect(attempt.expires_at).toBeTruthy()

  // Autosave round-trip against the real API: the draft is persisted server
  // side and a fresh read reopens the SAME attempt with the same selection —
  // a reload can never consume an attempt.
  const draft = await request.post(`${apiBase}/attempts/${attempt.id}/answers`, {
    headers: sHeaders,
    data: { answers: [{ question_id: attempt.questions[0].id, selected_index: 1 }] },
  })
  expect(draft.ok()).toBeTruthy()
  const reopened = await request.get(`${apiBase}/exams/${examId}/attempts/me`, {
    headers: sHeaders,
  })
  expect(reopened.ok()).toBeTruthy()
  const attempts = (await reopened.json()) as Array<{
    id: string
    status: string
    answers: Array<{ question_id: string; selected_index: number | null }>
  }>
  expect(attempts).toHaveLength(1)
  expect(attempts[0].id).toBe(attempt.id)
  expect(attempts[0].status).toBe('in_progress')
  expect(attempts[0].answers[0]?.selected_index).toBe(1)

  const submit = await request.post(`${apiBase}/attempts/${attempt.id}/submit`, {
    headers: sHeaders,
    data: { answers: [{ question_id: attempt.questions[0].id, selected_index: 1 }] },
  })
  expect(submit.ok()).toBeTruthy()
  const graded = (await submit.json()) as { score: number | null }
  expect(graded.score).toBe(10)

  // Gradebook + CSV export.
  const gradebook = await request.get(`${apiBase}/courses/${courseId}/gradebook`, { headers: tHeaders })
  expect(gradebook.ok()).toBeTruthy()
  const csv = await request.get(`${apiBase}/courses/${courseId}/gradebook/export`, { headers: tHeaders })
  expect(csv.ok()).toBeTruthy()
  expect((await csv.text()).length).toBeGreaterThan(0)

  // Student dashboard via UI (proves Bearer wiring + Join FAB → modal).
  await page.goto('/login')
  await page.getByLabel('البريد الإلكتروني').fill(studentEmail)
  await page.getByLabel('كلمة المرور').fill(password)
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
  await page.getByRole('button', { name: 'انضم برمز السلسلة' }).click()
  await expect(page.getByRole('dialog', { name: 'انضم برمز السلسلة' })).toBeVisible()
})
