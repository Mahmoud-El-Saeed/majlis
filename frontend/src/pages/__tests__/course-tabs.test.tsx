import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CoursePage } from '../Course'

function stubCourse() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = String(url)
      if (/\/courses\/C1$/.test(u)) {
        return new Response(JSON.stringify({ id: 'C1', title: 'سلسلة', book_title: null }), {
          status: 200,
        })
      }
      if (u.endsWith('/my-enrollment')) {
        return new Response(JSON.stringify({ status: 'approved' }), { status: 200 })
      }
      if (u.endsWith('/lessons')) {
        return new Response(
          JSON.stringify([
            { id: 'L1', course_id: 'C1', title: 'درس ١', status: 'ready', position: 0 },
          ]),
          { status: 200 },
        )
      }
      if (u.endsWith('/student-exams')) {
        return new Response(
          JSON.stringify([
            {
              id: 'E1',
              course_id: 'C1',
              lesson_id: 'L1',
              title: 'اختبار الدرس',
              attempts_limit: 2,
              duration_minutes: 30,
              pass_score: 50,
              show_result: 'immediate',
              attempts_used: 0,
              attempts_left: 2,
              window_status: 'open',
              has_in_progress: false,
              last_score: null,
            },
            {
              id: 'E2',
              course_id: 'C1',
              lesson_id: null,
              title: 'اختبار عام',
              attempts_limit: 1,
              duration_minutes: null,
              pass_score: 50,
              show_result: 'immediate',
              attempts_used: 0,
              attempts_left: 1,
              window_status: 'open',
              has_in_progress: false,
              last_score: null,
            },
          ]),
          { status: 200 },
        )
      }
      if (u.endsWith('/attachments')) {
        return new Response(JSON.stringify([]), { status: 200 })
      }
      return new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 })
    }),
  )
}

function renderCourse() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/courses/C1']}>
        <Routes>
          <Route path="/courses/:id" element={<CoursePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('course lessons/exams tabs', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows lessons by default; exams behind their tab', async () => {
    stubCourse()
    renderCourse()
    await waitFor(() => {
      expect(screen.getByText('درس ١')).toBeInTheDocument()
    })
    // Exams tab exists with a count; general exam hidden until tab opens.
    const examsTab = screen.getByRole('tab', { name: /الاختبارات/ })
    expect(examsTab).toHaveAttribute('aria-selected', 'false')
    expect(screen.queryByText('اختبار عام')).toBeNull()

    fireEvent.click(examsTab)
    expect(await screen.findByText('اختبار عام')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /الاختبارات/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('lesson card links its exam next to listen', async () => {
    stubCourse()
    renderCourse()
    await waitFor(() => {
      expect(screen.getByText('درس ١')).toBeInTheDocument()
    })
    const card = screen.getByText('درس ١').closest('li')!
    const examLink = within(card).getByRole('link', { name: 'اختبار الدرس' })
    expect(examLink).toHaveAttribute('href', '/exams/E1')
    expect(within(card).getByRole('link', { name: 'استمع' })).toHaveAttribute(
      'href',
      '/lessons/L1',
    )
  })
})
