import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { InviteAcceptPage, SignupPage, passwordScore } from '../Auth'

vi.mock('../../features/auth/AuthContext', () => ({
  useAuth: () => ({ login: vi.fn() }),
}))

function renderInvite(query: string) {
  window.history.replaceState({}, '', `/invite${query}`)
  return render(
    <MemoryRouter>
      <InviteAcceptPage />
    </MemoryRouter>,
  )
}

describe('passwordScore', () => {
  it('scores length, case mix, digits, symbols', () => {
    expect(passwordScore('short')).toBe(0)
    expect(passwordScore('longenough12')).toBe(2)
    expect(passwordScore('Longenough12')).toBe(3)
    expect(passwordScore('Longenough12!')).toBe(4)
  })
})

describe('InviteAcceptPage', () => {
  it('shows NO token field at all — the token stays in the query parameter', () => {
    renderInvite('?token=abc-123')
    expect(screen.queryByLabelText('رمز الدعوة')).toBeNull()
    expect(screen.queryByDisplayValue('abc-123')).toBeNull()
  })

  it('shows an Arabic alert when the link carries no token', () => {
    renderInvite('')
    expect(screen.getByText(/رابط الدعوة ناقص الرمز/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'قبول وإنشاء الحساب' })).toBeNull()
  })

  it('blocks submit on mismatch with an Arabic alert + colorful live meter', () => {
    renderInvite('?token=abc-123')
    fireEvent.change(screen.getByLabelText('الاسم الكامل'), { target: { value: 'شيخ' } })
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
