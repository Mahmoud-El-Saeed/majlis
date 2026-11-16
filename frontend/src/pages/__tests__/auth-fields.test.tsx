import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LoginPage, ResetPage, SignupPage } from '../Auth'
import { str } from '../../i18n'

vi.mock('../../features/auth/AuthContext', () => ({
  useAuth: () => ({ login: vi.fn() }),
}))

vi.mock('../../components/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

// ResetPage reads the token from window.location, so the test controls the
// real location before rendering inside a router.
function renderPageWithLocation(el: React.ReactNode, location = '') {
  if (location) window.history.replaceState({}, '', `/${location}`)
  else window.history.replaceState({}, '', '/')
  return render(<MemoryRouter>{el}</MemoryRouter>)
}

describe('auth field attributes (ticket 24)', () => {
  it('login: email + current-password autocomplete, show/hide toggle', () => {
    renderPageWithLocation(<LoginPage />)
    const email = screen.getByLabelText(str.email) as HTMLInputElement
    const password = screen.getByLabelText(str.password) as HTMLInputElement
    expect(email).toHaveAttribute('autocomplete', 'email')
    expect(password).toHaveAttribute('autocomplete', 'current-password')
    expect(password.type).toBe('password')

    const toggle = screen.getByRole('button', { name: str.showPassword })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)
    expect(password.type).toBe('text')
    expect(screen.getByRole('button', { name: str.hidePassword })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.click(screen.getByRole('button', { name: str.hidePassword }))
    expect(password.type).toBe('password')
  })

  it('signup: email + name + new-password autocomplete, toggles on both secrets', () => {
    const { container } = renderPageWithLocation(<SignupPage />)
    expect(screen.getByLabelText(str.email)).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByLabelText(str.fullName)).toHaveAttribute('autocomplete', 'name')

    const secrets = container.querySelectorAll<HTMLInputElement>('input[autocomplete="new-password"]')
    expect(secrets.length).toBe(2)
    for (const input of secrets) {
      expect(input.type).toBe('password')
    }
    expect(screen.getAllByRole('button', { name: str.showPassword })).toHaveLength(2)
  })

  it('reset request: email autocomplete; confirm: new-password + toggle', () => {
    const { unmount } = renderPageWithLocation(<ResetPage />)
    expect(screen.getByLabelText(str.email)).toHaveAttribute('autocomplete', 'email')
    unmount()

    const { container } = renderPageWithLocation(<ResetPage />, '?token=abc')
    const secrets = container.querySelectorAll<HTMLInputElement>('input[autocomplete="new-password"]')
    expect(secrets.length).toBe(1)
    expect(secrets[0].type).toBe('password')
    fireEvent.click(screen.getByRole('button', { name: str.showPassword }))
    expect(secrets[0].type).toBe('text')
  })
})
