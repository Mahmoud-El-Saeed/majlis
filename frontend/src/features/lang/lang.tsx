import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

// Account-language pilot (ticket 18): Arabic-first app with an English
// option. Only the account page (and its nav entry) is bilingual so far —
// every other page stays Arabic until the full-EN follow-up.
//
// The choice is scoped (ticket 21): it never touches the document direction.
// <html> stays Arabic RTL for the whole app, and the account page flips ITS
// OWN direction, so picking English cannot reflow the dashboard, the course,
// the lesson, the exam or the teacher pages. Because the document direction
// never changes, a reload can never flash the wrong direction either.
export type Lang = 'ar' | 'en'

const KEY = 'mj_lang'

function initialLang(): Lang {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'en' || v === 'ar') return v
  } catch {
    /* private mode — Arabic default */
  }
  return 'ar'
}

const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: 'ar',
  setLang: () => {},
})

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(initialLang)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, lang)
    } catch {
      /* ignore */
    }
  }, [lang])

  return <LangCtx.Provider value={{ lang, setLang }}>{children}</LangCtx.Provider>
}

export function useLang(): { lang: Lang; setLang: (l: Lang) => void } {
  return useContext(LangCtx)
}
