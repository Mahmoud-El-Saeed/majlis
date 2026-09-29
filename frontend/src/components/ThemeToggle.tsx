import { useEffect, useState } from 'react'
import { str } from '../i18n'

export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try {
      localStorage.setItem('mj_theme', dark ? 'dark' : 'light')
    } catch {
      /* ignore */
    }
  }, [dark])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('mj_theme')
      if (saved === 'dark') setDark(true)
      else if (saved === 'light') setDark(false)
    } catch {
      /* ignore */
    }
  }, [])

  return (
    <button
      type="button"
      onClick={() => setDark((d) => !d)}
      className="transition-ui clickable rounded-full border px-3 py-1 text-sm"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
      aria-pressed={dark}
      aria-label="تبديل المظهر"
    >
      {dark ? str.day : str.night}
    </button>
  )
}
