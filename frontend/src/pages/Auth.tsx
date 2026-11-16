import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { api } from '../api/http'
import type { InviteLookupOut } from '../api/types'
import { useAuth } from '../features/auth/AuthContext'
import { inviteStatusAr, localizeDetail, str } from '../i18n'
import { ThemeToggle } from '../components/ThemeToggle'
import { useToast } from '../components/Toast'

export const fieldCls =
  'w-full rounded-xl border px-3 py-2 transition-ui focus:outline-none'
export const fieldStyle = { backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }
export const btnPrimary = 'btn-primary transition-ui w-full rounded-xl px-4 py-2 font-bold'

// Ticket 24: password field with a show/hide control. The label lives
// OUTSIDE this wrapper (htmlFor + id at the call site) so the toggle
// button's own text never folds into the input's accessible name — the
// input is announced as exactly its field label, and the toggle stays a
// separate, clearly named control.
export function PasswordField({
  id,
  value,
  onChange,
  autoComplete,
  minLength,
  ariaInvalid,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  autoComplete: 'current-password' | 'new-password'
  minLength?: number
  ariaInvalid?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <span className="relative block">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        required
        minLength={minLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        aria-invalid={ariaInvalid}
        dir="ltr"
        className={`${fieldCls} pe-12 text-left`}
        style={fieldStyle}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-pressed={show}
        aria-label={show ? str.hidePassword : str.showPassword}
        className="transition-ui clickable absolute end-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg border"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
      >
        {show ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <path d="M6.61 6.61A13.5 13.5 0 0 0 1 12s4 8 11 8a9.74 9.74 0 0 0 5.39-1.61" />
            <line x1="2" y1="2" x2="22" y2="22" />
            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </span>
  )
}

export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-md px-4 pt-28 sm:px-6">
      <div className="card arabesque rounded-2xl p-6">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h1 className="font-heading text-2xl font-bold">{title}</h1>
          <ThemeToggle />
        </div>
        <div className="gold-rule mb-4" />
        {children}
      </div>
    </main>
  )
}

export function LoginPage() {
  const { login } = useAuth()
  const nav = useNavigate()
  const loc = useLocation() as { state?: { from?: unknown } }
  const { toast } = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [verifyLink, setVerifyLink] = useState(false)

  // Preserve deep links (e.g. shared lesson/exam URLs) across login.
  const from =
    typeof loc.state?.from === 'string' && loc.state.from.startsWith('/') && !loc.state.from.startsWith('//')
      ? loc.state.from
      : '/dashboard'

  return (
    <AuthCard title={str.login}>
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault()
          // Manual Arabic validation: native bubbles render English in
          // English-locale browsers, so the form opts out (noValidate).
          if (email.trim() === '' || password === '') {
            setErr(str.missingFields)
            setVerifyLink(false)
            return
          }
          setErr(null)
          setVerifyLink(false)
          try {
            await login(email, password)
            nav(from, { replace: true })
          } catch (ex) {
            const raw = ex instanceof ApiError ? ex.detail : ''
            const msg = ex instanceof ApiError ? localizeDetail(ex.detail) : 'خطأ'
            setErr(msg)
            setVerifyLink(/verify your email/i.test(raw))
            if (ex instanceof ApiError && ex.status === 429) toast(msg)
          }
        }}
      >
        <label className="mb-3 block">
          <span className="mb-1 block text-sm">{str.email}</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setErr(null)
              setVerifyLink(false)
            }}
            className={fieldCls}
            style={fieldStyle}
          />
        </label>
        <div className="mb-4 block">
          <label htmlFor="login-password" className="mb-1 block text-sm">
            {str.password}
          </label>
          <PasswordField
            id="login-password"
            value={password}
            onChange={(v) => {
              setPassword(v)
              setErr(null)
              setVerifyLink(false)
            }}
            autoComplete="current-password"
          />
        </div>
        {err && (
          <div role="alert" className="card mb-3 rounded-2xl p-3 text-sm" style={{ borderColor: 'var(--secondary)' }}>
            <p className="font-bold" style={{ color: 'var(--secondary)' }}>
              تعذّر تسجيل الدخول
            </p>
            <p className="mt-1">{err}</p>
            {verifyLink && (
              <p className="mt-2">
                <Link
                  to={`/verify?email=${encodeURIComponent(email.trim())}`}
                  className="btn-primary transition-ui inline-block rounded-xl px-4 py-1.5"
                >
                  إلى صفحة التفعيل
                </Link>
              </p>
            )}
          </div>
        )}
        <button type="submit" className={btnPrimary}>
          {str.login}
        </button>
      </form>
      <p className="mt-4 text-center text-sm">
        <Link to="/signup" className="underline">
          {str.signup}
        </Link>{' '}
        ·{' '}
        <Link to="/reset" className="underline">
          {str.reset}
        </Link>
      </p>
    </AuthCard>
  )
}

