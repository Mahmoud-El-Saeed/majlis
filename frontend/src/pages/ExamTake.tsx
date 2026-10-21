import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { api } from '../api/http'
import type {
  AttemptAnswerOut,
  AttemptOut,
  AttemptQuestionOut,
  StudentExamDetailOut,
} from '../api/types'
import { localizeDetail, localizeExamError, str } from '../i18n'
import { Modal } from '../components/Modal'
import { WindowBadge } from '../components/Badges'
import { Skeleton } from '../components/Skeleton'
import { ErrorCard } from '../components/ErrorCard'
import {
  attemptResultLabel,
  canResumeAttempt,
} from '../features/exams/helpers'

type AnswerDraft = {
  selected_index?: number | null
  selected_bool?: boolean | null
  text_answer?: string | null
}

/** The live attempt plus the student's current selections. */
type Session = {
  attempt: AttemptOut
  drafts: Record<string, AnswerDraft>
  dirty: boolean
}

const AUTOSAVE_MS = 600

/** Saved answers → the inputs the student sees. */
function draftsFromAnswers(answers: AttemptAnswerOut[]): Record<string, AnswerDraft> {
  const out: Record<string, AnswerDraft> = {}
  for (const a of answers) {
    out[a.question_id] = {
      selected_index: a.selected_index ?? null,
      selected_bool: a.selected_bool ?? null,
      text_answer: a.text_answer ?? null,
    }
  }
  return out
}

