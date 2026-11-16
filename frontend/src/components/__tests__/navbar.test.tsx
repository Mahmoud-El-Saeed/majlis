import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Navbar } from '../Navbar'
import { str } from '../../i18n'

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }))

vi.mock('../../features/auth/AuthContext', () => ({
  useAuth: () => mockAuth(),
}))

vi.mock('../../features/lang/lang', () => ({
  useLang: () => ({ lang: 'ar' as const, setLang: vi.fn() }),
}))

function renderNavbar() {
  return render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>,
  )
}

describe('Navbar (ticket 24)', () => {
  it('shows both auth CTAs on one line when anonymous', () => {
    mockAuth.mockReturnValue({ user: null, isTeacher: false, isAdmin: false })
    renderNavbar()
    const login = screen.getByRole('link', { name: str.login })
    const signup = screen.getByRole('link', { name: str.signup })
    expect(login).toHaveAttribute('href', '/login')
    expect(signup).toHaveAttribute('href', '/signup')
    expect(login.className).toMatch(/whitespace-nowrap/)
    expect(signup.className).toMatch(/whitespace-nowrap/)
  })

  it('teacher menu: bar shows حسابي once, dropdown never repeats it', () => {
    mockAuth.mockReturnValue({
      user: { email: 't@example.com', role: 'teacher' },
      isTeacher: true,
      isAdmin: false,
    })
    renderNavbar()
    expect(screen.getByRole('link', { name: 'حسابي' })).toHaveAttribute('href', '/account')
    expect(screen.getByRole('link', { name: str.teacher })).toHaveAttribute('href', '/teach')
    expect(screen.getAllByRole('link', { name: 'حسابي' })).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: str.menu }))
    // The open menu has teacher + admin links only — never a second حسابي.
    expect(screen.getAllByRole('link', { name: 'حسابي' })).toHaveLength(1)
  })

  it('student has no hamburger: nothing to open', () => {
    mockAuth.mockReturnValue({
      user: { email: 's@example.com', role: 'student' },
      isTeacher: false,
      isAdmin: false,
    })
    renderNavbar()
    expect(screen.getByRole('link', { name: 'حسابي' })).toHaveAttribute('href', '/account')
    expect(screen.queryByRole('button', { name: str.menu })).not.toBeInTheDocument()
  })
})
