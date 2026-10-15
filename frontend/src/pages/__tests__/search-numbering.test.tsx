import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DashboardPage } from '../Dashboard'
import type { DashboardOut } from '../../api/types'

const dashboard: DashboardOut = {
  items: [
    {
      course: { id: 'c-1', title: 'شرح كتاب الطهارة', book_title: 'الفقه' },
      enrollment_status: 'owner',
      enrollment: null,
      lesson_count: 5,
      ready_count: 5,
    },
    {
      course: { id: 'c-2', title: 'دروس النحو', book_title: null },
      enrollment_status: 'approved',
      enrollment: null,
      lesson_count: 2,
      ready_count: 1,
    },
  ],
}

// Search + numbering: client-side filter as-you-type, result count,
// "لا نتائج مطابقة" empty state, and full-list numbers stay stable.
describe('dashboard search + numbering', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  function setup() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('/dashboard')) {
          return new Response(JSON.stringify(dashboard), { status: 200 })
        }
        return new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 })
      }),
    )
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  it('numbers cards by full-list position and keeps numbers stable under filter', async () => {
    setup()
    await waitFor(() => {
      expect(screen.getByLabelText('رقم 1')).toBeInTheDocument()
    })
    expect(screen.getByLabelText('رقم 2')).toBeInTheDocument()

    // Filter to the second course: it keeps its full-list number 2.
    fireEvent.change(screen.getByLabelText('بحث'), { target: { value: 'النحو' } })
    expect(screen.queryByText('شرح كتاب الطهارة')).not.toBeInTheDocument()
    expect(screen.getByText('دروس النحو')).toBeInTheDocument()
    expect(screen.queryByLabelText('رقم 1')).not.toBeInTheDocument()
    expect(screen.getByLabelText('رقم 2')).toBeInTheDocument()
    expect(screen.getByText(/عدد النتائج/)).toBeInTheDocument()

    // Non-matching query shows the Arabic empty state.
    fireEvent.change(screen.getByLabelText('بحث'), { target: { value: 'لا شيء هنا' } })
    expect(screen.getByText('لا نتائج مطابقة')).toBeInTheDocument()

    // ✕ clears the search and restores both cards with their numbers.
    fireEvent.click(screen.getByLabelText('مسح البحث'))
    expect(screen.getByText('شرح كتاب الطهارة')).toBeInTheDocument()
    expect(screen.getByLabelText('رقم 1')).toBeInTheDocument()
    expect(screen.getByLabelText('رقم 2')).toBeInTheDocument()
  })

  it('searches by book title too', async () => {
    setup()
    await waitFor(() => {
      expect(screen.getByText('شرح كتاب الطهارة')).toBeInTheDocument()
    })
    fireEvent.change(screen.getByLabelText('بحث'), { target: { value: 'الفقه' } })
    expect(screen.getByText('شرح كتاب الطهارة')).toBeInTheDocument()
    expect(screen.queryByText('دروس النحو')).not.toBeInTheDocument()
    expect(screen.getByLabelText('رقم 1')).toBeInTheDocument()
  })
})
