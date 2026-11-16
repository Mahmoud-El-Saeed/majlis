import { expect, test, type Page, type Route } from '@playwright/test'
import { json } from './support/http'

// ---------------------------------------------------------------------------
// Ticket 24 — shell, auth & media polish:
//
//   • at 320px and 390px the anonymous navbar CTAs each sit on ONE line
//     (no wrapping, no horizontal scroll), and the signed-in menu never
//     repeats "حسابي" alongside the one already in the bar;
//   • a signed-in landing page offers the dashboard, never auth prompts;
//   • listening to a real lesson survives a reload: the audio element
//     resumes near the last position on the same lesson.
//
// Mocked API: the fake answers with the payload shapes the real backend
// uses. The lesson audio is a generated WAV served through route
// interception, so the reload-resume assertion drives a real <audio>
// element — no live stack, no real R2.
// ---------------------------------------------------------------------------

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
  audio_key: 'lessons/L1/audio.wav',
  transcript_voice: null,
  transcript_book: null,
  can_manage: true,
}

const COURSE = {
  id: 'C1',
  title: 'سلسلة الفقه',
  description: 'وصف السلسلة',
  book_title: null,
  owner_id: 'T1',
  created_at: '2026-01-01T00:00:00Z',
}

type Role = 'student' | 'teacher'

async function installFakeApi(page: Page, role: Role = 'student'): Promise<void> {
  await page.route('**/api/v1/**', async (route: Route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*\/api\/v1/, '') || '/'
    if (route.request().method() === 'OPTIONS') return json(route, null, 204)
    if (path === '/auth/me') {
      return json(route, {
        id: role === 'teacher' ? 'T1' : 'S1',
        email: role === 'teacher' ? 'teacher@example.com' : 'student@example.com',
        full_name: 'طالب الاختبار',
        role,
        is_verified: true,
      })
    }
    if (path === '/lessons/L1') return json(route, LESSON)
    if (path === '/courses/C1') return json(route, COURSE)
    if (path === '/lessons/L1/play') {
      return json(route, { playback_url: 'http://localhost:5173/lesson.wav' })
    }
    if (path === '/lessons/L1/attachments') return json(route, [])
    return json(route, { detail: 'Not Found' }, 404)
  })
}

// 30 seconds of 44.1kHz 16-bit mono PCM silence as a WAV file.
function makeWav(seconds = 30): Buffer {
  const rate = 44100
  const samples = rate * seconds
  const dataSize = samples * 2
  const buf = Buffer.alloc(44 + dataSize)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataSize, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(rate, 24)
  buf.writeUInt32LE(rate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataSize, 40)
  return buf
}

async function installWav(page: Page): Promise<void> {
  const wav = makeWav()
  await page.route('**/lesson.wav', async (route) => {
    const range = route.request().headers()['range']
    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range)
      if (match) {
        const start = Number(match[1])
        const end = match[2] ? Math.min(Number(match[2]), wav.length - 1) : wav.length - 1
        return route.fulfill({
          status: 206,
          contentType: 'audio/wav',
          headers: {
            'Content-Range': `bytes ${start}-${end}/${wav.length}`,
            'Accept-Ranges': 'bytes',
          },
          body: wav.subarray(start, end + 1),
        })
      }
    }
    return route.fulfill({
      status: 200,
      contentType: 'audio/wav',
      headers: { 'Accept-Ranges': 'bytes' },
      body: wav,
    })
  })
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

for (const width of [320, 390]) {
  test(`anon navbar at ${width}px: login + signup each on one line, no h-scroll`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/')

    const login = page.getByRole('link', { name: 'تسجيل الدخول' }).first()
    const signup = page.getByRole('link', { name: 'حساب جديد' }).first()
    await expect(login).toBeVisible()
    await expect(signup).toBeVisible()

    const loginBox = await login.boundingBox()
    const signupBox = await signup.boundingBox()
    expect(loginBox, 'login link must be one line tall').not.toBeNull()
    expect(signupBox, 'signup link must be one line tall').not.toBeNull()
    // Both links fit in a single row (their tops nearly coincide).
    expect(Math.abs((loginBox?.y ?? 0) - (signupBox?.y ?? 0))).toBeLessThan(8)
    expect(loginBox?.height ?? 99).toBeLessThan(40)
    expect(signupBox?.height ?? 99).toBeLessThan(40)

    await expectNoHorizontalScroll(page)
  })
}

for (const width of [320, 390]) {
  test(`signed-in landing at ${width}px: dashboard CTA, no auth prompts`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await installFakeApi(page, 'student')
    await page.goto('/')

    await expect(page.getByRole('link', { name: 'إلى لوحتك', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'حساب جديد' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'تسجيل الدخول' })).toHaveCount(0)
    await expectNoHorizontalScroll(page)
  })

  test(`signed-in teacher at ${width}px: menu shows حسابي exactly once`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await installFakeApi(page, 'teacher')
    await page.goto('/')

    await expect(page.getByRole('button', { name: 'القائمة' })).toBeVisible()
    await page.getByRole('button', { name: 'القائمة' }).click()

    // The bar keeps its own حسابي; the open menu must never add a second one.
    await expect(page.getByRole('link', { name: 'حسابي' })).toHaveCount(1)
    await expect(page.getByRole('link', { name: 'المعلم' })).toBeVisible()
    await expectNoHorizontalScroll(page)
  })
}

test('lesson position survives a reload (real audio element)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await installFakeApi(page)
  await installWav(page)

  await page.goto('/lessons/L1')

  const audio = page.locator('audio').first()
  await expect(audio).toBeAttached()
  // Metadata lands: duration label shows 00:30.
  await expect(page.getByText('00:30')).toBeVisible({ timeout: 15_000 })

  // Skip forward 10s → the position is persisted for this lesson.
  await page.getByRole('button', { name: 'تقدم 10 ثوانٍ' }).click()
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem('mj_pos_L1')), { timeout: 10_000 })
    .toBe('10')

  await page.reload()
  await expect(page.getByText('00:30')).toBeVisible({ timeout: 15_000 })
  // The fresh element resumed near the last position — not at 0 and not
  // clamped to the 30s duration.
  await expect
    .poll(
      () => page.evaluate(() => document.querySelector('audio')?.currentTime ?? -1),
      { timeout: 10_000 },
    )
    .toBeGreaterThanOrEqual(9)
  expect(
    await page.evaluate(() => document.querySelector('audio')?.currentTime ?? -1),
  ).toBeLessThanOrEqual(12)
})