export function SignupPage() {
  const nav = useNavigate()
  const { toast } = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [fullName, setFullName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const match = password === confirm
  const longEnough = password.length >= 8
  const canSubmit = email.trim() !== '' && match && longEnough

  return (
    <AuthCard title={str.signup}>
      {done ? (
        <>
          <p role="status">تم إنشاء الحساب — تحقق من بريدك لتفعيل الحساب ثم سجّل الدخول.</p>
          <Link to="/verify" className="btn-primary transition-ui mt-4 inline-block rounded-xl px-6 py-2">
            إلى التفعيل
          </Link>
        </>
      ) : (
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault()
            if (email.trim() === '' || password === '' || confirm === '') {
              setErr(str.missingFields)
              return
            }
            if (!match) {
              setErr(str.passwordMismatch)
              return
            }
            if (password.length < 8) {
              setErr(str.passwordMin)
              return
            }
            setErr(null)
            try {
              await api.post('/auth/signup', { email, password, full_name: fullName || undefined })
              setDone(true)
            } catch (ex) {
              const msg = ex instanceof ApiError ? localizeDetail(ex.detail) : 'خطأ'
              setErr(msg)
              if (ex instanceof ApiError && ex.status === 429) toast(msg)
            }
          }}
        >
          <label className="mb-3 block">
            <span className="mb-1 block text-sm">{str.email}</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldCls} style={fieldStyle} />
          </label>
          <label className="mb-3 block">
            <span className="mb-1 block text-sm">{str.fullName}</span>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" className={fieldCls} style={fieldStyle} />
          </label>
          <div className="mb-3 block">
            <label htmlFor="signup-password" className="mb-1 block text-sm">
              {str.passwordMinLabel}
            </label>
            <PasswordField id="signup-password" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} />
          </div>
          <div className="mb-3 block">
            <label htmlFor="signup-confirm" className="mb-1 block text-sm">
              {str.confirmPassword}
            </label>
            <PasswordField id="signup-confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" ariaInvalid={confirm !== '' && !match} />
          </div>
          <div className="mb-4">
            <PasswordStrength value={password} />
          </div>
          {confirm !== '' && !match && (
            <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--secondary)' }}>
              {str.passwordMismatch}
            </p>
          )}
          {err && (
            <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--secondary)' }}>
              {err}
            </p>
          )}
          <button type="submit" disabled={!canSubmit} className={btnPrimary}>
            {str.signup}
          </button>
        </form>
      )}
      <p className="mt-4 text-center text-sm">
        <button type="button" className="underline" onClick={() => nav('/login')}>
          {str.login}
        </button>
      </p>
    </AuthCard>
  )
}

export function VerifyPage() {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [msg, setMsg] = useState('')
  const [token, setToken] = useState(() => new URLSearchParams(window.location.search).get('token') ?? '')
  const [hintEmail] = useState(() => new URLSearchParams(window.location.search).get('email') ?? '')
  const autoTried = useRef(false)

  const submitToken = useCallback(async (t: string) => {
    if (t.trim() === '') {
      setState('fail')
      setMsg(str.missingFields)
      return
    }
    try {
      await api.post('/auth/verify', { token: t })
      setState('ok')
    } catch (ex) {
      setState('fail')
      setMsg(ex instanceof ApiError ? localizeDetail(ex.detail) : 'انتهت صلاحية الرابط أو غير صالح')
    }
  }, [])

  // Email links carry ?token= — activate immediately without an extra click.
  useEffect(() => {
    if (token && !autoTried.current) {
      autoTried.current = true
      void submitToken(token)
    }
  }, [token, submitToken])

  return (
    <AuthCard title={str.verify}>
      {hintEmail && state !== 'ok' && (
        <p className="muted-t mb-3 text-sm">رمز التفعيل المرسل إلى <span dir="ltr">{hintEmail}</span></p>
      )}
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault()
          await submitToken(token)
        }}
      >
        <label className="mb-4 block">
          <span className="mb-1 block text-sm">رمز التفعيل</span>
          <input value={token} onChange={(e) => setToken(e.target.value)} id="verify-token" name="token" dir="ltr" className={fieldCls} style={fieldStyle} required />
        </label>
        {state === 'ok' && <p role="status">تم التفعيل — سجّل الدخول الآن.</p>}
        {state === 'fail' && (
          <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--secondary)' }}>
            {msg}
          </p>
        )}
        <button type="submit" className={btnPrimary}>
          {str.verify}
        </button>
      </form>
      <p className="mt-4 text-center text-sm">
        <Link to="/login" className="underline">
          {str.login}
        </Link>
      </p>
    </AuthCard>
  )
}

