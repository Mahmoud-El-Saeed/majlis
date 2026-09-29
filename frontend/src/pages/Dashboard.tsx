import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { api } from '../api/http'
import type { DashboardOut } from '../api/types'
import { canViewContent } from '../features/enrollment/gates'
import { dashboardBadge } from '../features/enrollment/gates'
import { localizeDetail, str } from '../i18n'
import { useToast } from '../components/Toast'
import { EnrollmentBadge } from '../components/Badges'
import { StarDivider } from '../components/Star8'
import emptyCourses from '../assets/empty-courses.svg'
import { btnPrimary, fieldCls, fieldStyle } from './Auth'

export function JoinBox({ onJoined }: { onJoined: () => void }) {
  const { toast } = useToast()
  const [code, setCode] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [err, setErr] = useState<string | null>(null)

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
    <div className="card arch-sm arch-frame p-5">
      <h2 className="font-heading mb-2 text-lg font-bold">{str.joinWithCode}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          join.mutate({ code: code.trim(), display_name: displayName.trim() })
        }}
      >
        <label className="mb-2 block">
          <span className="mb-1 block text-sm">الرمز</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            dir="ltr"
            required
            placeholder="XXXXXXXX"
            className={fieldCls}
            style={fieldStyle}
          />
        </label>
        <label className="mb-3 block">
          <span className="mb-1 block text-sm">الاسم المعروض للشيخ</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            className={fieldCls}
            style={fieldStyle}
          />
        </label>
        {err && (
          <p role="alert" className="mb-2 text-sm" style={{ color: 'var(--secondary)' }}>
            {err}
          </p>
        )}
        <button type="submit" disabled={join.isPending} className={btnPrimary}>
          {str.join}
        </button>
      </form>
    </div>
  )
}

export function DashboardPage() {
  const qc = useQueryClient()
  const dash = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardOut>('/dashboard'),
  })

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-28 sm:px-6 lg:px-8">
      <h1 className="font-heading mb-1 text-3xl font-bold">{str.myCourses}</h1>
      <StarDivider />
      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_320px]">
        <section aria-label="الكتب">
          {dash.isPending && <div className="skeleton h-32 rounded-2xl" aria-label="جار التحميل" />}
          {dash.isError && <p role="alert">تعذّر التحميل</p>}
          {dash.data && dash.data.items.length === 0 && (
            <div className="card rounded-2xl p-6 text-center">
              <img src={emptyCourses} alt="لا كتب بعد" className="mx-auto mb-3" width={240} />
              <p className="muted-t">لا كتب بعد — انضم برمز من الشيخ</p>
            </div>
          )}
          <ul className="grid gap-4 sm:grid-cols-2">
            {dash.data?.items.map((it) => (
              <li key={it.course.id} className="card arabesque rounded-2xl p-5">
                <h2 className="font-heading text-xl font-bold">{it.course.title}</h2>
                {it.course.book_title && <p className="muted-t text-sm">{it.course.book_title}</p>}
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
                    دخول الكتاب
                  </Link>
                ) : (
                  <p className="muted-t mt-3 text-sm">أدخلت رمزًا؟ انتظر مراجعة الشيخ.</p>
                )}
              </li>
            ))}
          </ul>
        </section>
        <aside>
          <JoinBox onJoined={() => qc.invalidateQueries({ queryKey: ['dashboard'] })} />
        </aside>
      </div>
    </main>
  )
}
