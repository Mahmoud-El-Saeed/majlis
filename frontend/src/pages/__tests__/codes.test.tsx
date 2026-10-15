import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
})
