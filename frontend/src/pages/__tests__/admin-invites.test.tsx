import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AdminPage } from '../Admin'
import { ToastProvider } from '../../components/Toast'

type Invite = {
  id: string
  email: string
  status: 'active' | 'used' | 'revoked' | 'expired'
  expires_at: string
  used_at: string | null
  revoked_at: string | null
  created_at: string
}

const FUTURE = '2027-01-01T00:00:00Z'
const PAST = '2020-01-01T00:00:00Z'
const STAMP = '2026-10-01T00:00:00Z'

function invite(partial: Partial<Invite> & Pick<Invite, 'id' | 'email'>): Invite {
  return {
    status: 'active',
    expires_at: FUTURE,
    used_at: null,
    revoked_at: null,
    created_at: STAMP,
    ...partial,
  }
}

describe('AdminPage invite lifecycle', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('labels every invite state, keeps history visible, and revokes an unused invite', async () => {
    let invites: Invite[] = [
      invite({ id: 'I1', email: 'active@example.com', status: 'active' }),
      invite({ id: 'I2', email: 'used@example.com', status: 'used', used_at: STAMP }),
      invite({ id: 'I3', email: 'revoked@example.com', status: 'revoked', revoked_at: STAMP }),
      invite({ id: 'I4', email: 'expired@example.com', status: 'expired', expires_at: PAST }),
    ]
    const posts: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url)
        const method = (init?.method ?? 'GET').toUpperCase()
        if (u.endsWith('/invites') && method === 'GET') {
          return new Response(JSON.stringify({ invites }), { status: 200 })
        }
        if (u.endsWith('/invites/I1/revoke') && method === 'POST') {
          posts.push(u)
          invites = invites.map((inv) =>
            inv.id === 'I1'
              ? { ...inv, status: 'revoked' as const, revoked_at: '2026-10-02T00:00:00Z' }
              : inv,
          )
          return new Response(
            JSON.stringify({
              id: 'I1',
              email: 'active@example.com',
              revoked_at: '2026-10-02T00:00:00Z',
            }),
            { status: 200 },
          )
        }
        return new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 })
      }),
    )
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <MemoryRouter>
            <AdminPage />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    )

    await screen.findByText('active@example.com')
    expect(screen.getByText('بانتظار القبول')).toBeInTheDocument()
    expect(screen.getByText('استُخدم رابط الدعوة من قبل')).toBeInTheDocument()
    expect(screen.getByText('أُلغي رابط الدعوة')).toBeInTheDocument()
    expect(screen.getByText('انتهت صلاحية رابط الدعوة')).toBeInTheDocument()

    const activeRow = screen.getByText('active@example.com').closest('li') as HTMLElement
    fireEvent.click(within(activeRow).getByRole('button', { name: 'إلغاء الدعوة' }))
    expect(await screen.findByRole('dialog', { name: 'إلغاء الدعوة' })).toBeInTheDocument()
    const holdBtn = screen.getByRole('button', { name: 'اضغط مطولًا — إلغاء الدعوة' })
    fireEvent.keyDown(holdBtn, { key: 'Enter' })
    await waitFor(() => expect(posts).toHaveLength(1), { timeout: 4000 })
    await waitFor(() => {
      expect(screen.getByText('active@example.com').closest('li')?.textContent).toContain(
        'أُلغي رابط الدعوة',
      )
    })
    expect(screen.getByText('used@example.com')).toBeInTheDocument()
    expect(screen.getByText('revoked@example.com')).toBeInTheDocument()
  })
})
