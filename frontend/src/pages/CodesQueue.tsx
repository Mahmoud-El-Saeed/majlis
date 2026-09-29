import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { api } from '../api/http'
import type { CodeListOut, CodeOut, EnrollmentOut } from '../api/types'
import { localizeDetail, str } from '../i18n'
import { useToast } from '../components/Toast'
import { EnrollmentBadge } from '../components/Badges'
import { btnPrimary } from './Auth'

export function CodesQueuePage() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const { toast } = useToast()
  const [rawCode, setRawCode] = useState<string | null>(null)

  const codes = useQuery({
    queryKey: ['codes', id],
    queryFn: () => api.get<CodeListOut>(`/courses/${id}/codes`),
  })
  const pending = useQuery({
    queryKey: ['queue', id],
    queryFn: () => api.get<EnrollmentOut[]>(`/courses/${id}/enrollments?status=pending`),
  })
  const all = useQuery({
    queryKey: ['enrollments', id],
    queryFn: () => api.get<EnrollmentOut[]>(`/courses/${id}/enrollments`),
  })

  const generate = useMutation({
    mutationFn: () => api.post<CodeOut>(`/courses/${id}/codes`, {}),
    onSuccess: (c) => {
      // Raw code shown ONCE — copy immediately; list shows only prefix.
      setRawCode(c.code)
      qc.invalidateQueries({ queryKey: ['codes', id] })
    },
    onError: (e) => toast(e instanceof ApiError ? localizeDetail(e.detail) : 'تعذّر التوليد'),
  })

  const decide = useMutation({
    mutationFn: ({ eid, action }: { eid: string; action: 'approve' | 'reject' | 'block' | 'unblock' }) =>
      api.post<EnrollmentOut>(`/enrollments/${eid}/${action}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queue', id] })
      qc.invalidateQueries({ queryKey: ['enrollments', id] })
    },
    onError: (e) => toast(e instanceof ApiError ? localizeDetail(e.detail) : 'تعذّر القرار'),
  })

  const revoke = useMutation({
    mutationFn: (codeId: string) => api.post(`/courses/${id}/codes/${codeId}/revoke`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['codes', id] }),
  })

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pt-28 sm:px-6">
      <Link to="/teach" className="underline text-sm">
        ← لوحة المعلم
      </Link>
      <h1 className="font-heading mt-1 text-2xl font-bold">الرموز والطلبات</h1>

      {rawCode && (
        <div className="card mt-3 rounded-2xl p-4" role="status" style={{ borderColor: 'var(--gold)' }}>
          <p className="text-sm font-bold">انسخ الرمز الآن — لن يظهر مجددًا</p>
          <div
            className="mt-2 flex items-center justify-between gap-2 rounded-xl px-4 py-2 font-mono"
            dir="ltr"
            style={{ backgroundColor: '#2D2727', color: '#fff' }}
          >
            <span>{rawCode}</span>
            <button
              type="button"
              className="transition-ui clickable rounded-lg border px-3 py-1 text-sm"
              onClick={async () => {
                await navigator.clipboard.writeText(rawCode).catch(() => {})
                toast('تم النسخ')
              }}
            >
              {str.copy}
            </button>
          </div>
        </div>
      )}

      <div className="card arch-sm arch-frame mt-4 p-5">
        <h2 className="font-heading mb-2 font-bold">رموز الكتاب (بحد أقصى 5 نشطة)</h2>
        <button type="button" onClick={() => generate.mutate()} className={btnPrimary}>
          توليد رمز
        </button>
        <ul className="mt-3 grid gap-2">
          {codes.data?.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
              <span dir="ltr" className="font-mono">
                {c.code_prefix}… · {c.uses_count}/{c.max_uses}
              </span>
              <button
                type="button"
                onClick={() => revoke.mutate(c.id)}
                className="transition-ui clickable rounded-lg border px-3 py-1"
                style={{ borderColor: 'var(--secondary)' }}
              >
                إلغاء
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="card mt-4 rounded-2xl p-5">
        <h2 className="font-heading mb-2 font-bold">طلبات بانتظار المراجعة (الاسم/الهاتف/ملاحظة)</h2>
        <ul className="grid gap-2">
          {pending.data?.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2" style={{ borderColor: 'var(--border)' }}>
              <div>
                <p className="font-bold">{e.display_name}</p>
                <p className="muted-t text-xs">
                  {e.phone ?? ''} · {e.note ?? ''}
                </p>
                <EnrollmentBadge status={e.status} />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => decide.mutate({ eid: e.id, action: 'approve' })} className="btn-primary transition-ui rounded-lg px-3 py-1">
                  قبول
                </button>
                <button
                  type="button"
                  onClick={() => decide.mutate({ eid: e.id, action: 'reject' })}
                  className="transition-ui clickable rounded-lg border px-3 py-1"
                  style={{ borderColor: 'var(--border)' }}
                >
                  رفض
                </button>
                <button
                  type="button"
                  onClick={() => decide.mutate({ eid: e.id, action: 'block' })}
                  className="transition-ui clickable rounded-lg border px-3 py-1"
                  style={{ borderColor: 'var(--secondary)' }}
                >
                  حظر
                </button>
              </div>
            </li>
          ))}
          {pending.data?.length === 0 && <p className="muted-t text-sm">لا طلبات معلقة</p>}
        </ul>
      </div>

      <div className="card mt-4 rounded-2xl p-5">
        <h2 className="font-heading mb-2 font-bold">كل الأعضاء (للحظر/فك الحظر)</h2>
        <ul className="grid gap-2">
          {all.data?.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {e.display_name} · <EnrollmentBadge status={e.status} />
              </span>
              <span className="flex gap-2">
                {e.status === 'blocked' ? (
                  <button type="button" onClick={() => decide.mutate({ eid: e.id, action: 'unblock' })} className="underline">
                    فك الحظر unblock
                  </button>
                ) : (
                  e.status === 'approved' && (
                    <button type="button" onClick={() => decide.mutate({ eid: e.id, action: 'block' })} className="underline">
                      حظر block
                    </button>
                  )
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
