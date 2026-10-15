import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { api } from '../api/http'
import { useAuth } from '../features/auth/AuthContext'
import type { DashboardOut } from '../api/types'
import { canViewContent } from '../features/enrollment/gates'
import { dashboardBadge } from '../features/enrollment/gates'
import { matchesArabic } from '../features/courses/helpers'
import { localizeDetail, str } from '../i18n'
import { useToast } from '../components/Toast'
import { Fab } from '../components/Fab'
import { Modal } from '../components/Modal'
import { EnrollmentBadge } from '../components/Badges'
import { NumberBadge } from '../components/NumberBadge'
import { SearchBox } from '../components/SearchBox'
import { StarDivider } from '../components/Star8'
import emptyCourses from '../assets/empty-courses.svg'
import { btnPrimary, fieldCls, fieldStyle } from './Auth'

export function JoinBox({ onJoined }: { onJoined: () => void }) {
  const { toast } = useToast()
  const { user } = useAuth()
  const [code, setCode] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  // The account already carries the display name (set at signup, editable in
  // /account) — ask for it only when the account has none yet.
  const accountName = user?.full_name?.trim() || ''
  const effectiveName = accountName || displayName.trim()

  const join = useMutation({
    mutationFn: (body: { code: string; display_name: string }) =>
      api.post('/enrollments/join', body),
    onSuccess: () => {
      setCode('')
      setErr(null)
      onJoined()
      toast('تم إرسال طلب الانضمام — بانتظار المراجعة')
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? localizeDetail(e.detail) : 'تعذّر الانضمام'
      setErr(msg)
      if (e instanceof ApiError && e.status === 429) toast(msg)
    },
  })

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (code.trim() === '' || effectiveName === '') {
          setErr(str.missingFields)
          return
        }
        setErr(null)
        join.mutate({ code: code.trim(), display_name: effectiveName })
      }}
    >
      <label className="mb-2 block">
        <span className="mb-1 block text-sm">الرمز</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          dir="ltr"
          placeholder="XXXXXXXX"
          className={fieldCls}
          style={fieldStyle}
        />
      </label>
      {accountName === '' ? (
        <label className="mb-3 block">
          <span className="mb-1 block text-sm">الاسم المعروض للشيخ</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={fieldCls}
            style={fieldStyle}
          />
        </label>
      ) : (
        <p className="muted-t mb-3 text-sm">
          ستنضم باسم: <span className="font-bold" dir="auto">{accountName}</span> (غيّره من{' '}
          <Link to="/account" className="underline">
            حسابي
          </Link>
          )
        </p>
      )}
        {err && (
          <p role="alert" className="mb-2 text-sm" style={{ color: 'var(--secondary)' }}>
            {err}
          </p>
        )}
        <button type="submit" disabled={join.isPending} className={btnPrimary}>
          {str.join}
        </button>
      </form>
  )
}

export function DashboardPage() {
  const qc = useQueryClient()
  const [showJoin, setShowJoin] = useState(false)
  const dash = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardOut>('/dashboard'),
  })
  const [query, setQuery] = useState('')
  // Numbering = index+1 in the FULL ordered list; filter keeps full-list numbers.
  const numberedItems = (dash.data?.items ?? []).map((it, i) => ({ item: it, n: i + 1 }))
  const visibleItems = numberedItems.filter(({ item: it }) =>
    matchesArabic(`${it.course.title} ${it.course.book_title ?? ''}`, query),
  )

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-28 sm:px-6 lg:px-8">
      <h1 className="font-heading mb-1 text-3xl font-bold">{str.myCourses}</h1>
      <StarDivider />
      {dash.data && dash.data.items.length > 0 && (
        <div className="mt-4">
          <SearchBox value={query} onChange={setQuery} />
        </div>
      )}
      {query && dash.data && dash.data.items.length > 0 && (
        <p className="muted-t mt-1 text-xs">
          {str.resultCount}: <span dir="ltr">{visibleItems.length}</span>
        </p>
      )}
      <div className="mt-4">
        <section aria-label="الكتب">
          {dash.isPending && <div className="skeleton h-32 rounded-2xl" aria-label="جار التحميل" />}
          {dash.isError && (
            <div className="card rounded-2xl p-5 text-center">
              <p role="alert">تعذّر التحميل</p>
              <button
                type="button"
                onClick={() => dash.refetch()}
                className="btn-secondary transition-ui mt-2 rounded-xl px-4 py-1.5"
              >
                {str.retry}
              </button>
            </div>
          )}
          {dash.data && dash.data.items.length === 0 && (
            <div className="card rounded-2xl p-6 text-center">
              <img src={emptyCourses} alt="لا سلاسل بعد" className="mx-auto mb-3" width={240} />
              <p className="muted-t">لا سلاسل بعد — انضم برمز من الشيخ</p>
            </div>
          )}
          {dash.data && dash.data.items.length > 0 && visibleItems.length === 0 && (
            <div className="card rounded-2xl p-6 text-center">
              <p className="muted-t">{str.noResults}</p>
            </div>
          )}
          <ul className="grid gap-4 sm:grid-cols-2">
            {visibleItems.map(({ item: it, n }) => (
              <li key={it.course.id} className="card arabesque rounded-2xl p-5">
                <div className="flex items-center gap-2">
                  <NumberBadge n={n} />
                  <h2 dir="auto" className="font-heading text-xl font-bold">{it.course.title}</h2>
                </div>
                {it.course.book_title && <p dir="auto" className="muted-t text-sm">{it.course.book_title}</p>}
                <p className="muted-t mt-1 text-xs">
                  {it.ready_count} / {it.lesson_count} دروس جاهزة
                </p>
                <div className="mt-2">
                  {it.enrollment && !canViewContent(it.enrollment_status) ? (
                    <EnrollmentBadge status={it.enrollment.status} />
                  ) : (
                    <span className="badge-primary transition-ui inline-flex rounded-full px-3 py-1 text-xs font-bold">
                      {dashboardBadge(it.enrollment_status)}
                    </span>
                  )}
                </div>
                {it.enrollment && it.enrollment_status === 'pending' && (
                  <p className="muted-t mt-2 text-sm">{str.pendingWait}</p>
                )}
                {canViewContent(it.enrollment_status) ? (
                  <Link
                    to={`/courses/${it.course.id}`}
                    className="btn-primary transition-ui mt-3 inline-block rounded-xl px-4 py-1.5"
                  >
                    دخول السلسلة
                  </Link>
                ) : (
                  <p className="muted-t mt-3 text-sm">أدخلت رمزًا؟ انتظر مراجعة الشيخ.</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
      <Fab label={str.joinWithCode} icon="key" expanded onClick={() => setShowJoin(true)} />
      {showJoin && (
        <Modal title={str.joinWithCode} onClose={() => setShowJoin(false)}>
          <JoinBox
            onJoined={() => {
              qc.invalidateQueries({ queryKey: ['dashboard'] })
              setShowJoin(false)
            }}
          />
        </Modal>
      )}
    </main>
  )
}
