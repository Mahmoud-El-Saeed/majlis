import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HomePage } from '../Home'
import { str } from '../../i18n'

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }))

vi.mock('../../features/auth/AuthContext', () => ({
  useAuth: () => mockAuth(),
}))

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  )
}

describe('landing auth CTAs (ticket 24)', () => {
  it('anonymous visitors are asked to sign up or log in', () => {
    mockAuth.mockReturnValue({ user: null, loading: false })
    renderHome()
    expect(screen.getByRole('link', { name: str.signup })).toHaveAttribute('href', '/signup')
    expect(screen.getByRole('link', { name: str.login })).toHaveAttribute('href', '/login')
  })

  it('signed-in users go straight to the dashboard — no auth prompts', () => {
    mockAuth.mockReturnValue({
      user: { email: 's@example.com', role: 'student' },
      loading: false,
    })
    renderHome()
    expect(screen.getByRole('link', { name: str.goToDashboard })).toHaveAttribute(
      'href',
      '/dashboard',
    )
    expect(screen.queryByRole('link', { name: str.signup })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: str.login })).not.toBeInTheDocument()
  })

  it('while auth loads, no auth CTA flashes', () => {
    mockAuth.mockReturnValue({ user: null, loading: true })
    renderHome()
    expect(screen.queryByRole('link', { name: str.signup })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: str.login })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: str.goToDashboard })).not.toBeInTheDocument()
  })
})