export function ResetPage() {
  const [email, setEmail] = useState('')
  const [emailErr, setEmailErr] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') ?? '')

  if (token) {
    return (
      <AuthCard title="كلمة مرور جديدة">
        {done ? (
          <p role="status">تم التحديث — سجّل الدخول.</p>
        ) : (
          <form
            noValidate
            onSubmit={async (e) => {
              e.preventDefault()
              if (newPassword.length < 8) {
                setErr(str.passwordMin)
                return
              }
              setErr(null)
              try {
                await api.post('/auth/password-reset/confirm', { token, new_password: newPassword })
                setDone(true)
              } catch (ex) {
                setErr(ex instanceof ApiError ? localizeDetail(ex.detail) : 'الرابط غير صالح')
              }
            }}
          >
            <div className="mb-4 block">
              <label htmlFor="reset-password" className="mb-1 block text-sm">
                {str.passwordMinLabel}
              </label>
              <PasswordField id="reset-password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" minLength={8} />
            </div>
            {err && (
              <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--secondary)' }}>
                {err}
              </p>
            )}
            <button type="submit" className={btnPrimary}>
              حفظ
            </button>
          </form>
        )}
      </AuthCard>
    )
  }

  return (
    <AuthCard title={str.reset}>
      {sent ? (
        <p role="status">إن كان البريد مسجلًا ستصلك رسالة — تحقق من صندوقك.</p>
      ) : (
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault()
            if (email.trim() === '') {
              setSent(false)
              setEmailErr(str.missingFields)
              return
            }
            setEmailErr(null)
            await api.post('/auth/password-reset/request', { email })
            setSent(true)
          }}
        >
          <label className="mb-4 block">
            <span className="mb-1 block text-sm">{str.email}</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldCls} style={fieldStyle} />
          </label>
          {emailErr && (
            <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--secondary)' }}>
              {emailErr}
            </p>
          )}
          <button type="submit" className={btnPrimary}>
            إرسال الرابط
          </button>
        </form>
      )}
    </AuthCard>
  )
}

export function passwordScore(pw: string): number {
  // Advisory strength (backend enforces min 8): long + mixed case + digit + symbol.
  let score = 0
  if (pw.length >= 12) score += 1
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1
  if (/\d/.test(pw)) score += 1
  if (/[^A-Za-z0-9]/.test(pw)) score += 1
  return score
}

export function PasswordStrength({ value }: { value: string }) {
  const score = passwordScore(value)
  const label = score <= 1 ? str.pwWeak : score === 2 ? str.pwFair : score === 3 ? str.pwGood : str.pwStrong
  // Colorful progress: terracotta → gold → sage → turquoise (decorative
  // segments, never text — readable in both modes by design).
  const colors = ['#C1543D', '#D99A26', '#7FB069', '#1E847F']
  return (
    <div>
      <div
        role="meter"
        aria-label={str.pwStrength}
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={score}
        aria-valuetext={label}
        className="flex gap-1"
      >
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            aria-hidden="true"
            className="h-1.5 flex-1 rounded-full transition-ui"
            style={{
              backgroundColor: i < score ? colors[i] : 'var(--border)',
            }}
          />
        ))}
      </div>
      <p className="muted-t mt-1 text-xs">
        {str.pwStrength}: {label} · {str.pwTip}
      </p>
    </div>
  )
}

