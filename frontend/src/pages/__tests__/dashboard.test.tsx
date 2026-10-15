import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DashboardPage } from '../Dashboard'

const authState = vi.hoisted(() => ({
  user: null as null | { full_name?: string | null },
}))

vi.mock('../../features/auth/AuthContext', () => ({
  useAuth: () => ({ user: authState.user }),
}))

function stubDashboard() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).endsWith('/dashboard')) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }
      return new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 })
    }),
  )
}

function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function openJoin() {
  fireEvent.click(screen.getByRole('button', { name: 'انضم برمز السلسلة' }))
  await screen.findByRole('dialog', { name: 'انضم برمز السلسلة' })
}

// Integration: enrollment flow entry — empty dashboard shows Arabic empty
// state + join action behind a FAB (spec: one account joins N courses).
describe('dashboard enrollment entry', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    authState.user = null
  })

  it('empty dashboard shows empty state and join FAB opening a modal', async () => {
    stubDashboard()
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByAltText('لا سلاسل بعد')).toBeInTheDocument()
    })
    // Join form is hidden until the FAB opens it.
    expect(screen.queryByLabelText('الرمز')).not.toBeInTheDocument()
    await openJoin()
    expect(screen.getByLabelText('الرمز')).toHaveAttribute('dir', 'ltr')
  })

  it('hides the name field when the account already has a name', async () => {
    authState.user = { full_name: 'أحمد' }
    stubDashboard()
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByAltText('لا سلاسل بعد')).toBeInTheDocument()
    })
    await openJoin()
    expect(screen.queryByLabelText('الاسم المعروض للشيخ')).toBeNull()
    expect(screen.getByText('أحمد')).toBeInTheDocument()
  })

  it('asks for a name only when the account has none', async () => {
    authState.user = { full_name: null }
    stubDashboard()
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByAltText('لا سلاسل بعد')).toBeInTheDocument()
    })
    await openJoin()
    expect(screen.getByLabelText('الاسم المعروض للشيخ')).toBeInTheDocument()
  })
})
