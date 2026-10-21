import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { ApiError } from '../api/client'
import { api } from '../api/http'
import { useAuth } from '../features/auth/AuthContext'
import { useLang, type Lang } from '../features/lang/lang'
import { localizeDetail, str } from '../i18n'
import { ThemeToggle } from '../components/ThemeToggle'
import { DynamicButton } from '../components/DynamicButton'
import { HoldButton } from '../components/HoldButton'
import { useToast } from '../components/Toast'

// Account pilot (ticket 18): the ONLY fully bilingual page so far (ar/en).
// Every other page stays Arabic until the full-EN follow-up. Tables below
// carry both languages.
//
// The direction is scoped to this page (ticket 21): the account page renders
// LTR in English and RTL in Arabic, while the document keeps its Arabic RTL
// direction for the rest of the app — so choosing English here cannot reflow
// the dashboard, the course, the lesson, the exam or the teacher pages.
const T = {
  ar: {
    title: 'حسابي',
    profile: 'الملف الشخصي',
    email: str.email,
    fullName: str.fullName,
    role: 'الدور',
    roleName: { admin: 'مدير', teacher: 'معلم', student: 'طالب' } as const,
    appearance: 'المظهر',
    themeDay: str.day,
    themeNight: str.night,
    language: 'اللغة',
    signout: 'تسجيل الخروج',
    signedOut: 'تم تسجيل الخروج — نراك قريبًا',
    back: 'عودة إلى سلاسلي',
    unnamed: '—',
    edit: 'تعديل',
    save: 'حفظ',
    saving: 'جارٍ الحفظ…',
    cancel: 'إلغاء',
    nameBlank: 'الاسم لا يكون فارغًا',
    nameSaved: 'تم حفظ الاسم',
    saveFailed: 'تعذّر الحفظ — حاول مجددًا',
  },
  en: {
    title: 'My account',
    profile: 'Profile',
    email: 'Email',
    fullName: 'Full name',
    role: 'Role',
    roleName: { admin: 'Admin', teacher: 'Teacher', student: 'Student' } as const,
    appearance: 'Appearance',
    themeDay: 'Day',
    themeNight: 'Night',
    language: 'Language',
    signout: 'Sign out',
    signedOut: 'Signed out — see you soon',
    back: 'Back to my courses',
    unnamed: '—',
    edit: 'Edit',
    save: 'Save',
    saving: 'Saving…',
    cancel: 'Cancel',
    nameBlank: 'Name cannot be blank',
    nameSaved: 'Name saved',
    saveFailed: 'Could not save — try again',
  },
} as const

export function accountNavLabel(lang: Lang): string {
  return lang === 'ar' ? 'حسابي' : 'Account'
}

