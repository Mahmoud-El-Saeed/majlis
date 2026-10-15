import { useEffect, useState } from 'react'
import { str } from '../i18n'

export function ThemeToggle({ labels }: { labels?: { dark: string; light: string } } = {}) {
  // The pre-paint script in index.html already applied the stored/OS theme
  // to <html>, so the toggle just mirrors the DOM and persists on change —
  // no load effect (the old load-vs-save race reset the theme on refresh).
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try {
      localStorage.setItem('mj_theme', dark ? 'dark' : 'light')
    } catch {
      /* ignore */
    }
  }, [dark])

  return (
    <button
      type="button"
      onClick={() => setDark((d) => !d)}
      className="transition-ui clickable rounded-full border px-3 py-1 text-sm"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
      aria-pressed={dark}
      aria-label="تبديل المظهر"
    >
      {dark ? (labels?.light ?? str.day) : (labels?.dark ?? str.night)}
    </button>
  )
}
