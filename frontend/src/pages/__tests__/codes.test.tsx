import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CodesQueuePage } from '../CodesQueue'
import { ToastProvider } from '../../components/Toast'

// Ticket 16: the codes API returns wrapped objects ({codes: [...]},
// {enrollments: [...]}) — the page must read the wrapped lists.
describe('codes + queue page (wrapped list shapes)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders codes, pending queue, and members from wrapped responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url)
        if (u.endsWith('/courses/C1/codes')) {
          return new Response(
            JSON.stringify({
              codes: [
                {
                  id: 'code-1',
                  code_prefix: 'AB12',
                  max_uses: 50,
                  uses_count: 3,
                  expires_at: '2026-12-01T00:00:00Z',
                  created_at: '2026-10-01T00:00:00Z',
                },
              ],
            }),
            { status: 200 },
          )
        }
        if (u.includes('/enrollments?status=pending')) {
          return new Response(
            JSON.stringify({
              enrollments: [
                {
                  id: 'e-1',
                  course_id: 'C1',
                  user_id: 'u-1',
                  status: 'pending',
                  display_name: 'طالب',
                  phone: '0100',
                  note: '',
                  created_at: '2026-10-01T00:00:00Z',
                  updated_at: '2026-10-01T00:00:00Z',
                },
              ],
            }),
            { status: 200 },
          )
        }
        if (u.endsWith('/courses/C1/enrollments')) {
          return new Response(JSON.stringify({ enrollments: [] }), { status: 200 })
        }
        return new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 })
      }),
    )
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/teach/courses/C1/codes']}>
            <Routes>
              <Route path="/teach/courses/:id/codes" element={<CodesQueuePage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    )
    await waitFor(() => {
      expect(screen.getByText(/AB12/)).toBeInTheDocument()
    })
    expect(screen.getByText('طالب')).toBeInTheDocument()
    expect(screen.queryByText('لا طلبات معلقة')).not.toBeInTheDocument()
  })

  // Ticket 19: generate form carries optional max_uses/expires_days in the
  // POST body (placeholders show the hardcoded server defaults 50/7 — no
  // endpoint exposes CODE_DEFAULT_*), with Arabic client-side validation.
  it('generate form posts max_uses/expires_days and validates client-side', async () => {
    const posts: Array<{ url: string; body: unknown }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url)
        const method = (init?.method ?? 'GET').toUpperCase()
        if (u.endsWith('/courses/C1/codes') && method === 'POST') {
          posts.push({ url: u, body: init?.body ? JSON.parse(String(init.body)) : undefined })
          return new Response(
            JSON.stringify({
              id: 'code-9',
              code: 'ABCDEFGH',
              code_prefix: 'ABCD',
              max_uses: 5,
              uses_count: 0,
              expires_at: '2026-12-01T00:00:00Z',
              created_at: '2026-10-01T00:00:00Z',
            }),
            { status: 201 },
          )
        }
        if (u.includes('/enrollments')) {
          return new Response(JSON.stringify({ enrollments: [] }), { status: 200 })
        }
        if (u.endsWith('/courses/C1/codes')) {
          return new Response(JSON.stringify({ codes: [] }), { status: 200 })
        }
        return new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 })
      }),
    )
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/teach/courses/C1/codes']}>
            <Routes>
              <Route path="/teach/courses/:id/codes" element={<CodesQueuePage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    )
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'توليد رمز' })).toBeInTheDocument()
    })
    expect(screen.getByPlaceholderText('50')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('7')).toBeInTheDocument()

    // Valid knobs → POST body carries them; raw-once + copy flow intact.
    fireEvent.change(screen.getByPlaceholderText('50'), { target: { value: '5' } })
    fireEvent.change(screen.getByPlaceholderText('7'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'توليد رمز' }))
    await waitFor(() => {
      expect(screen.getByText('انسخ الرمز الآن — لن يظهر مجددًا')).toBeInTheDocument()
    })
    expect(posts).toHaveLength(1)
    expect(posts[0].body).toEqual({ max_uses: 5, expires_days: 3 })
    expect(screen.getByText('ABCDEFGH')).toBeInTheDocument()

    // Invalid max uses (0 < 1) → Arabic error, no new POST.
    fireEvent.change(screen.getByPlaceholderText('50'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'توليد رمز' }))
    await waitFor(() => {
      expect(screen.getByText('عدد الاستخدامات: عدد صحيح من 1 إلى 1000')).toBeInTheDocument()
    })
    expect(posts).toHaveLength(1)

    // Invalid days (400 > 365) → Arabic error, no new POST.
    fireEvent.change(screen.getByPlaceholderText('50'), { target: { value: '' } })
    fireEvent.change(screen.getByPlaceholderText('7'), { target: { value: '400' } })
    fireEvent.click(screen.getByRole('button', { name: 'توليد رمز' }))
    await waitFor(() => {
      expect(screen.getByText('عدد الأيام: عدد صحيح من 0 إلى 365')).toBeInTheDocument()
    })
    expect(posts).toHaveLength(1)
  })

  it('hides revoked codes so revoking visibly removes the row', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url)
        if (u.endsWith('/courses/C1/codes')) {
          return new Response(
            JSON.stringify({
              codes: [
                {
                  id: 'code-live',
                  code_prefix: 'LIVE',
                  max_uses: 50,
                  uses_count: 1,
                  expires_at: '2026-12-01T00:00:00Z',
                  created_at: '2026-10-01T00:00:00Z',
                  revoked_at: null,
                },
                {
                  id: 'code-dead',
                  code_prefix: 'DEAD',
                  max_uses: 50,
                  uses_count: 0,
                  expires_at: '2026-12-01T00:00:00Z',
                  created_at: '2026-10-01T00:00:00Z',
                  revoked_at: '2026-10-02T00:00:00Z',
                },
              ],
            }),
            { status: 200 },
          )
        }
        if (u.includes('/enrollments')) {
          return new Response(JSON.stringify({ enrollments: [] }), { status: 200 })
        }
        return new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 })
      }),
    )
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/teach/courses/C1/codes']}>
            <Routes>
              <Route path="/teach/courses/:id/codes" element={<CodesQueuePage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    )
    await waitFor(() => {
      expect(screen.getByText(/LIVE/)).toBeInTheDocument()
    })
    expect(screen.queryByText(/DEAD/)).toBeNull()
  })
})
