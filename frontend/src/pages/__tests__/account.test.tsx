import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AccountPage } from '../Account'
import { LangProvider } from '../../features/lang/lang'

const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
  refreshUser: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('../../features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 's@example.com', full_name: 'أحمد', role: 'student', is_verified: true },
    logout: mocks.logout,
    refreshUser: mocks.refreshUser,
    isAdmin: false,
    isTeacher: false,
  }),
}))

vi.mock('../../components/Toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}))

function renderAccount() {
  return render(
    <MemoryRouter initialEntries={['/account']}>
      <LangProvider>
        <AccountPage />
      </LangProvider>
    </MemoryRouter>,
  )
}

describe('AccountPage', () => {
  beforeEach(() => {
    mocks.logout.mockReset()
    mocks.refreshUser.mockReset()
    mocks.toast.mockReset()
    try {
      localStorage.removeItem('mj_lang')
    } catch {
      /* ignore */
    }
    document.documentElement.lang = 'ar'
    document.documentElement.dir = 'rtl'
    // NOTE: fake timers only inside the hold test — waitFor deadlocks otherwise.
  })

  it('shows profile info with email only here (not elsewhere)', () => {
    renderAccount()
    expect(screen.getByText('s@example.com')).toBeInTheDocument()
    // Name is the hero: header title only (the row is gone); email small below.
    expect(screen.getByText('أحمد')).toBeInTheDocument()
    expect(screen.queryByText('مفعّل')).toBeNull()
  })

  it('language toggle flips to English + LTR', async () => {
    renderAccount()
    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'My account' })).toBeInTheDocument()
    })
    expect(document.documentElement.dir).toBe('ltr')
    expect(document.documentElement.lang).toBe('en')
    expect(screen.getByRole('heading', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('edits only the display name via PATCH /auth/me', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAccount()
    fireEvent.click(screen.getByRole('button', { name: 'تعديل' }))
    const input = screen.getByLabelText('الاسم الكامل')
    fireEvent.change(input, { target: { value: 'اسم جديد' } })
    fireEvent.click(screen.getByRole('button', { name: 'حفظ' }))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
    const patchCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/auth/me'))
    expect(patchCall).toBeDefined()
    expect(String(patchCall?.[1]?.body)).toContain('اسم جديد')
    await waitFor(() => {
      expect(mocks.refreshUser).toHaveBeenCalled()
    })
    expect(mocks.toast).toHaveBeenCalledWith('تم حفظ الاسم')
    vi.unstubAllGlobals()
  })

  it('blank names are rejected client-side in Arabic', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderAccount()
    fireEvent.click(screen.getByRole('button', { name: 'تعديل' }))
    fireEvent.change(screen.getByLabelText('الاسم الكامل'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'حفظ' }))
    expect(screen.getByText('الاسم لا يكون فارغًا')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('hold-to-logout signs out with a confirmation toast', () => {
    vi.useFakeTimers()
    try {
      renderAccount()
      const btn = screen.getByRole('button', { name: 'تسجيل الخروج' })
      btn.focus()
      fireEvent.keyDown(btn, { key: 'Enter' })
      act(() => {
        vi.advanceTimersByTime(1600)
      })
      expect(mocks.logout).toHaveBeenCalledTimes(1)
      expect(mocks.toast).toHaveBeenCalledWith('تم تسجيل الخروج — نراك قريبًا')
    } finally {
      vi.useRealTimers()
    }
  })
})
