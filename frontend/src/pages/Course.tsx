import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/http'
import type {
  AttachmentOut,
  CourseOut,
  EnrollmentOut,
  LessonOut,
  LessonSummaryOut,
  PlayOut,
  StudentExamOut,
} from '../api/types'
import { canViewContent } from '../features/enrollment/gates'
import { hasAnswerLeak, isScoreVisible } from '../features/exams/helpers'
import { str } from '../i18n'
import { AudioPlayer } from '../components/AudioPlayer'
import { LessonBadge, WindowBadge } from '../components/Badges'
import { StarDivider } from '../components/Star8'
import emptyLessons from '../assets/empty-lessons.svg'
import lessonCover from '../assets/lesson-cover.svg'

export function CoursePage() {
  const { id = '' } = useParams()
  const course = useQuery({ queryKey: ['course', id], queryFn: () => api.get<CourseOut>(`/courses/${id}`) })
  const lessons = useQuery({
    queryKey: ['lessons', id],
    queryFn: () => api.get<LessonSummaryOut[]>(`/courses/${id}/lessons`),
  })
  const myEnrollment = useQuery({
    queryKey: ['my-enrollment', id],
    // 200 null when never joined; 404 only unknown course.
    queryFn: () => api.get<EnrollmentOut | null>(`/courses/${id}/my-enrollment`),
    retry: false,
  })
  const studentExams = useQuery({
    queryKey: ['student-exams', id],
    queryFn: () => api.get<StudentExamOut[]>(`/courses/${id}/student-exams`),
    retry: false,
  })

  const status = myEnrollment.data === null ? null : (myEnrollment.data?.status ?? null)
  const canView = myEnrollment.data === null ? false : canViewContent(status ?? undefined)

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-28 sm:px-6 lg:px-8">
      {course.data && <h1 className="font-heading text-3xl font-bold">{course.data.title}</h1>}
      <StarDivider />
      {myEnrollment.data === null && (
        <p className="card mt-4 rounded-2xl p-4">لم تنضم بعد — استخدم صندوق الانضمام في لوحتك.</p>
      )}
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <section aria-label="الدروس">
          <h2 className="font-heading mb-2 text-xl font-bold">{str.lessons}</h2>
          {lessons.isPending && <div className="skeleton h-24 rounded-2xl" />}
          {lessons.data?.length === 0 && (
            <div className="card rounded-2xl p-5 text-center">
              <img src={emptyLessons} alt="لا دروس" className="mx-auto mb-2" width={200} />
              <p className="muted-t">لا دروس منشورة بعد</p>
            </div>
          )}
          <ul className="grid gap-4">
            {lessons.data?.map((l) => (
              <li key={l.id} className="card arch arch-frame overflow-hidden">
                <div className="arch-img m-3 mb-0">
                  <img src={lessonCover} alt={`غلاف ${l.title}`} className="h-32 w-full object-cover" />
                </div>
                <div className="p-4">
                  <h3 className="font-heading font-bold">{l.title}</h3>
                  <p className="muted-t text-xs" dir="ltr">
                    {l.pages_from ?? '?'} – {l.pages_to ?? '?'}
                  </p>
                  <div className="mt-1">
                    <LessonBadge status={l.status} />
                  </div>
                  {canView && l.status === 'ready' ? (
                    <Link
                      to={`/lessons/${l.id}`}
                      className="btn-primary transition-ui mt-2 inline-block rounded-xl px-4 py-1.5"
                    >
                      استمع
                    </Link>
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
        <section aria-label="الاختبارات">
          <h2 className="font-heading mb-2 text-xl font-bold">{str.exams}</h2>
          {studentExams.isError && (
            <p className="muted-t text-sm">الاختبارات للأعضاء المقبولين فقط</p>
          )}
          <ul className="grid gap-3">
            {studentExams.data?.map((ex) => {
              if (hasAnswerLeak(ex)) return null
              return (
                <li key={ex.id} className="card rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-heading font-bold">{ex.title}</h3>
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
                    دخول الاختبار
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </main>
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
        <li key={a.id} className="card rounded-xl p-3 text-sm">
          {a.title}
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

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-28 sm:px-6">
      {lesson.data && (
        <>
          <h1 className="font-heading text-2xl font-bold">{lesson.data.title}</h1>
          <p className="muted-t text-sm" dir="ltr">
            صفحات {lesson.data.pages_from ?? '?'} – {lesson.data.pages_to ?? '?'}
          </p>
          <div className="mt-1">
            <LessonBadge status={lesson.data.status} />
          </div>
          <div className="card arch arch-frame mt-4 p-5">
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