/** The current selections, in the shape both autosave and submit expect. */
function toAnswerPayload(
  questions: AttemptQuestionOut[],
  drafts: Record<string, AnswerDraft>,
): Array<{
  question_id: string
  selected_index?: number
  selected_bool?: boolean
  text_answer?: string
}> {
  return questions.map((q) => {
    const d = drafts[q.id] ?? {}
    const payload: {
      question_id: string
      selected_index?: number
      selected_bool?: boolean
      text_answer?: string
    } = { question_id: q.id }
    if (d.selected_index !== null && d.selected_index !== undefined) {
      payload.selected_index = d.selected_index
    }
    if (d.selected_bool !== null && d.selected_bool !== undefined) {
      payload.selected_bool = d.selected_bool
    }
    if (typeof d.text_answer === 'string' && d.text_answer !== '') {
      payload.text_answer = d.text_answer
    }
    return payload
  })
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
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function ExamTakePage() {
  const { id = '' } = useParams()
  const queryClient = useQueryClient()

  const [session, setSession] = useState<Session | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [autosaveFailed, setAutosaveFailed] = useState(false)

  // Student-safe exam read (never the writer-only /exams/{id}).
  const exam = useQuery({
    queryKey: ['student-exam', id],
    queryFn: () => api.get<StudentExamDetailOut>(`/exams/${id}/student-exam`),
    retry: false,
  })

  // My attempts — the recovery source (an in-progress attempt is adopted).
  const attempts = useQuery({
    queryKey: ['my-attempts', id],
    queryFn: () => api.get<AttemptOut[]>(`/exams/${id}/attempts/me`),
    retry: false,
  })

  // The live attempt, if any. Recovered on load — never a second one.
  const liveAttempt = useMemo(
    () => attempts.data?.find((a) => canResumeAttempt(a)) ?? null,
    [attempts.data],
  )
  const activeAttempt = session?.attempt ?? liveAttempt
  const baseDrafts = useMemo(
    () => draftsFromAnswers(activeAttempt?.answers ?? []),
    [activeAttempt],
  )
  const activeSession =
    session && activeAttempt && session.attempt.id === activeAttempt.id ? session : null
  const drafts = activeSession ? activeSession.drafts : baseDrafts
  const dirty = activeSession ? activeSession.dirty : false

  const start = useMutation({
    mutationFn: () => api.post<AttemptOut>(`/exams/${id}/attempts`, {}),
    onSuccess: (a) => {
      setSession({ attempt: a, drafts: {}, dirty: false })
      setErr(null)
      setAutosaveFailed(false)
      void queryClient.invalidateQueries({ queryKey: ['my-attempts', id] })
      void queryClient.invalidateQueries({ queryKey: ['student-exam', id] })
    },
    onError: async (e) => {
      if (e instanceof ApiError && e.status === 403) {
        // The server knows who the caller is: a writer is told to preview,
        // anyone else is told they are not enrolled.
        setErr(localizeExamError(e.detail))
        return
      }
      // Any other refusal may hide a live attempt (the server reports the
      // attempts limit before the live-attempt guard), so look for one and
      // adopt it — a second attempt is never consumed.
      const result = await attempts.refetch()
      const live = result.data?.find((a) => canResumeAttempt(a)) ?? null
      if (live) {
        setSession({ attempt: live, drafts: draftsFromAnswers(live.answers), dirty: false })
        setErr(null)
        return
      }
      setErr(e instanceof ApiError ? localizeDetail(e.detail) : str.examStartFailed)
    },
  })

  const submit = useMutation({
    mutationFn: () => {
      if (!activeAttempt) throw new Error('no attempt')
      return api.post<AttemptOut>(`/attempts/${activeAttempt.id}/submit`, {
        answers: toAnswerPayload(activeAttempt.questions, drafts),
      })
    },
    onMutate: () => {
      // The submit carries the current drafts — stop the pending autosave so
      // it cannot land on an already submitted attempt.
      setSession((prev) => (prev ? { ...prev, dirty: false } : prev))
    },
    onSuccess: (a) => {
      setSession((prev) => ({
        attempt: a,
        drafts:
          prev && prev.attempt.id === a.id ? prev.drafts : draftsFromAnswers(a.answers ?? []),
        dirty: false,
      }))
      setErr(null)
      // attempts_used / the history list changed with this submit.
      void queryClient.invalidateQueries({ queryKey: ['my-attempts', id] })
      void queryClient.invalidateQueries({ queryKey: ['student-exam', id] })
    },
    onError: (e) => setErr(e instanceof ApiError ? localizeDetail(e.detail) : str.examSubmitFailed),
  })

  // Autosave: the current selections, debounced; flushed immediately when the
  // page is hidden so a reload right after an edit does not lose it. Never
  // fires for the draft adopted from the server — only after a change.
  useEffect(() => {
    if (!activeAttempt || activeAttempt.status !== 'in_progress' || !dirty) return
    const attemptId = activeAttempt.id
    const payload = toAnswerPayload(activeAttempt.questions, drafts)
    let sent = false
    const save = () => {
      if (sent) return
      sent = true
      api
        .post<AttemptOut>(`/attempts/${attemptId}/answers`, { answers: payload })
        .then(() => setAutosaveFailed(false))
        .catch((e: unknown) => {
          // A submit may have won the race; the server refuses the draft and
          // the exam page already shows the result — no autosave warning.
          if (e instanceof ApiError && e.status === 400) return
          setAutosaveFailed(true)
        })
    }
    const timer = window.setTimeout(save, AUTOSAVE_MS)
    const flushOnHide = () => {
      if (document.visibilityState === 'hidden') save()
    }
    document.addEventListener('visibilitychange', flushOnHide)
    window.addEventListener('pagehide', save)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', flushOnHide)
      window.removeEventListener('pagehide', save)
    }
  }, [activeAttempt, drafts, dirty])

  const timer = useCountdown(activeAttempt?.expires_at)
  const submitted = Boolean(activeAttempt?.submitted_at)
  const timeUp = !submitted && timer === '00:00'
  const locked = submitted || timeUp

  const updateDraft = (questionId: string, patch: AnswerDraft) => {
    if (!activeAttempt) return
    const current = activeSession ? activeSession.drafts : baseDrafts
    setSession({
      attempt: activeAttempt,
      drafts: { ...current, [questionId]: { ...(current[questionId] ?? {}), ...patch } },
      dirty: true,
    })
  }

  const examData = exam.data
  const examStatus = exam.error instanceof ApiError ? exam.error.status : 0
  const startBlockedReason = (() => {
    if (!examData) return null
    if (examData.attempts_left <= 0) return str.attemptsExhausted
    if (examData.window_status === 'closed') return str.examWindowClosed
    if (examData.window_status === 'upcoming') return str.examNotOpenYet
    return null
  })()

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-28 sm:px-6">
      {exam.isPending && <Skeleton label={str.loadingExam} className="mt-3 h-40 rounded-2xl" />}
      {exam.isError && (
        <ErrorCard
          onRetry={examStatus === 404 || examStatus === 403 ? undefined : () => exam.refetch()}
        >
          {examStatus === 404 ? (
            <p>{str.examNotFound}</p>
          ) : examStatus === 403 ? (
            <p>{localizeExamError(exam.error instanceof ApiError ? exam.error.detail : '')}</p>
          ) : (
            <p>{str.examLoadFailed}</p>
          )}
        </ErrorCard>
      )}
      {examData && (
        <>
          <h1 className="font-heading text-2xl font-bold">{examData.title}</h1>
          {err && (
            <p
              role="alert"
              className="card mt-3 rounded-2xl p-3 text-sm"
              style={{ borderColor: 'var(--secondary)' }}
            >
              {err}
            </p>
          )}
          {!activeAttempt && (
            <>
              <div className="card mt-3 rounded-2xl p-4 text-sm">
                <p className="muted-t">{examData.description || str.examNoDescription}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <WindowBadge status={examData.window_status} />
                  <span className="muted-t">
                    {str.examDurationLabel}: <span dir="ltr">{examData.duration_minutes ?? '—'}</span>{' '}
                    {str.examMinutesUnit}
                  </span>
                  <span className="muted-t">
                    {str.examQuestionsLabel}: <span dir="ltr">{examData.questions_count}</span>
                  </span>
                  <span className="muted-t">
                    {str.examYourAttemptsLabel}: <span dir="ltr">{examData.attempts_used}</span> /{' '}
                    <span dir="ltr">{examData.attempts_limit}</span>
                  </span>
                </div>
                <Link to={`/exams/${id}/mine`} className="mt-2 inline-block text-sm underline">
                  {str.myAttempts}
                </Link>
              </div>
              <button
                type="button"
                onClick={() => start.mutate()}
                disabled={start.isPending || attempts.isPending || Boolean(startBlockedReason)}
                className="btn-primary transition-ui mt-4 rounded-xl px-6 py-2 font-bold"
              >
                {str.startAttempt}
              </button>
              {startBlockedReason && (
                <p className="muted-t mt-2 text-sm">{startBlockedReason}</p>
              )}
            </>
          )}
          {activeAttempt && (
            <>
              {timer && (
                <div
                  className="card mt-3 flex items-center gap-2 rounded-xl px-4 py-2 text-sm"
                  role="timer"
                  aria-label={str.examTimeLeft}
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
              {timeUp && <p className="muted-t mt-2 text-xs">{str.examTimeUp}</p>}
              {autosaveFailed && (
                <p className="muted-t mt-2 text-xs">{str.examAutosaveFailed}</p>
              )}
              <ol className="mt-4 grid gap-4">
                {activeAttempt.questions.map((q, i) => (
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
                              disabled={locked}
                              checked={drafts[q.id]?.selected_index === idx}
                              onChange={() => updateDraft(q.id, { selected_index: idx })}
                            />
                            {opt}
                          </label>
                        ))}
                      </div>
                    )}
                    {q.type === 'tf' && (
                      <div className="mt-2 flex gap-2">
                        {[
                          { v: true, label: str.examTrue },
                          { v: false, label: str.examFalse },
                        ].map((o) => (
                          <label
                            key={o.label}
                            className="transition-ui clickable flex items-center gap-2 rounded-xl border px-4 py-2"
                            style={{ borderColor: 'var(--border)' }}
                          >
                            <input
                              type="radio"
                              name={q.id}
                              disabled={locked}
                              checked={drafts[q.id]?.selected_bool === o.v}
                              onChange={() => updateDraft(q.id, { selected_bool: o.v })}
                            />
                            {o.label}
                          </label>
                        ))}
                      </div>
                    )}
                    {q.type === 'essay' && (
                      <label className="mt-2 block">
                        <span className="mb-1 block text-sm">{str.examAnswerPrompt(q.max_score)}</span>
                        <textarea
                          disabled={locked}
                          value={drafts[q.id]?.text_answer ?? ''}
                          onChange={(e) => updateDraft(q.id, { text_answer: e.target.value })}
                          rows={4}
                          className="w-full rounded-xl border px-3 py-2"
                          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
                        />
                      </label>
                    )}
                    {submitted &&
                      activeAttempt.answers.find((a) => a.question_id === q.id)?.feedback && (
                        <p className="muted-t mt-2 text-sm">
                          {str.examTeacherNote} {activeAttempt.answers.find((a) => a.question_id === q.id)?.feedback}
                        </p>
                      )}
                  </li>
                ))}
              </ol>
              {!submitted ? (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    disabled={submit.isPending}
                    className="btn-primary transition-ui mt-4 rounded-xl px-6 py-2 font-bold"
                  >
                    {str.submit}
                  </button>
                  {confirming && (
                    <Modal title={str.examConfirmTitle} onClose={() => setConfirming(false)}>
                      <p className="muted-t text-sm">{str.examConfirmBody}</p>
                      <div className="mt-4 flex gap-2">
                        <button
                          type="button"
                          disabled={submit.isPending}
                          onClick={() => {
                            setConfirming(false)
                            submit.mutate()
                          }}
                          className="btn-primary transition-ui rounded-xl px-6 py-2 font-bold"
                        >
                          {str.examConfirmSubmit}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(false)}
                          className="btn-secondary transition-ui rounded-xl px-5 py-2"
                        >
                          {str.examReview}
                        </button>
                      </div>
                    </Modal>
                  )}
                </>
              ) : (
                <div className="card mt-4 rounded-2xl p-4" role="status">
                  <p className="font-bold">{str.submitted}</p>
                  <p className="mt-1">{attemptResultLabel(activeAttempt) ?? str.awaitingPublish}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-sm">
                    <Link
                      to={`/courses/${activeAttempt.course_id}`}
                      className="transition-ui clickable rounded-xl border px-4 py-1.5"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      {str.backToCourse}
                    </Link>
                    <Link
                      to={`/exams/${id}/mine`}
                      className="transition-ui clickable rounded-xl border px-4 py-1.5"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      {str.myAttempts}
                    </Link>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </main>
  )
}
