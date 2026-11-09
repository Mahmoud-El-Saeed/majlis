import type { EnrollmentStatus, LessonStatus, WindowStatus } from '../api/types'
import { enrollmentBadge } from '../features/enrollment/gates'

export function EnrollmentBadge({ status }: { status: EnrollmentStatus }) {
  return (
    <span className="badge-primary transition-ui inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold">
      {enrollmentBadge(status)}
    </span>
  )
}

const lessonAr: Record<LessonStatus, string> = {
  pending: 'بانتظار',
  processing: 'يُجهّز',
  ready: 'جاهز',
}

export function LessonBadge({ status }: { status: LessonStatus }) {
  const cls = status === 'ready' ? 'badge-primary' : 'badge-secondary'
  return (
    <span className={`${cls} transition-ui inline-flex items-center rounded-full px-3 py-1 text-xs font-bold`}>
      {lessonAr[status]}
    </span>
  )
}

const windowAr: Record<WindowStatus, string> = {
  open: 'مفتوح',
  upcoming: 'لم يبدأ',
  closed: 'مغلق',
}

export function WindowBadge({ status }: { status: WindowStatus }) {
  return (
    <span
      className="transition-ui inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold"
      style={{ borderColor: 'var(--gold)' }}
    >
      {windowAr[status]}
    </span>
  )
}
