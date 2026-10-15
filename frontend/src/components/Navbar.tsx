import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { str } from '../i18n'
import { ThemeToggle } from './ThemeToggle'
import logoStar from '../assets/logo-star.svg'

export function Navbar() {
  const { user, logout, isTeacher, isAdmin } = useAuth()
  const nav = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `transition-ui clickable rounded-lg px-2 py-1 hover:opacity-80 ${isActive ? 'font-bold' : ''}`

  // Collapse secondary links into a menu on small screens so the fixed
  // header stays one row and never overlaps page content (pt-28 offset).
  const secondaryLinks = (
    <>
      {(isTeacher || isAdmin) && (
        <NavLink to="/teach" className={linkCls} style={({ isActive }) => (isActive ? { borderBottom: '2px solid var(--gold)' } : undefined)}>
          {str.teacher}
        </NavLink>
      )}
      {isAdmin && (
        <NavLink to="/admin" className={linkCls} style={({ isActive }) => (isActive ? { borderBottom: '2px solid var(--gold)' } : undefined)}>
          {str.admin}
        </NavLink>
      )}
    </>
  )

  return (
    <header
      className="fixed inset-x-4 top-4 z-40 rounded-2xl px-4 py-3 shadow-md backdrop-blur"
      style={{ backgroundColor: 'color-mix(in srgb, var(--surface) 80%, transparent)', border: '1px solid var(--border)' }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2" aria-label="مجلس الرئيسية">
          <span
            className="btn-primary transition-ui flex h-9 w-9 items-center justify-center rounded-xl"
            aria-hidden="true"
          >
            <img src={logoStar} alt="" width={22} height={22} />
          </span>
          <span className="font-heading text-xl font-bold">{str.appName}</span>
        </Link>
        <nav className="flex items-center gap-2 text-sm" aria-label="التنقل">
          {user ? (
            <>
              <NavLink
                to="/dashboard"
                className={linkCls}
                style={({ isActive }) => (isActive ? { borderBottom: '2px solid var(--gold)' } : undefined)}
              >
                {str.myCourses}
              </NavLink>
              <span className="hidden sm:contents">{secondaryLinks}</span>
              <span className="muted-t hidden sm:inline">{user.email}</span>
              <button
                type="button"
                className="transition-ui clickable hidden rounded-lg border px-3 py-1 sm:block"
                style={{ borderColor: 'var(--border)' }}
                onClick={() => {
                  logout()
                  nav('/login')
                }}
              >
                {str.logout}
              </button>
              <span className="sm:hidden">
                <button
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-expanded={menuOpen}
                  aria-label="القائمة"
                  className="transition-ui clickable rounded-lg border px-3 py-1"
                  style={{ borderColor: 'var(--border)' }}
                >
                  ☰
                </button>
              </span>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-primary transition-ui rounded-lg px-4 py-1.5">
                {str.login}
              </Link>
              <Link
                to="/signup"
                className="transition-ui clickable rounded-lg border px-4 py-1.5"
                style={{ borderColor: 'var(--gold)' }}
              >
                {str.signup}
              </Link>
            </>
          )}
          <ThemeToggle />
        </nav>
      </div>
      {user && menuOpen && (
        <div className="mx-auto mt-2 flex max-w-6xl flex-col gap-1 border-t pt-2 text-sm sm:hidden" style={{ borderColor: 'var(--border)' }}>
          <span onClick={() => setMenuOpen(false)} className="contents">
            {secondaryLinks}
          </span>
          <button
            type="button"
            className="transition-ui clickable rounded-lg border px-3 py-1 text-start"
            style={{ borderColor: 'var(--border)' }}
            onClick={() => {
              setMenuOpen(false)
              logout()
              nav('/login')
            }}
          >
            {str.logout}
          </button>
        </div>
      )}
    </header>
  )
}
