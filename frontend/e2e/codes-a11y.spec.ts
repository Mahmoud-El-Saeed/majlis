import { expect, test, type Route } from '@playwright/test'
import { json } from './support/http'
import AxeBuilder from '@axe-core/playwright'

// Ticket 23 — the codes page empty states must be valid list markup and the
// page must be axe-clean. Mocked on purpose: the fake answers with empty
// wrapped lists ({codes: []} / {enrollments: []}), so the spec pins the
// empty-state DOM without needing a live API.

test('codes page empty states use valid list markup and axe reports no violations', async ({
  page,
}) => {
  await page.route('**/api/v1/**', async (route: Route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace(/^.*\/api\/v1/, '') || '/'

    if (request.method() === 'OPTIONS') {
      await json(route, null, 204)
      return
    }
    if (path === '/auth/me') {
      await json(route, {
        id: 'T1',
        email: 'teacher@example.com',
        full_name: 'المعلم',
        role: 'teacher',
        is_verified: true,
      })
      return
    }
    if (path === '/courses/C1/codes') {
      await json(route, { codes: [] })
      return
    }
    if (path.startsWith('/courses/C1/enrollments')) {
      await json(route, { enrollments: [] })
      return
    }
    await json(route, { detail: 'Not Found' }, 404)
  })

  await page.goto('/teach/courses/C1/codes')

  await expect(page.getByText('لا رموز بعد')).toBeVisible()
  await expect(page.getByText('لا طلبات معلقة')).toBeVisible()
  await expect(page.getByText('لا أعضاء بعد')).toBeVisible()
  await expect(page.locator('ul > p')).toHaveCount(0)

  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
