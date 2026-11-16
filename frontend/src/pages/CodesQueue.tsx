import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { api } from '../api/http'
import type { CodeListOut, CodeOut, EnrollmentListOut, EnrollmentOut } from '../api/types'
import { matchesArabic } from '../features/courses/helpers'
import { localizeDetail, str } from '../i18n'
import { useToast } from '../components/Toast'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EnrollmentBadge } from '../components/Badges'
import { SearchBox } from '../components/SearchBox'
import { btnPrimary, fieldCls, fieldStyle } from './Auth'

export function CodesQueuePage() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const { toast } = useToast()
  const [rawCode, setRawCode] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<
    | { kind: 'revoke'; codeId: string; label: string }
    | { kind: 'block' | 'unblock'; eid: string; name: string }
    | null
  >(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [codeQuery, setCodeQuery] = useState('')
  const [queueQuery, setQueueQuery] = useState('')
  // Ticket 19: optional teacher knobs for the generate form. Blank means
  // "server default" — the backend fills CODE_DEFAULT_MAX_USES (50) /
  // CODE_DEFAULT_EXPIRE_DAYS (7); no endpoint exposes them, so the
  // placeholders hardcode those values (see str codeGenerateHint).
  const [maxUses, setMaxUses] = useState('')
  const [expiresDays, setExpiresDays] = useState('')

  const codes = useQuery({
    queryKey: ['codes', id],
    queryFn: () => api.get<CodeListOut>(`/courses/${id}/codes`),
  })
  const pending = useQuery({
    queryKey: ['queue', id],
    queryFn: () => api.get<EnrollmentListOut>(`/courses/${id}/enrollments?status=pending`),
  })
  const all = useQuery({
    queryKey: ['enrollments', id],
    queryFn: () => api.get<EnrollmentListOut>(`/courses/${id}/enrollments`),
  })

  const generate = useMutation({
    mutationFn: (body: { max_uses?: number; expires_days?: number }) =>
      api.post<CodeOut>(`/courses/${id}/codes`, body),
    onSuccess: (c) => {
      // Raw code shown ONCE — copy immediately; list shows only prefix.
      setRawCode(c.code)
      qc.invalidateQueries({ queryKey: ['codes', id] })
    },
    onError: (e) => toast(e instanceof ApiError ? localizeDetail(e.detail) : 'تعذّر التوليد'),
  })

  // Blank → omit (server default); otherwise ASCII integers within the
  // backend CodeCreateIn ranges (max_uses 1–1000, expires_days 0–365).
  // Returns null for blank, undefined for invalid.
  const parseCount = (raw: string, min: number, max: number): number | null | undefined => {
    const t = raw.trim()
    if (!t) return null
    if (!/^\d+$/.test(t)) return undefined
    const n = Number(t)
    if (n < min || n > max) return undefined
    return n
  }

  const submitGenerate = () => {
    const uses = parseCount(maxUses, 1, 1000)
    if (uses === undefined) {
      toast(str.codeUsesInvalid)
      return
    }
    const days = parseCount(expiresDays, 0, 365)
    if (days === undefined) {
      toast(str.codeDaysInvalid)
      return
    }
    generate.mutate({
      ...(uses !== null ? { max_uses: uses } : {}),
      ...(days !== null ? { expires_days: days } : {}),
    })
  }

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['codes', id] })
      setConfirm(null)
    },
    onError: (e) => toast(e instanceof ApiError ? localizeDetail(e.detail) : 'تعذّر الإلغاء'),
  })

  const runConfirm = async () => {
    if (!confirm) return
    setConfirmBusy(true)
    try {
      if (confirm.kind === 'revoke') {
        await revoke.mutateAsync(confirm.codeId)
      } else {
        await decide.mutateAsync({ eid: confirm.eid, action: confirm.kind })
        setConfirm(null)
      }
    } finally {
      setConfirmBusy(false)
    }
  }

  // Revoked codes stay in history server-side but leave the teacher list —
  // revoking must visibly remove the row (a dead code that lingers reads as
  // "the delete button did nothing").
  const codeList = (codes.data?.codes ?? []).filter((c) => !c.revoked_at)
  const visibleCodes = codeList.filter((c) => matchesArabic(c.code_prefix, codeQuery))
  const pendingList = pending.data?.enrollments ?? []
  const visiblePending = pendingList.filter((e) =>
    matchesArabic(`${e.display_name} ${e.phone ?? ''}`, queueQuery),
  )

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pt-28 sm:px-6">
      <Link to="/teach" className="underline text-sm">
        → لوحة المعلم
      </Link>{' '}
      <Link to={`/teach/courses/${id}`} className="underline text-sm">
        إدارة الدروس
      </Link>
      <h1 className="font-heading mt-1 text-2xl font-bold">الرموز والطلبات</h1>

      {rawCode && (
        <div className="card mt-3 rounded-2xl p-4" role="status" style={{ borderColor: 'var(--gold)' }}>
          <p className="text-sm font-bold">انسخ الرمز الآن — لن يظهر مجددًا</p>
          <div
            className="mt-2 flex items-center justify-between gap-2 rounded-xl border px-4 py-2 font-mono"
            dir="ltr"
            style={{ borderColor: 'var(--gold)', backgroundColor: 'var(--surface)' }}
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
        <h2 className="font-heading mb-2 font-bold">رموز السلسلة (بحد أقصى 5 نشطة)</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <label className="grid gap-1 text-sm">
            <span>{str.codeMaxUses}</span>
            <input
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              placeholder="50"
              type="number"
              min={1}
              max={1000}
              inputMode="numeric"
              dir="ltr"
              className={fieldCls}
              style={{ ...fieldStyle, width: '9rem' }}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>{str.codeExpiryDays}</span>
            <input
              value={expiresDays}
              onChange={(e) => setExpiresDays(e.target.value)}
              placeholder="7"
              type="number"
              min={0}
              max={365}
              inputMode="numeric"
              dir="ltr"
              className={fieldCls}
              style={{ ...fieldStyle, width: '9rem' }}
            />
          </label>
        </div>
        <p className="muted-t mt-1 text-xs">{str.codeGenerateHint}</p>
        <button
          type="button"
          onClick={submitGenerate}
          disabled={generate.isPending}
          className={`${btnPrimary} mt-2`}
        >
          توليد رمز
        </button>
        {codeList.length > 0 && (
          <div className="mt-3">
            <SearchBox value={codeQuery} onChange={setCodeQuery} placeholder={str.searchCodesPlaceholder} />
          </div>
        )}
        {codeQuery && codeList.length > 0 && (
          <p className="muted-t mt-1 text-xs">
            {str.resultCount}: <span dir="ltr">{visibleCodes.length}</span>
          </p>
        )}
        <ul className="mt-3 grid gap-2">
          {visibleCodes.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
              <span dir="ltr" className="font-mono">
                {c.code_prefix}… · {c.uses_count}/{c.max_uses}
              </span>
              <button
                type="button"
                onClick={() => setConfirm({ kind: 'revoke', codeId: c.id, label: c.code_prefix })}
                className="transition-ui clickable rounded-lg border px-3 py-1"
                style={{ borderColor: 'var(--secondary)' }}
              >
                إلغاء
              </button>
            </li>
          ))}
          {codeList.length > 0 && visibleCodes.length === 0 && (
            <li className="muted-t rounded-xl border border-dashed p-3 text-center text-sm" style={{ borderColor: 'var(--border)' }}>
              {str.noResults}
            </li>
          )}
          {codeList.length === 0 && !codes.isPending && (
            <li className="muted-t rounded-xl border border-dashed p-3 text-center text-sm" style={{ borderColor: 'var(--border)' }}>
              لا رموز بعد
            </li>
          )}
        </ul>
      </div>

      <div className="card mt-4 rounded-2xl p-5">
        <h2 className="font-heading mb-2 font-bold">طلبات بانتظار المراجعة (الاسم/الهاتف/ملاحظة)</h2>
        {pendingList.length > 0 && (
          <div className="mb-2">
            <SearchBox value={queueQuery} onChange={setQueueQuery} placeholder={str.searchPendingPlaceholder} />
          </div>
        )}
        {queueQuery && pendingList.length > 0 && (
          <p className="muted-t mb-2 text-xs">
            {str.resultCount}: <span dir="ltr">{visiblePending.length}</span>
          </p>
        )}
        <ul className="grid gap-2">
          {visiblePending.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2" style={{ borderColor: 'var(--border)' }}>
              <div>
                <p dir="auto" className="font-bold">{e.display_name}</p>
                <p dir="auto" className="muted-t text-xs">
                  {e.phone ?? ''} · {e.note ?? ''}
                </p>
                <EnrollmentBadge status={e.status} />
              </div>
              <div className="flex flex-wrap gap-2">
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
                  onClick={() => setConfirm({ kind: 'block', eid: e.id, name: e.display_name })}
                  className="transition-ui clickable rounded-lg border px-3 py-1"
                  style={{ borderColor: 'var(--secondary)' }}
                >
                  حظر
                </button>
              </div>
            </li>
          ))}
          {pendingList.length === 0 && !pending.isPending && (
            <li className="muted-t rounded-xl border border-dashed p-3 text-center text-sm" style={{ borderColor: 'var(--border)' }}>
              لا طلبات معلقة
            </li>
          )}
          {pendingList.length > 0 && visiblePending.length === 0 && (
            <li className="muted-t rounded-xl border border-dashed p-3 text-center text-sm" style={{ borderColor: 'var(--border)' }}>
              {str.noResults}
            </li>
          )}
        </ul>
      </div>

      <div className="card mt-4 rounded-2xl p-5">
        <h2 className="font-heading mb-2 font-bold">كل الأعضاء (للحظر/فك الحظر)</h2>
        <ul className="grid gap-2">
          {(all.data?.enrollments ?? []).length === 0 && !all.isPending && (
            <li className="muted-t rounded-xl border border-dashed p-3 text-center text-sm" style={{ borderColor: 'var(--border)' }}>
              لا أعضاء بعد
            </li>
          )}
          {(all.data?.enrollments ?? []).map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {e.display_name} · <EnrollmentBadge status={e.status} />
              </span>
              <span className="flex flex-wrap gap-2">
                {e.status === 'blocked' ? (
                  <button type="button" onClick={() => setConfirm({ kind: 'unblock', eid: e.id, name: e.display_name })} className="underline">
                    فك الحظر
                  </button>
                ) : (
                  e.status === 'approved' && (
                    <button type="button" onClick={() => setConfirm({ kind: 'block', eid: e.id, name: e.display_name })} className="underline">
                      حظر
                    </button>
                  )
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {confirm && (
        <ConfirmDialog
          title={
            confirm.kind === 'revoke'
              ? 'إلغاء الرمز'
              : confirm.kind === 'block'
                ? 'حظر الطالب'
                : 'فك الحظر'
          }
          message={
            confirm.kind === 'revoke'
              ? `سيتوقف الرمز ${confirm.label}… عن العمل فورًا. الطلاب الذين انضموا به لن يتأثروا.`
              : confirm.kind === 'block'
                ? `سيُحظر «${confirm.name}» من هذه السلسلة ولن يتمكن من العودة برمز جديد.`
                : str.unblockRestores(confirm.name)
          }
          confirmLabel={confirm.kind === 'unblock' ? 'فك الحظر' : 'تأكيد'}
          busy={confirmBusy}
          onConfirm={runConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </main>
  )
}
