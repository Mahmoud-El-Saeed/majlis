import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/http'
import type {
  AttachmentOut,
  CourseAttachmentOut,
  CourseOut,
  EnrollmentOut,
  LessonOut,
  LessonSummaryOut,
  PlayOut,
  StudentExamOut,
} from '../api/types'
import { canViewContent } from '../features/enrollment/gates'
import { courseHasBook, matchesArabic, openAttachmentFile } from '../features/courses/helpers'
import { hasAnswerLeak, isScoreVisible } from '../features/exams/helpers'
import { str } from '../i18n'
import { AudioPlayer } from '../components/AudioPlayer'
import { LessonBadge, WindowBadge } from '../components/Badges'
import { EnrollmentStatusCard, type GatedStatus } from '../components/EnrollmentStatusCard'
import { NumberBadge } from '../components/NumberBadge'
import { SearchBox } from '../components/SearchBox'
import { Skeleton } from '../components/Skeleton'
import { StarDivider } from '../components/Star8'
import emptyLessons from '../assets/empty-lessons.svg'
import lessonCover from '../assets/lesson-cover.svg'

export function CoursePage() {
  const { id = '' } = useParams()
  const myEnrollment = useQuery({
    queryKey: ['my-enrollment', id],
    // 200 null when never joined; 404 only unknown course.
    queryFn: () => api.get<EnrollmentOut | null>(`/courses/${id}/my-enrollment`),
    retry: false,
  })

  const status = myEnrollment.data === null ? null : (myEnrollment.data?.status ?? null)
  const canView = myEnrollment.data === null ? false : canViewContent(status ?? undefined)
  // Pending/rejected/blocked: a dedicated status page — no tabs, no counts,
  // no content. Content reads stay disabled until the membership check
  // allows them, so a gated student never fires (or silently swallows) the
  // content endpoints' 403s at all. Never-joined keeps the existing card.
  const gatedStatus: GatedStatus | null =
    status === 'pending' || status === 'rejected' || status === 'blocked' ? status : null
  const contentEnabled = myEnrollment.isSuccess && gatedStatus === null

  const course = useQuery({
    queryKey: ['course', id],
    queryFn: () => api.get<CourseOut>(`/courses/${id}`),
    enabled: contentEnabled,
  })
  const lessons = useQuery({
    queryKey: ['lessons', id],
    queryFn: () => api.get<LessonSummaryOut[]>(`/courses/${id}/lessons`),
    enabled: contentEnabled,
  })
  const studentExams = useQuery({
    queryKey: ['student-exams', id],
    queryFn: () => api.get<StudentExamOut[]>(`/courses/${id}/student-exams`),
    retry: false,
    enabled: contentEnabled,
  })

  // Ticket 22: the enrollment read carries the course title, so a gated
  // student still sees which series they were measured against.
  const title = course.data?.title ?? myEnrollment.data?.course_title ?? null
  // Ticket 16: no pages line anywhere for general courses (legacy stored
  // pages stay hidden too).
  const showPages = course.data ? courseHasBook(course.data) : false

  // Numbering = index+1 in the FULL ordered list (backend oldest→newest);
  // search filters client-side but rows keep their full-list number.
  const [tab, setTab] = useState<'lessons' | 'exams'>('lessons')
  const [lessonQuery, setLessonQuery] = useState('')
  const [examQuery, setExamQuery] = useState('')
  const numberedLessons = (lessons.data ?? []).map((l, i) => ({ lesson: l, n: i + 1 }))
  const visibleLessons = numberedLessons.filter(({ lesson: l }) =>
    matchesArabic(`${l.title} ${l.description ?? ''}`, lessonQuery),
  )
  const numberedExams = (studentExams.data ?? []).map((ex, i) => ({ exam: ex, n: i + 1 }))
  // Answer-leaked rows are never rendered; drop them here so the visible
  // list and the result count agree (numbers still come from the full list).
  const visibleExams = numberedExams.filter(
    ({ exam: ex }) => !hasAnswerLeak(ex) && matchesArabic(ex.title, examQuery),
  )
  // Exams linked to a lesson (lesson_id set) surface beside that lesson's
  // listen button; book-wide exams (null lesson) live only in the exams tab.
  const examsByLesson = new Map<string, typeof visibleExams>()
  for (const row of visibleExams) {
    if (!row.exam.lesson_id) continue
    const rows = examsByLesson.get(row.exam.lesson_id) ?? []
    rows.push(row)
    examsByLesson.set(row.exam.lesson_id, rows)
  }

  if (gatedStatus) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 pt-28 sm:px-6">
        {title && (
          <h1 dir="auto" className="font-heading text-3xl font-bold">
            {title}
          </h1>
        )}
        <StarDivider />
        <EnrollmentStatusCard status={gatedStatus} />
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-28 sm:px-6 lg:px-8">
      {course.data && <h1 className="font-heading text-3xl font-bold">{course.data.title}</h1>}
      <StarDivider />
      {myEnrollment.isError && (
        <div className="card mt-4 rounded-2xl p-4 text-center" role="alert">
          <p>{str.enrollmentCheckFailed}</p>
          <button
            type="button"
            onClick={() => myEnrollment.refetch()}
            className="btn-secondary transition-ui mt-3 rounded-xl px-4 py-1.5 text-sm"
          >
            {str.retry}
          </button>
        </div>
      )}
      {myEnrollment.data === null && (
        <div className="card mt-4 rounded-2xl p-4">
          <p>لم تنضم بعد — استخدم صندوق الانضمام في لوحتك.</p>
          <Link to="/dashboard" className="btn-primary transition-ui mt-3 inline-block rounded-xl px-4 py-1.5">
            إلى لوحتك للانضمام
          </Link>
        </div>
      )}
      <div className="mt-4" role="tablist" aria-label={`${str.lessons} / ${str.exams}`}>
        <div className="flex gap-2">
          {(
            [
              { key: 'lessons', label: str.lessons, count: lessons.data?.length ?? 0 },
              { key: 'exams', label: str.exams, count: visibleExams.length },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`transition-ui clickable rounded-xl border px-4 py-1.5 font-bold ${
                tab === t.key ? 'btn-primary' : ''
              }`}
              style={tab === t.key ? undefined : { borderColor: 'var(--border)' }}
            >
              {t.label} <span dir="ltr">({t.count})</span>
            </button>
          ))}
        </div>
      </div>
      {tab === 'lessons' ? (
        <section aria-label="الدروس" role="tabpanel" className="mt-4">
          {(lessons.data?.length ?? 0) > 0 && (
            <div className="mb-2">
              <SearchBox value={lessonQuery} onChange={setLessonQuery} />
            </div>
          )}
          {lessonQuery && (lessons.data?.length ?? 0) > 0 && (
            <p className="muted-t mb-2 text-xs">
              {str.resultCount}: <span dir="ltr">{visibleLessons.length}</span>
            </p>
          )}
          {lessons.isPending && <div className="skeleton h-24 rounded-2xl" />}
          {lessons.data?.length === 0 && (
            <div className="card rounded-2xl p-5 text-center">
              <img src={emptyLessons} alt="لا دروس" className="mx-auto mb-2" width={200} />
              <p className="muted-t">لا دروس منشورة بعد</p>
            </div>
          )}
          {lessons.data && lessons.data.length > 0 && visibleLessons.length === 0 && (
            <p className="muted-t mt-2 text-center text-sm">{str.noResults}</p>
          )}
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleLessons.map(({ lesson: l, n }) => (
              <li key={l.id} className="card arch arch-frame overflow-hidden">
                <div className="arch-img m-3 mb-0">
                  <img src={lessonCover} alt={`غلاف ${l.title}`} className="h-32 w-full object-cover" />
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2">
                    <NumberBadge n={n} />
                    <h3 dir="auto" className="font-heading font-bold">{l.title}</h3>
                  </div>
                  {l.description && <p dir="auto" className="muted-t mt-1 text-sm">{l.description}</p>}
                  {showPages && (l.pages_from != null || l.pages_to != null) && (
                    <p className="muted-t text-xs" dir="ltr">
                      {l.pages_from ?? '?'} – {l.pages_to ?? '?'}
                    </p>
                  )}
                  <div className="mt-1">
                    <LessonBadge status={l.status} />
                  </div>
                  {canView && l.status === 'ready' ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Link
                        to={`/lessons/${l.id}`}
                        className="btn-primary transition-ui inline-block rounded-xl px-4 py-1.5"
                      >
                        استمع
                      </Link>
                      {(examsByLesson.get(l.id) ?? []).map(({ exam: ex }) => (
                        <Link
                          key={ex.id}
                          to={`/exams/${ex.id}`}
                          className="btn-secondary transition-ui inline-block rounded-xl px-4 py-1.5"
                        >
                          {str.lessonExam}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="muted-t mt-2 text-sm">
                      {canView ? 'الدرس يُجهّز…' : 'المحتوى للأعضاء المقبولين فقط'}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section aria-label="الاختبارات" role="tabpanel" className="mt-4">
          {(studentExams.data?.length ?? 0) > 0 && (
            <div className="mb-2">
              <SearchBox value={examQuery} onChange={setExamQuery} />
            </div>
          )}
          {examQuery && (studentExams.data?.length ?? 0) > 0 && (
            <p className="muted-t mb-2 text-xs">
              {str.resultCount}: <span dir="ltr">{visibleExams.length}</span>
            </p>
          )}
          {studentExams.isError && (
            <p className="muted-t text-sm">الاختبارات للأعضاء المقبولين فقط</p>
          )}
          {studentExams.data && studentExams.data.length > 0 && visibleExams.length === 0 && (
            <p className="muted-t mt-2 text-center text-sm">{str.noResults}</p>
          )}
          <ul className="grid gap-3">
            {visibleExams.map(({ exam: ex, n }) => {
              return (
                <li key={ex.id} className="card rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <NumberBadge n={n} />
                      <h3 dir="auto" className="font-heading font-bold">{ex.title}</h3>
                    </div>
                    <WindowBadge status={ex.window_status} />
                  </div>
                  <p className="muted-t text-xs">
                    محاولات متبقية: <span dir="ltr">{ex.attempts_left}</span> · المدة:{' '}
                    <span dir="ltr">{ex.duration_minutes ?? '—'}</span> دقيقة
                  </p>
                  {ex.last_score !== null && ex.last_score !== undefined && isScoreVisible(ex.show_result, true) && (
                    <p className="mt-1 text-sm">
                      آخر درجة: <span dir="ltr">{ex.last_score}</span>
                    </p>
                  )}
                  <Link
                    to={`/exams/${ex.id}`}
                    className="btn-primary transition-ui mt-2 inline-block rounded-xl px-4 py-1.5"
                  >
                    {ex.has_in_progress ? str.resumeExam : str.enterExam}
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      {canView && <CourseFiles courseId={id} />}
    </main>
  )
}

function CourseFiles({ courseId }: { courseId: string }) {
  const list = useQuery({
    queryKey: ['course-attachments', courseId],
    queryFn: () => api.get<CourseAttachmentOut[]>(`/courses/${courseId}/attachments`),
    retry: false,
  })
  if (list.isPending || list.isError || !list.data?.length) return null
  return (
    <section aria-label="ملفات السلسلة" className="mt-6">
      <h2 className="font-heading mb-2 text-xl font-bold">ملفات السلسلة</h2>
      <ul className="grid gap-2">
        {list.data.filter((a) => a.has_file).map((a) => (
          <li key={a.id} className="card flex flex-wrap items-center justify-between gap-2 rounded-2xl p-4">
            <div>
              <p className="font-bold">
                {a.title}{' '}
                {a.is_main_book && (
                  <span className="rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: 'var(--gold)' }}>
                    الكتاب الأساسي
                  </span>
                )}
              </p>
              {a.description && <p className="muted-t text-sm">{a.description}</p>}
            </div>
            <button type="button" onClick={() => openAttachmentFile('course', a.id)} className="btn-secondary transition-ui rounded-xl px-4 py-1.5">
              فتح
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Attachments({ courseId, lessonId }: { courseId: string; lessonId: string }) {
  const list = useQuery({
    queryKey: ['attachments', lessonId],
    queryFn: () => api.get<AttachmentOut[]>(`/courses/${courseId}/lessons/${lessonId}/attachments`),
    retry: false,
  })
  if (list.isPending) return <div className="skeleton mt-3 h-10 rounded-xl" aria-label="جار التحميل" />
  if (list.isError || !list.data?.length) return null
  return (
    <ul className="mt-3 grid gap-2">
      {list.data.filter((a) => a.has_file).map((a) => (
        <li key={a.id} className="card flex items-center justify-between gap-2 rounded-xl p-3 text-sm">
          <span>{a.title}</span>
          <button
            type="button"
            onClick={() => openAttachmentFile('lesson', a.id)}
            className="btn-secondary transition-ui shrink-0 rounded-lg px-4 py-1 text-xs font-bold"
          >
            فتح
          </button>
        </li>
      ))}
    </ul>
  )
}

export function LessonPage() {
  const { id = '' } = useParams()
  const lesson = useQuery({
    queryKey: ['lesson', id],
    queryFn: () => api.get<LessonOut>(`/lessons/${id}`),
  })
  const course = useQuery({
    queryKey: ['lesson-course', lesson.data?.course_id],
    queryFn: () => api.get<CourseOut>(`/courses/${lesson.data?.course_id}`),
    enabled: Boolean(lesson.data?.course_id),
  })
  // Ticket 16: no pages line anywhere for general courses.
  const showPages = course.data ? courseHasBook(course.data) : false

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-28 sm:px-6">
      {lesson.isPending && <Skeleton label="جار تحميل الدرس" className="h-40 rounded-2xl" />}
      {lesson.data && (
        <>
          {lesson.data.course_id && (
            <Link to={`/courses/${lesson.data.course_id}`} className="text-sm underline">
              → عودة إلى السلسلة
            </Link>
          )}
          <h1 className="font-heading mt-1 text-2xl font-bold">{lesson.data.title}</h1>
          {lesson.data.description && <p className="muted-t mt-1 text-sm">{lesson.data.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <LessonBadge status={lesson.data.status} />
            {showPages && (lesson.data.pages_from != null || lesson.data.pages_to != null) && (
              <p className="muted-t text-sm" dir="ltr">
                صفحات {lesson.data.pages_from ?? '?'} – {lesson.data.pages_to ?? '?'}
              </p>
            )}
          </div>
          {/* Title lives in the page h1 above — the cassette shows Side-A only. */}
          {/* Roomy outer arch (p-8) so the outer frame clearly dominates the
              smaller inner cassette arch instead of hugging it. */}
          <div className="card arch mt-4 p-6 sm:p-8">
            {lesson.data.status === 'ready' ? (
              <AudioPlayer
                fetchUrl={async () => {
                  const p = await api.get<PlayOut>(`/lessons/${id}/play`)
                  return p.playback_url
                }}
              />
            ) : lesson.data.status === 'failed' ? (
              <p>فشل تجهيز الدرس — سيعيد الشيخ رفعه.</p>
            ) : (
              <p>الدرس قيد التجهيز…</p>
            )}
          </div>
          <Attachments courseId={lesson.data.course_id} lessonId={id} />
        </>
      )}
      {lesson.isError && <p role="alert">تعذّر تحميل الدرس (للأعضاء المقبولين فقط)</p>}
    </main>
  )
}