export function InviteAcceptPage() {
  const nav = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [fullName, setFullName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  // The token lives ONLY in the query parameter — no token field in the form
  // at all, so password managers never see it and it cannot be mistyped.
  const [queryToken] = useState(() => new URLSearchParams(window.location.search).get('token') ?? '')
  const token = queryToken.trim()
  const match = password === confirm
  const longEnough = password.length >= 8
  const canSubmit = token !== '' && match && longEnough
  const lookup = useQuery({
    queryKey: ['invite-lookup', token],
    queryFn: () =>
      api.get<InviteLookupOut>(`/invites/lookup?token=${encodeURIComponent(token)}`),
    enabled: token !== '',
    retry: false,
  })

  if (token === '') {
    return (
      <AuthCard title="قبول دعوة معلم">
        <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--secondary)' }}>
          رابط الدعوة ناقص الرمز — افتح الرابط الكامل من بريد الدعوة.
        </p>
        <Link to="/login" className="underline">
          {str.login}
        </Link>
      </AuthCard>
    )
  }

  if (lookup.isPending) {
    return (
      <AuthCard title="قبول دعوة معلم">
        <p role="status" className="text-sm">
          جار التحقق من الدعوة…
        </p>
      </AuthCard>
    )
  }

  if (lookup.isError) {
    const e = lookup.error
    const message = e instanceof ApiError ? localizeDetail(e.detail) : str.unexpectedError
    const isUnknownLink = e instanceof ApiError && e.status === 404
    return (
      <AuthCard title="قبول دعوة معلم">
        <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--secondary)' }}>
          {message}
        </p>
        {!isUnknownLink && (
          <button
            type="button"
            onClick={() => lookup.refetch()}
            className="btn-secondary transition-ui mb-3 rounded-xl px-4 py-2"
          >
            {str.retry}
          </button>
        )}
        <Link to="/login" className="underline">
          {str.login}
        </Link>
      </AuthCard>
    )
  }

  const invite = lookup.data
  if (!invite) {
    return (
      <AuthCard title="قبول دعوة معلم">
        <p role="status" className="text-sm">
          جار التحقق من الدعوة…
        </p>
      </AuthCard>
    )
  }

  if (invite.status !== 'active') {
    return (
      <AuthCard title="قبول دعوة معلم">
        <p className="mb-3 text-sm">
          الدعوة موجّهة إلى <span dir="ltr" className="font-bold">{invite.email}</span>
        </p>
        <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--secondary)' }}>
          {inviteStatusAr[invite.status]}
        </p>
        <Link to="/login" className="underline">
          {str.login}
        </Link>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="قبول دعوة معلم">
      <p className="mb-3 text-sm">
        الدعوة موجّهة إلى <span dir="ltr" className="font-bold">{invite.email}</span>
      </p>
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault()
          // Name stays optional like the API (full_name || undefined) — only
          // the token + matching passwords gate the submit.
          if (password === '' || confirm === '') {
            setErr(str.missingFields)
            return
          }
          if (!match) {
            setErr(str.passwordMismatch)
            return
          }
          if (!longEnough) {
            setErr(str.passwordMin)
            return
          }
          setErr(null)
          try {
            await api.post('/invites/accept', { token, password, full_name: fullName || undefined })
            nav('/login')
          } catch (ex) {
            setErr(ex instanceof ApiError ? localizeDetail(ex.detail) : 'الدعوة منتهية أو مستخدمة')
          }
        }}
      >
        <label className="mb-3 block">
          <span className="mb-1 block text-sm">{str.fullName}</span>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
            className={fieldCls}
            style={fieldStyle}
          />
        </label>
        <div className="mb-3 block">
          <label htmlFor="invite-password" className="mb-1 block text-sm">
            {str.passwordMinLabel}
          </label>
          <PasswordField id="invite-password" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} />
        </div>
        <div className="mb-3 block">
          <label htmlFor="invite-confirm" className="mb-1 block text-sm">
            {str.confirmPassword}
          </label>
          <PasswordField id="invite-confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" ariaInvalid={confirm !== '' && !match} />
        </div>
        <div className="mb-4">
          <PasswordStrength value={password} />
        </div>
        {confirm !== '' && !match && (
          <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--secondary)' }}>
            {str.passwordMismatch}
          </p>
        )}
        {err && (
          <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--secondary)' }}>
            {err}
          </p>
        )}
        <button type="submit" disabled={!canSubmit} className={btnPrimary}>
          قبول وإنشاء الحساب
        </button>
      </form>
    </AuthCard>
  )
}
