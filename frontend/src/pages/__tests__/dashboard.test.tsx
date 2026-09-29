import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DashboardPage } from '../Dashboard'

// Integration: enrollment flow entry — empty dashboard shows Arabic empty
// state + always-available Join-with-code box (spec: one account joins N courses).
describe('dashboard enrollment entry', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('empty dashboard shows empty state and join box', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('/dashboard')) {
          return new Response(JSON.stringify({ items: [] }), { status: 200 })
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
    await waitFor(() => {
      expect(screen.getByAltText('لا كتب بعد')).toBeInTheDocument()
    })
    expect(screen.getByText('انضم برمز الكتاب')).toBeInTheDocument()
    expect(screen.getByLabelText('الرمز')).toHaveAttribute('dir', 'ltr')
  })
})
