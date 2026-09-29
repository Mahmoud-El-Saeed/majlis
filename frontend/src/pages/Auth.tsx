import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { api } from '../api/http'
import { useAuth } from '../features/auth/AuthContext'
import { localizeDetail, str } from '../i18n'
import { useToast } from '../components/Toast'

export const fieldCls =
  'w-full rounded-xl border px-3 py-2 transition-ui focus:outline-none'
export const fieldStyle = { backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }
export const btnPrimary = 'btn-primary transition-ui w-full rounded-xl px-4 py-2 font-bold'

export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-md px-4 pt-28 sm:px-6">
      <div className="card arabesque rounded-2xl p-6">
        <h1 className="font-heading mb-1 text-2xl font-bold">{title}</h1>
        <div className="gold-rule mb-4" />
        {children}
      </div>
    </main>
  )
}

export function LoginPage() {
  const { login } = useAuth()
  const nav = useNavigate()
  const { toast } = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)

  return (
    <AuthCard title={str.login}>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          setErr(null)
          try {
            await login(email, password)
            nav('/dashboard')
          } catch (ex) {
            const msg = ex instanceof ApiError ? localizeDetail(ex.detail) : 'خطأ'
            setErr(msg)
            if (ex instanceof ApiError && ex.status === 429) toast(msg)
          }
        }}
      >
        <label className="mb-3 block">
          <span className="mb-1 block text-sm">{str.email}</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldCls}
            style={fieldStyle}
          />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-sm">{str.password}</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={fieldCls}
            style={fieldStyle}
          />
        </label>
        {err && (
          <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--secondary)' }}>
            {err}
          </p>
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
  const [fullName, setFullName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  return (
    <AuthCard title={str.signup}>
      {done ? (
        <p role="status">تم إنشاء الحساب — تحقق من بريدك لتفعيل الحساب ثم سجّل الدخول.</p>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            setErr(null)
            try {
              await api.post('/auth/signup', { email, password, full_name: fullName || undefined })
              setDone(true)
            } catch (ex) {
              const msg = ex instanceof ApiError ? localizeDetail(ex.detail) : 'خطأ'
              setErr(msg)
              if (ex instanceof ApiError && ex.status === 429) toast(msg)
              if (ex instanceof ApiError && ex.status === 502) setErr('تعذّر إرسال البريد — أعد المحاولة')
            }
          }}
        >
          <label className="mb-3 block">
            <span className="mb-1 block text-sm">{str.email}</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={fieldCls} style={fieldStyle} />
          </label>
          <label className="mb-3 block">
            <span className="mb-1 block text-sm">{str.fullName}</span>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={fieldCls} style={fieldStyle} />
          </label>
          <label className="mb-4 block">
            <span className="mb-1 block text-sm">{str.password} (8+ أحرف)</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldCls}
              style={fieldStyle}
            />
          </label>
          {err && (
            <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--secondary)' }}>
              {err}
            </p>
          )}
          <button type="submit" className={btnPrimary}>
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

  return (
    <AuthCard title={str.verify}>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          try {
            await api.post('/auth/verify', { token })
            setState('ok')
          } catch (ex) {
            setState('fail')
            setMsg(ex instanceof ApiError ? localizeDetail(ex.detail) : 'انتهت صلاحية الرابط أو غير صالح')
          }
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
            onSubmit={async (e) => {
              e.preventDefault()
              setErr(null)
              try {
                await api.post('/auth/password-reset/confirm', { token, new_password: newPassword })
                setDone(true)
              } catch (ex) {
                setErr(ex instanceof ApiError ? localizeDetail(ex.detail) : 'الرابط غير صالح')
              }
            }}
          >
            <label className="mb-4 block">
              <span className="mb-1 block text-sm">{str.password} (8+ أحرف)</span>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={fieldCls}
                style={fieldStyle}
              />
            </label>
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
          onSubmit={async (e) => {
            e.preventDefault()
            await api.post('/auth/password-reset/request', { email })
            setSent(true)
          }}
        >
          <label className="mb-4 block">
            <span className="mb-1 block text-sm">{str.email}</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={fieldCls} style={fieldStyle} />
          </label>
          <button type="submit" className={btnPrimary}>
            إرسال الرابط
          </button>
        </form>
      )}
    </AuthCard>
  )
}

export function InviteAcceptPage() {
  const nav = useNavigate()
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [token, setToken] = useState(() => new URLSearchParams(window.location.search).get('token') ?? '')

  return (
    <AuthCard title="قبول دعوة معلم">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
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
          <span className="mb-1 block text-sm">رمز الدعوة</span>
          <input value={token} onChange={(e) => setToken(e.target.value)} id="invite-token" dir="ltr" className={fieldCls} style={fieldStyle} required />
        </label>
        <label className="mb-3 block">
          <span className="mb-1 block text-sm">{str.fullName}</span>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={fieldCls} style={fieldStyle} />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-sm">{str.password} (8+ أحرف)</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={fieldCls}
            style={fieldStyle}
          />
        </label>
        {err && (
          <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--secondary)' }}>
            {err}
          </p>
        )}
        <button type="submit" className={btnPrimary}>
          قبول وإنشاء الحساب
        </button>
      </form>
    </AuthCard>
  )
}
