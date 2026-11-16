import { expect, test, type Page, type Route } from '@playwright/test'
import { json } from './support/http'

// ---------------------------------------------------------------------------
// Ticket 22 — enrollment integrity at the surface:
//   • direct navigation into a pending/rejected/blocked course shows the
//     Arabic status page with the right next step — no tabs, no counts,
//     no content, no silent 403s;
//   • the dashboard hint matches the real status (blocked never passes for
//     "awaiting review");
//   • the join form collects name-when-none, optional phone and note, for
//     new and existing accounts alike.
//
// Mocked on purpose: the fake answers with the exact english details and
// payload shapes the real backend uses, so the spec pins UI behaviour
// without needing a live API.
// ---------------------------------------------------------------------------

const COURSE_SEED = {
  id: 'C1',
  title: 'سلسلة الفقه',
  description: 'وصف السلسلة',
  book_title: null,
  owner_id: 'T1',
  created_at: '2026-01-01T00:00:00Z',
}

type StatusOptions = {
  status: 'pending' | 'rejected' | 'blocked'
  full_name: string | null
}

async function installFakeApi(
  page: Page,
  options: StatusOptions,
  capture?: { joinBody?: unknown; requested?: string[] },
) {
  await page.route('**/api/v1/**', async (route: Route) => {
    const request = route.request()
    const method = request.method()
    const path = new URL(request.url()).pathname.replace(/^.*\/api\/v1/, '') || '/'

    if (method === 'OPTIONS') {
      await json(route, null, 204)
      return
    }
    capture?.requested?.push(path)

    if (path === '/auth/me') {
      await json(route, {
        id: 'S1',
        email: 'student@example.com',
        full_name: options.full_name,
        role: 'student',
        is_verified: true,
      })
      return
    }

    if (path === '/dashboard') {
      await json(route, { items: [] })
      return
    }

    // Direct navigation: the real backend 403s course reads for gated users.
    if (path === '/courses/C1') {
      await json(route, { detail: 'Not authorized.' }, 403)
      return
    }
    if (path === '/courses/C1/lessons' || path === '/courses/C1/student-exams') {
      await json(route, { detail: 'Not authorized.' }, 403)
      return
    }
    if (path === '/courses/C1/my-enrollment') {
      await json(route, {
        id: 'E1',
        course_id: 'C1',
        course_title: COURSE_SEED.title,
        user_id: 'S1',
        code_id: null,
        status: options.status,
        display_name: 'طالب',
        phone: null,
        note: null,
        decided_by: null,
        decided_at: null,
        created_at: '2026-01-02T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      })
      return
    }

    // The join endpoint accepts name + optional phone/note (already stored).
    if (path === '/enrollments/join' && method === 'POST') {
      if (capture) capture.joinBody = request.postDataJSON()
      await json(route, {
        id: 'E1',
        course_id: 'C1',
        course_title: COURSE_SEED.title,
        user_id: 'S1',
        status: 'pending',
        display_name: 'طالب',
        created_at: '2026-01-02T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      }, 201)
      return
    }

    await json(route, { detail: 'Not Found' }, 404)
  })
}

const HINT_AR: Record<'pending' | 'rejected' | 'blocked', RegExp> = {
  pending: /بانتظار مراجعة الشيخ/,
  rejected: /مرفوض[\s\S]*رمز جديد/,
  blocked: /حظرك[\s\S]*لا يمكنك إعادة الانضمام/,
}

const BADGE_AR: Record<'pending' | 'rejected' | 'blocked', string> = {
  pending: 'بانتظار',
  rejected: 'مرفوض',
  blocked: 'محظور',
}

for (const status of ['pending', 'rejected', 'blocked'] as const) {
  test(`direct nav (${status}) shows the status page, no tabs/counts/content`, async ({
    page,
  }) => {
    const capture: { requested?: string[] } = { requested: [] }
    await installFakeApi(page, { status, full_name: 'طالب اختبار' }, capture)

    await page.goto('/courses/C1')

    // The status card names the status badge and the correct next step.
    const card = page.getByTestId('enrollment-status-card')
    await expect(card).toBeVisible()
    await expect(card.getByText(BADGE_AR[status], { exact: true })).toBeVisible()
    await expect(card.getByRole('status')).toContainText(HINT_AR[status])

    // No tab bar, no schedule scaffolding, and no silent 403s.
    await expect(page.getByRole('tablist')).toHaveCount(0)
    await expect(page.getByRole('tabpanel')).toHaveCount(0)
    await expect(page.locator('ul[aria-label="الدروس"]')).toHaveCount(0)

    // The right way back into the loop.
    await expect(card.getByRole('link', { name: 'إلى لوحتك' })).toBeVisible()

    // Membership is the only course-scoped read: a gated student never
    // fires (nor silently swallows) the content endpoints' 403s.
    await page.waitForLoadState('networkidle')
    expect(capture.requested).toContain('/courses/C1/my-enrollment')
    expect(capture.requested).not.toContain('/courses/C1')
    expect(capture.requested).not.toContain('/courses/C1/lessons')
    expect(capture.requested).not.toContain('/courses/C1/student-exams')

    // Blocked must never read as "awaiting review" (dashboard hint rule).
    if (status === 'blocked') {
      await expect(page.getByText('بانتظار مراجعة الشيخ')).toHaveCount(0)
    }
  })
}

test('dashboard card shows the hint that matches the real status', async ({ page }) => {
  await page.route('**/api/v1/**', async (route: Route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace(/^.*\/api\/v1/, '') || '/'
    if (request.method() === 'OPTIONS') return json(route, null, 204)
    if (path === '/auth/me') {
      await json(route, {
        id: 'S1',
        email: 'student@example.com',
        full_name: 'طالب اختبار',
        role: 'student',
        is_verified: true,
      })
      return
    }
    if (path === '/dashboard') {
      await json(route, {
        items: [
          {
            course: { ...COURSE_SEED },
            lesson_count: 2,
            ready_count: 0,
            enrollment_status: 'blocked',
            enrollment: {
              id: 'E1',
              course_id: 'C1',
              status: 'blocked',
              display_name: 'طالب اختبار',
            },
          },
        ],
      })
      return
    }
    await json(route, { detail: 'Not Found' }, 404)
  })

  await page.goto('/dashboard')

  const item = page.locator('li', { hasText: COURSE_SEED.title })
  await expect(item.getByText('محظور')).toBeVisible()
  // The blocked hint, not the pending one — the ticket's exact wording.
  await expect(item).toContainText(/حظرك[\s\S]*لا يمكنك إعادة الانضمام/)
  await expect(item).not.toContainText('بانتظار مراجعة الشيخ')
})

test('join form collects name (when the account has none) + phone + note', async ({ page }) => {
  const capture: { joinBody?: { code?: string; display_name?: string; phone?: string; note?: string } } =
    {}
  await installFakeApi(page, { status: 'pending', full_name: null }, capture)

  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'انضم برمز السلسلة' }).click()

  await page.getByLabel('الرمز').fill('JOINCODE')
  await page.getByLabel('الاسم المعروض للشيخ').fill('طالب جديد')
  await page.getByLabel('الهاتف (اختياري)').fill('0551234567')
  await page.getByLabel('ملاحظة للشيخ (اختياري)').fill('أسمع وكأنني في الحلقة')

  await page.getByRole('button', { name: 'انضم', exact: true }).click()

  expect(capture.joinBody).toEqual({
    code: 'JOINCODE',
    display_name: 'طالب جديد',
    phone: '0551234567',
    note: 'أسمع وكأنني في الحلقة',
  })
  await expect(page.getByText('تم إرسال طلب الانضمام — بانتظار المراجعة')).toBeVisible()
})

test('existing accounts keep their shown name and still send phone + note', async ({ page }) => {
  const capture: { joinBody?: { code?: string; display_name?: string; phone?: string; note?: string } } =
    {}
  await installFakeApi(page, { status: 'pending', full_name: 'حامل الاسم' }, capture)

  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'انضم برمز السلسلة' }).click()

  // no name input: the account already carries one
  await expect(page.getByText(/ستنضم باسم:/)).toBeVisible()
  await page.getByLabel('الهاتف (اختياري)').fill('0559999999')
  await page.getByLabel('ملاحظة للشيخ (اختياري)').fill('ملاحظة موجودة')
  await page.getByLabel('الرمز').fill('EXISTING')

  await page.getByRole('button', { name: 'انضم', exact: true }).click()

  expect(capture.joinBody).toEqual({
    code: 'EXISTING',
    display_name: 'حامل الاسم',
    phone: '0559999999',
    note: 'ملاحظة موجودة',
  })
})
