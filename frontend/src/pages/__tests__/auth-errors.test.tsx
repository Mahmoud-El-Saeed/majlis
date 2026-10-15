import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { LoginPage, VerifyPage } from '../Auth'
import { str } from '../../i18n'

const { mockLogin } = vi.hoisted(() => ({ mockLogin: vi.fn() }))

vi.mock('../../features/auth/AuthContext', () => ({
  useAuth: () => ({ login: mockLogin }),
}))

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  )
}

function fillLogin(email: string, password: string) {
  fireEvent.change(screen.getByLabelText(str.email), { target: { value: email } })
  fireEvent.change(screen.getByLabelText(str.password), { target: { value: password } })
}

function submitLogin() {
  fireEvent.click(screen.getByRole('button', { name: str.login }))
}

describe('login error states', () => {
  beforeEach(() => {
    mockLogin.mockReset()
    vi.unstubAllGlobals()
    window.history.replaceState({}, '', '/')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.history.replaceState({}, '', '/')
  })

  it('wrong credentials show an Arabic error with no verify link', async () => {
    mockLogin.mockRejectedValueOnce(new ApiError(401, 'Incorrect email or password.'))
    renderLogin()
    fillLogin('s@example.com', 'wrong-password')
    submitLogin()
    expect(await screen.findByText(/غير صحيحة/)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('إلى صفحة التفعيل')).not.toBeInTheDocument()
    expect(document.querySelector('a[href*="/verify"]')).toBeNull()
  })

  it('unverified account shows a link to /verify with the email', async () => {
    mockLogin.mockRejectedValueOnce(new ApiError(403, 'Please verify your email before logging in.'))
    renderLogin()
    fillLogin('s@example.com', 'some-password')
    submitLogin()
    const linkText = await screen.findByText('إلى صفحة التفعيل')
    const anchor = linkText.closest('a')
    expect(anchor).not.toBeNull()
    expect(anchor?.getAttribute('href')).toContain('/verify?email=')
    expect(anchor?.getAttribute('href')).toContain(encodeURIComponent('s@example.com'))
  })

  it('typing in either input clears the alert', async () => {
    mockLogin.mockRejectedValue(new ApiError(401, 'Incorrect email or password.'))
    renderLogin()
    fillLogin('s@example.com', 'wrong-password')
    submitLogin()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    // Typing in the email input clears the alert.
    fireEvent.change(screen.getByLabelText(str.email), { target: { value: 'other@example.com' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    // Submit again, then typing in the password input clears it too.
    submitLogin()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(str.password), { target: { value: 'another-password' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('verify page auto-submit', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    window.history.replaceState({}, '', '/')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.history.replaceState({}, '', '/')
  })

  it('auto-submits ?token= and shows success', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (String(url).endsWith('/auth/verify')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      return new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    window.history.replaceState({}, '', '/verify?token=abc')
    render(
      <MemoryRouter>
        <VerifyPage />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
    const verifyCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/auth/verify'))
    expect(verifyCall).toBeDefined()
    expect(String(verifyCall?.[1]?.body)).toContain('abc')
    expect(await screen.findByText(/تم التفعيل/)).toBeInTheDocument()
  })
})
