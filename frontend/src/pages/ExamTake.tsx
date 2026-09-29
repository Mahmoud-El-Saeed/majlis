import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { api } from '../api/http'
import type { AttemptOut, ExamDetailOut } from '../api/types'
import { localizeDetail } from '../i18n'

type AnswerDraft = {
  selected_index?: number | null
  selected_bool?: boolean | null
  text_answer?: string | null
}

function useCountdown(expiresAt: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  if (!expiresAt) return null
  const ms = new Date(expiresAt).getTime() - now
  if (ms <= 0) return '00:00'
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function ExamTakePage() {
  const { id = '' } = useParams()
  const [attempt, setAttempt] = useState<AttemptOut | null>(null)
  const [drafts, setDrafts] = useState<Record<string, AnswerDraft>>({})
  const [err, setErr] = useState<string | null>(null)

  const examMeta = useQuery({
    queryKey: ['exam-meta', id],
    queryFn: () => api.get<ExamDetailOut>(`/exams/${id}`).catch(() => null),
    retry: false,
  })

  const start = useMutation({
    mutationFn: () => api.post<AttemptOut>(`/exams/${id}/attempts`, {}),
    onSuccess: (a) => {
      setAttempt(a)
      setErr(null)
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 403) {
        setErr('بدء المحاولة للطلاب فقط — المعلم يستخدم المعاينة')
      } else {
        setErr(e instanceof ApiError ? localizeDetail(e.detail) : 'تعذّر بدء المحاولة')
      }
    },
  })

  const submit = useMutation({
    mutationFn: () => {
      if (!attempt) throw new Error('no attempt')
      const answers = attempt.questions.map((q) => ({ question_id: q.id, ...(drafts[q.id] ?? {}) }))
      return api.post<AttemptOut>(`/attempts/${attempt.id}/submit`, { answers })
    },
    onSuccess: (a) => setAttempt(a),
    onError: (e) => setErr(e instanceof ApiError ? localizeDetail(e.detail) : 'تعذّر التسليم'),
  })

  const timer = useCountdown(attempt?.expires_at)
  const submitted = useMemo(() => Boolean(attempt?.submitted_at), [attempt])

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-28 sm:px-6">
      <h1 className="font-heading text-2xl font-bold">{examMeta.data?.title ?? 'الاختبار'}</h1>
      {err && (
        <p role="alert" className="card mt-3 rounded-2xl p-3 text-sm" style={{ borderColor: 'var(--secondary)' }}>
          {err}
        </p>
      )}
      {!attempt && (
        <button
          type="button"
          onClick={() => start.mutate()}
          disabled={start.isPending}
          className="btn-primary transition-ui mt-4 rounded-xl px-6 py-2 font-bold"
        >
          بدء المحاولة
        </button>
      )}
      {attempt && (
        <>
          {timer && (
            <div
              className="mt-3 flex items-center gap-2 rounded-xl px-4 py-2 text-sm"
              style={{ backgroundColor: 'var(--sand)' }}
              role="timer"
              aria-label="الوقت المتبقي"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 3" />
              </svg>
              <span dir="ltr" className="tabular-nums font-bold">
                {timer}
              </span>
            </div>
          )}
          <ol className="mt-4 grid gap-4">
            {attempt.questions.map((q, i) => (
              <li key={q.id} className="card rounded-2xl p-4">
                <p className="font-bold">
                  {i + 1}. {q.prompt}
                </p>
                {q.type === 'mcq' && q.options && (
                  <div className="mt-2 grid gap-2" role="radiogroup" aria-label={q.prompt}>
                    {q.options.map((opt, idx) => (
                      <label
                        key={idx}
                        className="transition-ui clickable flex items-center gap-2 rounded-xl border px-3 py-2"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <input
                          type="radio"
                          name={q.id}
                          disabled={submitted}
                          checked={drafts[q.id]?.selected_index === idx}
                          onChange={() => setDrafts((d) => ({ ...d, [q.id]: { selected_index: idx } }))}
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                )}
                {q.type === 'tf' && (
                  <div className="mt-2 flex gap-2">
                    {[
                      { v: true, label: 'صح' },
                      { v: false, label: 'خطأ' },
                    ].map((o) => (
                      <label
                        key={o.label}
                        className="transition-ui clickable flex items-center gap-2 rounded-xl border px-4 py-2"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <input
                          type="radio"
                          name={q.id}
                          disabled={submitted}
                          checked={drafts[q.id]?.selected_bool === o.v}
                          onChange={() => setDrafts((d) => ({ ...d, [q.id]: { selected_bool: o.v } }))}
                        />
                        {o.label}
                      </label>
                    ))}
                  </div>
                )}
                {q.type === 'essay' && (
                  <label className="mt-2 block">
                    <span className="mb-1 block text-sm">إجابتك (الدرجة العظمى {q.max_score})</span>
                    <textarea
                      disabled={submitted}
                      value={drafts[q.id]?.text_answer ?? ''}
                      onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: { text_answer: e.target.value } }))}
                      rows={4}
                      className="w-full rounded-xl border px-3 py-2"
                      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
                    />
                  </label>
                )}
                {submitted &&
                  attempt.answers.find((a) => a.question_id === q.id)?.feedback && (
                    <p className="muted-t mt-2 text-sm">
                      ملاحظة المعلم: {attempt.answers.find((a) => a.question_id === q.id)?.feedback}
                    </p>
                  )}
              </li>
            ))}
          </ol>
          {!submitted ? (
            <button
              type="button"
              onClick={() => submit.mutate()}
              disabled={submit.isPending}
              className="btn-primary transition-ui mt-4 rounded-xl px-6 py-2 font-bold"
            >
              تسليم
            </button>
          ) : (
            <div className="card mt-4 rounded-2xl p-4" role="status">
              {attempt.score !== null && attempt.score !== undefined && attempt.is_published ? (
                <p>
                  الدرجة: <span dir="ltr" className="font-bold">{attempt.score}</span> /{' '}
                  <span dir="ltr">{attempt.max_score}</span>
                </p>
              ) : (
                <p>تم التسليم — {attempt.is_published ? 'بانتظار تصحيح المقالية' : 'النتائج تُنشر لاحقًا من المعلم'}</p>
              )}
            </div>
          )}
        </>
      )}
    </main>
  )
}

export function MyAttemptsPage() {
  const { id = '' } = useParams()
  const list = useQuery({
    queryKey: ['my-attempts', id],
    queryFn: () => api.get<AttemptOut[]>(`/exams/${id}/attempts/me`),
  })
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-28 sm:px-6">
      <h1 className="font-heading text-2xl font-bold">محاولاتي</h1>
      <ul className="mt-3 grid gap-3">
        {list.data?.map((a) => (
          <li key={a.id} className="card rounded-2xl p-4 text-sm">
            <span dir="ltr">{a.submitted_at ?? a.started_at}</span>
            {' · '}
            {a.score !== null && a.score !== undefined && a.is_published ? (
              <>
                الدرجة <span dir="ltr">{a.score}</span>
              </>
            ) : (
              'بانتظار النشر/التصحيح'
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}
