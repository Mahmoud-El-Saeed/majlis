import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { LangProvider, useLang } from '../lang'

// Seam: the language choice (ticket 21) — it is scoped to the account page,
// so it must never touch the document direction: the rest of the app is
// Arabic RTL and choosing English may not reflow it.

function Probe() {
  const { lang, setLang } = useLang()
  return (
    <button type="button" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>
      {lang}
    </button>
  )
}

describe('language choice', () => {
  beforeEach(() => {
    try {
      localStorage.removeItem('mj_lang')
    } catch {
      /* ignore */
    }
    document.documentElement.lang = 'ar'
    document.documentElement.dir = 'rtl'
  })

  it('defaults to Arabic and keeps the document RTL', () => {
    render(
      <LangProvider>
        <Probe />
      </LangProvider>,
    )
    expect(screen.getByRole('button')).toHaveTextContent('ar')
    expect(document.documentElement.dir).toBe('rtl')
  })

  it('persists the choice without touching the document direction', () => {
    render(
      <LangProvider>
        <Probe />
      </LangProvider>,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button')).toHaveTextContent('en')
    expect(localStorage.getItem('mj_lang')).toBe('en')
    // The document is still Arabic RTL: the choice is scoped to the account
    // page, so the dashboard, course, lesson, exam and teacher pages keep
    // their direction and layout.
    expect(document.documentElement.dir).toBe('rtl')
    expect(document.documentElement.lang).toBe('ar')
  })

  it('reads the stored choice back on mount', () => {
    localStorage.setItem('mj_lang', 'en')
    render(
      <LangProvider>
        <Probe />
      </LangProvider>,
    )
    expect(screen.getByRole('button')).toHaveTextContent('en')
    expect(document.documentElement.dir).toBe('rtl')
  })

  it('survives a private-mode storage failure', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    try {
      render(
        <LangProvider>
          <Probe />
        </LangProvider>,
      )
      fireEvent.click(screen.getByRole('button'))
      expect(screen.getByRole('button')).toHaveTextContent('en')
    } finally {
      getItem.mockRestore()
      setItem.mockRestore()
    }
  })
})
