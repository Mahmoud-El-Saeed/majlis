import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { api } from '../api/http'
import type { AttemptOut, StudentExamDetailOut } from '../api/types'
import { localizeExamError, str } from '../i18n'
import { ErrorCard } from '../components/ErrorCard'
import { Skeleton } from '../components/Skeleton'
import {
  attemptResultLabel,
  attemptStatusLabel,
  canResumeAttempt,
  formatArabicDateTime,
} from '../features/exams/helpers'

/** "محاولاتي": the student's attempt history for one exam. */
export function MyAttemptsPage() {
  const { id = '' } = useParams()
  const list = useQuery({
    queryKey: ['my-attempts', id],
    queryFn: () => api.get<AttemptOut[]>(`/exams/${id}/attempts/me`),
    retry: false,
  })
  // Only for the course id behind the empty state's back link.
  const exam = useQuery({
    queryKey: ['student-exam', id],
    queryFn: () => api.get<StudentExamDetailOut>(`/exams/${id}/student-exam`),
    retry: false,
  })

  const listStatus = list.error instanceof ApiError ? list.error.status : 0
  const examStatus = exam.error instanceof ApiError ? exam.error.status : 0
  const forbidden = listStatus === 403 || examStatus === 403
  const failed = list.isError && listStatus !== 403
  const rows = list.data ?? []
  // First load, or a refetch that invalidated an empty list: never claim
  // "no attempts" while the answer is still in flight.
  const loading = !forbidden && !failed && (list.isPending || (list.isFetching && !rows.length))
  // The server's detail says who the caller is: a writer is pointed at the
  // preview, anyone else is told they are not enrolled.
  const forbiddenDetail =
    (list.error instanceof ApiError ? list.error.detail : '') ||
    (exam.error instanceof ApiError ? exam.error.detail : '')

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-28 sm:px-6">
      <h1 className="font-heading text-2xl font-bold">{str.myAttempts}</h1>
      {forbidden && (
        <p role="alert" className="card mt-3 rounded-2xl p-3 text-sm">
          {localizeExamError(forbiddenDetail)}
        </p>
      )}
      {failed && (
        <ErrorCard
          onRetry={() => {
            list.refetch()
            exam.refetch()
          }}
        >
          <p>{str.examAttemptsFailed}</p>
        </ErrorCard>
      )}
      {loading && <Skeleton label={str.myAttempts} className="mt-3 h-24 rounded-2xl" />}
      {!loading && !forbidden && !failed && rows.length === 0 && (
        <div className="card mt-3 rounded-2xl p-5 text-center">
          <p className="muted-t">{str.noAttempts}</p>
          {exam.data && (
            <Link
              to={`/courses/${exam.data.course_id}`}
              className="btn-secondary transition-ui mt-3 inline-block rounded-xl px-4 py-1.5"
            >
              {str.backToCourse}
            </Link>
          )}
        </div>
      )}
      {rows.length > 0 && (
        <ul className="mt-3 grid gap-3">
          {rows.map((a) => {
            const result = attemptResultLabel(a)
            return (
              <li key={a.id} className="card rounded-2xl p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span>{formatArabicDateTime(a.submitted_at ?? a.started_at)}</span>
                  <span className="badge-primary rounded-full px-3 py-1 text-xs font-bold">
                    {attemptStatusLabel(a.status)}
                  </span>
                  {result && <span className="muted-t">{result}</span>}
                  {canResumeAttempt(a) && (
                    <Link
                      to={`/exams/${id}`}
                      className="btn-primary transition-ui ms-auto rounded-xl px-4 py-1.5"
                    >
                      {str.resume}
                    </Link>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