export function AccountPage() {
  const { user, logout, refreshUser } = useAuth()
  const { lang, setLang } = useLang()
  const { toast } = useToast()
  const nav = useNavigate()
  const t = T[lang]

  // Display-name editing (the ONLY self-service profile edit — email and
  // role are fixed server-side; PATCH /auth/me accepts full_name only).
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [nameErr, setNameErr] = useState<string | null>(null)

  const startEdit = () => {
    setDraft(user?.full_name ?? '')
    setNameErr(null)
    setEditing(true)
  }

  const saveName = async () => {
    if (draft.trim() === '') {
      setNameErr(t.nameBlank)
      return
    }
    setSaving(true)
    setNameErr(null)
    try {
      await api.patch('/auth/me', { full_name: draft.trim() })
      await refreshUser()
      setEditing(false)
      toast(t.nameSaved)
    } catch (ex) {
      setNameErr(ex instanceof ApiError ? localizeDetail(ex.detail) : t.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main
      dir={lang === 'en' ? 'ltr' : 'rtl'}
      lang={lang}
      className="mx-auto w-full max-w-2xl px-4 pt-28 sm:px-6"
    >
      <h1 className="font-heading text-2xl font-bold">{t.title}</h1>

      <section aria-label={t.profile} className="card arabesque mt-4 overflow-hidden rounded-2xl">
        <div className="zellige zellige-veil px-5 pt-6 pb-5 text-center">
          <span
            aria-hidden="true"
            className="font-heading mx-auto flex h-20 w-20 items-center justify-center rounded-full text-3xl font-bold"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--primary) 14%, var(--surface))',
              border: '2px solid var(--gold)',
              color: 'var(--primary)',
            }}
          >
            {(user?.full_name?.trim()?.[0] ?? user?.email?.[0] ?? '؟').toUpperCase()}
          </span>
          {editing ? (
            <span className="mx-auto mt-2 flex max-w-sm flex-wrap items-center justify-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                aria-label={t.fullName}
                maxLength={200}
                dir="auto"
                className="font-heading w-full rounded-xl border px-3 py-1.5 text-center text-2xl font-bold transition-ui focus:outline-none"
                style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--gold)' }}
              />
              <DynamicButton
                type="button"
                state={saving ? 'busy' : 'idle'}
                idleLabel={t.save}
                busyLabel={t.saving}
                doneLabel={t.save}
                onClick={saveName}
              />
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="transition-ui clickable text-sm underline"
              >
                {t.cancel}
              </button>
            </span>
          ) : (
            <p className="font-heading mt-2 text-4xl font-bold" dir="auto">
              {user?.full_name || user?.email || t.unnamed}
            </p>
          )}
          {nameErr && (
            <p role="alert" className="mt-1 text-sm" style={{ color: 'var(--secondary)' }}>
              {nameErr}
            </p>
          )}
          {user?.full_name && user?.email && (
            <p className="muted-t mt-0.5 text-sm" dir="ltr">
              {user.email}
            </p>
          )}
          <p className="mt-2 flex items-center justify-center gap-2">
            <span className="badge-primary rounded-full px-3 py-0.5 text-xs font-bold">
              {user ? t.roleName[user.role] : t.unnamed}
            </span>
            {!editing && (
              <button
                type="button"
                onClick={startEdit}
                className="transition-ui clickable rounded-full border px-3 py-0.5 text-xs font-bold"
                style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}
              >
                {t.edit}
              </button>
            )}
          </p>
        </div>
        <div className="gold-rule" aria-hidden="true" />
      </section>

      <section aria-label={t.appearance} className="card mt-4 rounded-2xl p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-heading font-bold">{t.appearance}</h2>
          <ThemeToggle labels={{ dark: t.themeNight, light: t.themeDay }} />
        </div>
      </section>

      <section aria-label={t.language} className="card mt-4 rounded-2xl p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-heading font-bold">{t.language}</h2>
          <div className="flex gap-2" role="group" aria-label={t.language}>
            {(['ar', 'en'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                className={`transition-ui clickable rounded-xl border px-4 py-1.5 text-sm font-bold ${
                  lang === l ? 'btn-primary' : ''
                }`}
                style={lang === l ? undefined : { borderColor: 'var(--border)' }}
              >
                {l === 'ar' ? 'العربية' : 'English'}
              </button>
            ))}
          </div>
        </div>
        <p className="muted-t mt-2 text-xs">
          {lang === 'ar'
            ? 'الواجهة الإنجليزية تجريبية — هذه الصفحة فقط حتى الآن'
            : 'English UI is experimental — this page only, for now'}
        </p>
      </section>

      <section
        aria-label={t.signout}
        className="card mt-4 rounded-2xl p-5"
        style={{
          borderColor: 'var(--secondary)',
          backgroundColor: 'color-mix(in srgb, var(--secondary) 7%, var(--surface))',
        }}
      >
        <h2 className="font-heading font-bold">{t.signout}</h2>
        <div className="mt-3">
          <HoldButton
            holdingLabel={t.signout}
            onFire={() => {
              logout()
              toast(t.signedOut)
              nav('/login', { replace: true })
            }}
          >
            {t.signout}
          </HoldButton>
        </div>
      </section>

      <p className="mt-4 text-center text-sm">
        <Link to="/dashboard" className="underline">
          {t.back}
        </Link>
      </p>
    </main>
  )
}
