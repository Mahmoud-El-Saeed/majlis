import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GradebookPage } from '../ExamAuthor'
import { ToastProvider } from '../../components/Toast'

const EXAM = {
  id: 'E1',
  course_id: 'C1',
  lesson_id: null,
  title: 'اختبار الوحدة الأولى',
  description: null,
  attempts_limit: 2,
  duration_minutes: 30,
  open_at: null,
  close_at: null,
  pass_score: 50,
  show_result: 'immediate',
  questions: [],
}

const ROWS = [
  {
    attempt_id: 'A1',
    exam_id: 'E1',
    exam_title: 'اختبار الوحدة الأولى',
    student_id: 'S1',
    student_email: 'named@example.com',
    student_name: 'أحمد الطالب',
    status: 'submitted',
    score: 4,
    max_score: 4,
    is_published: true,
    is_late: false,
    submitted_at: '2026-10-01T00:00:00Z',
    answers: [],
  },
  {
    attempt_id: 'A2',
    exam_id: 'E1',
    exam_title: 'اختبار الوحدة الأولى',
    student_id: 'S2',
    student_email: 'unnamed@example.com',
    student_name: 'unnamed@example.com',
    status: 'submitted',
    score: 2,
    max_score: 4,
    is_published: true,
    is_late: false,
    submitted_at: '2026-10-01T00:00:00Z',
    answers: [],
  },
]

describe('GradebookPage identity', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('names the exam, shows display name with email fallback, and searches both', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url)
        if (u.endsWith('/exams/E1')) {
          return new Response(JSON.stringify(EXAM), { status: 200 })
        }
        if (u.endsWith('/courses/C1/gradebook')) {
          return new Response(JSON.stringify(ROWS), { status: 200 })
        }
        return new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 })
      }),
    )
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/teach/exams/E1/gradebook']}>
            <Routes>
              <Route path="/teach/exams/:examId/gradebook" element={<GradebookPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'سجل الدرجات: اختبار الوحدة الأولى' }),
      ).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByText('أحمد الطالب')).toBeInTheDocument()
    })
    expect(screen.getByText('named@example.com')).toBeInTheDocument()
    expect(screen.getByText('unnamed@example.com')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('بحث'), { target: { value: 'unnamed@example.com' } })
    expect(screen.queryByText('أحمد الطالب')).toBeNull()
    expect(screen.getByText('unnamed@example.com')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('بحث'), { target: { value: 'أحمد' } })
    expect(screen.getByText('أحمد الطالب')).toBeInTheDocument()
    expect(screen.queryByText('unnamed@example.com')).toBeNull()
  })
})
