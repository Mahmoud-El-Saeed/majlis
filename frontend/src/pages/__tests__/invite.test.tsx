import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { InviteAcceptPage, SignupPage, passwordScore } from '../Auth'

vi.mock('../../features/auth/AuthContext', () => ({
  useAuth: () => ({ login: vi.fn() }),
}))

type LookupStub = { body: unknown; status?: number }

function stubLookup(stub: LookupStub) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('/invites/lookup')) {
        return new Response(JSON.stringify(stub.body), { status: stub.status ?? 200 })
      }
      return new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 })
    }),
  )
}

function renderInvite(query: string, lookup?: LookupStub) {
  if (lookup) stubLookup(lookup)
  window.history.replaceState({}, '', `/invite${query}`)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <InviteAcceptPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('passwordScore', () => {
  it('scores length, case mix, digits, symbols', () => {
    expect(passwordScore('short')).toBe(0)
    expect(passwordScore('longenough12')).toBe(2)
    expect(passwordScore('Longenough12')).toBe(3)
    expect(passwordScore('Longenough12!')).toBe(4)
  })
})

describe('InviteAcceptPage', () => {
  it('shows NO token field at all — the token stays in the query parameter', async () => {
    renderInvite('?token=abc-123', {
      body: { email: 'teacher@example.com', status: 'active' },
    })
    await screen.findByLabelText('الاسم الكامل')
    expect(screen.queryByLabelText('رمز الدعوة')).toBeNull()
    expect(screen.queryByDisplayValue('abc-123')).toBeNull()
  })

  it('shows an Arabic alert when the link carries no token', () => {
    renderInvite('')
    expect(screen.getByText(/رابط الدعوة ناقص الرمز/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'قبول وإنشاء الحساب' })).toBeNull()
  })

  it('blocks submit on mismatch with an Arabic alert + colorful live meter', async () => {
    renderInvite('?token=abc-123', {
      body: { email: 'teacher@example.com', status: 'active' },
    })
    fireEvent.change(await screen.findByLabelText('الاسم الكامل'), { target: { value: 'شيخ' } })
    fireEvent.change(screen.getByLabelText('كلمة المرور (8+ أحرف)'), {
      target: { value: 'Longenough12!' },
    })
    fireEvent.change(screen.getByLabelText('تأكيد كلمة المرور'), {
      target: { value: 'different12!' },
    })
    expect(screen.getByText('كلمتا المرور غير متطابقتين')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'قبول وإنشاء الحساب' })).toBeDisabled()
    const meter = screen.getByRole('meter', { name: 'قوة كلمة المرور' })
    expect(meter).toHaveAttribute('aria-valuenow', '4')
    // Colorful progress: weakest segment terracotta, strongest turquoise
    // (jsdom normalizes hex to rgb in the style attribute).
    const segments = meter.querySelectorAll('span')
    expect(segments[0].getAttribute('style')).toContain('rgb(193, 84, 61)')
    expect(segments[3].getAttribute('style')).toContain('rgb(30, 132, 127)')
  })

  it('displays the invited email before the acceptance form', async () => {
    renderInvite('?token=abc-123', {
      body: { email: 'teacher@example.com', status: 'active' },
    })
    expect(await screen.findByText('teacher@example.com')).toBeInTheDocument()
    expect(screen.getByLabelText('الاسم الكامل')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'قبول وإنشاء الحساب' })).toBeInTheDocument()
  })

  it.each([
    ['used', 'استُخدم رابط الدعوة من قبل'],
    ['revoked', 'أُلغي رابط الدعوة'],
    ['expired', 'انتهت صلاحية رابط الدعوة'],
  ])('shows the invited email and specific Arabic for a %s invite, without the form', async (status, message) => {
    renderInvite('?token=abc-123', {
      body: { email: 'teacher@example.com', status },
    })
    expect(await screen.findByText('teacher@example.com')).toBeInTheDocument()
    expect(screen.getByText(message)).toBeInTheDocument()
    expect(screen.queryByLabelText('الاسم الكامل')).toBeNull()
    expect(screen.queryByRole('button', { name: 'قبول وإنشاء الحساب' })).toBeNull()
  })

  it('shows specific Arabic for an unknown invite link, without the form', async () => {
    renderInvite('?token=forged-token', {
      body: { detail: 'Invalid invite link.' },
      status: 404,
    })
    expect(await screen.findByText('رابط الدعوة غير صالح')).toBeInTheDocument()
    expect(screen.queryByLabelText('الاسم الكامل')).toBeNull()
    expect(screen.queryByRole('button', { name: 'قبول وإنشاء الحساب' })).toBeNull()
  })
})

describe('SignupPage confirmation', () => {
  it('requires matching confirmation before submit', () => {
    window.history.replaceState({}, '', '/signup')
    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText('البريد الإلكتروني'), {
      target: { value: 's@example.com' },
    })
    fireEvent.change(screen.getByLabelText('كلمة المرور (8+ أحرف)'), {
      target: { value: 'Longenough12!' },
    })
    fireEvent.change(screen.getByLabelText('تأكيد كلمة المرور'), {
      target: { value: 'mismatch12!' },
    })
    expect(screen.getByText('كلمتا المرور غير متطابقتين')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'حساب جديد' })).toBeDisabled()
    expect(screen.getByRole('meter', { name: 'قوة كلمة المرور' })).toBeInTheDocument()
  })
})
