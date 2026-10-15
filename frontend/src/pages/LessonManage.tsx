import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { api } from '../api/http'
import type { AttachmentOut, CourseOut, LessonOut, LessonSummaryOut, UploadUrlOut } from '../api/types'
import { localizeDetail, str } from '../i18n'
import { courseHasBook, MAX_ATTACHMENT_BYTES, putFileToUrl } from '../features/courses/helpers'
import { LessonBadge } from '../components/Badges'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Skeleton } from '../components/Skeleton'
import { useToast } from '../components/Toast'
import { LessonUpload } from './Teach'
import { btnPrimary, fieldCls, fieldStyle } from './Auth'

export function LessonManagePage() {
  const { id: courseId = '', lessonId = '' } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const lesson = useQuery({
    queryKey: ['lesson-manage', lessonId],
    queryFn: () => api.get<LessonOut>(`/lessons/${lessonId}`),
  })
  const course = useQuery({
    queryKey: ['course-manage', courseId],
    queryFn: () => api.get<CourseOut>(`/courses/${courseId}`),
  })
  // Lesson number: preferred via Link state {index} from the manage list,
  // fallback finds the position in the course lessons list (index+1).
  const loc = useLocation() as { state?: { index?: unknown } }
  const stateIndex = typeof loc.state?.index === 'number' ? loc.state.index : null
  const lessonsList = useQuery({
    queryKey: ['lessons-manage', courseId],
    queryFn: () => api.get<LessonSummaryOut[]>(`/courses/${courseId}/lessons`),
    enabled: stateIndex == null,
  })
  let lessonNumber: number | null = stateIndex
  if (lessonNumber == null && lessonsList.data) {
    const idx = lessonsList.data.findIndex((l) => l.id === lessonId)
    lessonNumber = idx >= 0 ? idx + 1 : null
  }
  const hasBook = course.data ? courseHasBook(course.data) : false
  const [err, setErr] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const saveEdit = useMutation({
    mutationFn: (draft: LessonOut) =>
      api.put<LessonOut>(`/lessons/${lessonId}`, {
        title: draft.title,
        description: draft.description,
        lesson_date: draft.lesson_date,
        pages_from: draft.pages_from,
        pages_to: draft.pages_to,
        transcript_voice: draft.transcript_voice,
        transcript_book: draft.transcript_book,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lesson-manage', lessonId] })
      qc.invalidateQueries({ queryKey: ['lessons-manage', courseId] })
    },
    onError: (e) => setErr(e instanceof ApiError ? localizeDetail(e.detail) : 'تعذّر الحفظ'),
  })

  const deleteLesson = async () => {
    setDeleteBusy(true)
    try {
      await api.delete(`/lessons/${lessonId}`)
      nav(`/teach/courses/${courseId}`)
    } catch (e) {
      setErr(e instanceof ApiError ? localizeDetail(e.detail) : 'تعذّر الحذف')
      setConfirmDelete(false)
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-28 sm:px-6">
      <Link to={`/teach/courses/${courseId}`} className="text-sm underline">
        → إدارة الدروس
      </Link>
      {lesson.isPending && <Skeleton label="جار تحميل الدرس" className="mt-2 h-40 rounded-2xl" />}
      {lesson.data && (
        <>
          <div className="mt-1 flex items-center justify-between gap-2">
            <h1 className="font-heading text-2xl font-bold">{lesson.data.title}</h1>
            <LessonBadge status={lesson.data.status} />
          </div>
          {lessonNumber != null && (
            <p className="muted-t mt-1 text-sm">
              {str.lessonNumber} <span dir="ltr">{lessonNumber}</span>
            </p>
          )}
          {err && (
            <p role="alert" className="mt-2 text-sm" style={{ color: 'var(--secondary)' }}>
              {err}
            </p>
          )}
          <LessonInfoForm
            key={lesson.data.id}
            initial={lesson.data}
            hasBook={hasBook}
            onSave={(draft) => saveEdit.mutate(draft)}
            saving={saveEdit.isPending}
          />
          <section aria-label="الملف الصوتي" className="card mt-4 rounded-2xl p-5">
            <h2 className="font-heading mb-2 font-bold">الملف الصوتي</h2>
            <LessonUpload
              lessonId={lessonId}
              defaultOpen={lesson.data.status !== 'ready'}
              onDone={() => {
                qc.invalidateQueries({ queryKey: ['lesson-manage', lessonId] })
                qc.invalidateQueries({ queryKey: ['lessons-manage', courseId] })
              }}
            />
          </section>
          <section aria-label="مرفقات الدرس" className="card mt-4 rounded-2xl p-5">
            <h2 className="font-heading mb-2 font-bold">مرفقات الدرس (PDF/صور)</h2>
            <LessonAttachmentsManager courseId={courseId} lessonId={lessonId} defaultOpen />
          </section>
          <section aria-label="منطقة الخطر" className="card mt-4 rounded-2xl p-5" style={{ borderColor: 'var(--secondary)' }}>
            <h2 className="font-heading mb-2 font-bold">حذف الدرس</h2>
            <p className="muted-t mb-2 text-sm">سيتم حذف الدرس نهائيًا مع تسجيله الصوتي ومرفقاته.</p>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="transition-ui clickable rounded-xl border px-4 py-1.5 text-sm"
              style={{ borderColor: 'var(--secondary)' }}
            >
              حذف الدرس
            </button>
          </section>
        </>
      )}
      {confirmDelete && lesson.data && (
        <ConfirmDialog
          title="حذف الدرس"
          message={`سيتم حذف «${lesson.data.title}» نهائيًا مع تسجيله الصوتي ومرفقاته. لا يمكن التراجع.`}
          confirmLabel="حذف نهائي"
          busy={deleteBusy}
          onConfirm={deleteLesson}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </main>
  )
}

function LessonInfoForm({
  initial,
  hasBook,
  onSave,
  saving,
}: {
  initial: LessonOut
  hasBook: boolean
  onSave: (draft: LessonOut) => void
  saving: boolean
}) {
  const [draft, setDraft] = useState(initial)
  return (
    <form
      className="card mt-3 grid gap-2 rounded-2xl p-5"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(draft)
      }}
    >
      <h2 className="font-heading font-bold">بيانات الدرس</h2>
      <label>
        <span className="mb-1 block text-sm">العنوان</span>
        <input
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          required
          className={fieldCls}
          style={fieldStyle}
        />
      </label>
      <label>
        <span className="mb-1 block text-sm">وصف (اختياري)</span>
        <input
          value={draft.description ?? ''}
          onChange={(e) => setDraft({ ...draft, description: e.target.value || null })}
          className={fieldCls}
          style={fieldStyle}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="mb-1 block text-sm">تاريخ الدرس</span>
          <input
            type="date"
            value={draft.lesson_date ?? ''}
            onChange={(e) => setDraft({ ...draft, lesson_date: e.target.value || null })}
            dir="ltr"
            className={fieldCls}
            style={fieldStyle}
          />
        </label>
        <span />
        {hasBook && (
          <>
            <label>
              <span className="mb-1 block text-sm">من صفحة (اختياري)</span>
              <input
                value={draft.pages_from ?? ''}
                onChange={(e) =>
                  setDraft({ ...draft, pages_from: e.target.value ? Number(e.target.value) : null })
                }
                inputMode="numeric"
                dir="ltr"
                className={fieldCls}
                style={fieldStyle}
              />
            </label>
            <label>
              <span className="mb-1 block text-sm">إلى صفحة (اختياري)</span>
              <input
                value={draft.pages_to ?? ''}
                onChange={(e) =>
                  setDraft({ ...draft, pages_to: e.target.value ? Number(e.target.value) : null })
                }
                inputMode="numeric"
                dir="ltr"
                className={fieldCls}
                style={fieldStyle}
              />
            </label>
          </>
        )}
      </div>
      <label>
        <span className="mb-1 block text-sm">نص ما قيل (صوت)</span>
        <textarea
          value={draft.transcript_voice ?? ''}
          onChange={(e) => setDraft({ ...draft, transcript_voice: e.target.value })}
          rows={5}
          className={fieldCls}
          style={fieldStyle}
        />
      </label>
      <label>
        <span className="mb-1 block text-sm">نص صفحات الكتاب</span>
        <textarea
          value={draft.transcript_book ?? ''}
          onChange={(e) => setDraft({ ...draft, transcript_book: e.target.value })}
          rows={5}
          className={fieldCls}
          style={fieldStyle}
        />
      </label>
      <button type="submit" disabled={saving} className={btnPrimary}>
        حفظ
      </button>
    </form>
  )
}

const LESSON_ATTACHMENT_EXTS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp'] as const

export function LessonAttachmentsManager({
  courseId,
  lessonId,
  defaultOpen = false,
}: {
  courseId: string
  lessonId: string
  defaultOpen?: boolean
}) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [open, setOpen] = useState(defaultOpen)
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const list = useQuery({
    queryKey: ['lesson-attachments-manage', lessonId],
    queryFn: () => api.get<AttachmentOut[]>(`/courses/${courseId}/lessons/${lessonId}/attachments`),
    enabled: open,
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['lesson-attachments-manage', lessonId] })

  const extOf = (name: string) => {
    const dot = name.lastIndexOf('.')
    return dot >= 0 ? name.slice(dot).toLowerCase() : ''
  }
  const contentTypeOf = (f: File) => {
    if (f.type) return f.type
    const ext = extOf(f.name)
    if (ext === '.pdf') return 'application/pdf'
    if (ext === '.png') return 'image/png'
    if (ext === '.webp') return 'image/webp'
    return 'image/jpeg'
  }

  const createAndUpload = async (e: FormEvent) => {
    e.preventDefault()
    if (!file) return
    const ext = extOf(file.name)
    if (!LESSON_ATTACHMENT_EXTS.includes(ext as (typeof LESSON_ATTACHMENT_EXTS)[number])) {
      toast('صيغة غير مدعومة — المسموح: PDF و PNG و JPEG و WEBP')
      return
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast('الملف كبير (أقصى 100MB) — يفضل ضغطه ثم إعادة المحاولة')
      return
    }
    setBusy(true)
    try {
      const created = await api.post<AttachmentOut>(`/courses/${courseId}/lessons/${lessonId}/attachments`, {
        title,
      })
      const u = await api.post<UploadUrlOut>(`/lesson-attachments/${created.id}/upload-url`, {
        content_type: contentTypeOf(file),
        file_ext: ext,
      })
      await putFileToUrl(u.upload_url, file, contentTypeOf(file))
      await api.post(`/lesson-attachments/${created.id}/confirm`, { object_key: u.object_key })
      setTitle('')
      setFile(null)
      refresh()
    } catch (ex) {
      toast(ex instanceof ApiError ? localizeDetail(ex.detail) : 'فشل الرفع — أعد المحاولة برابط جديد')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (attId: string) => {
    setDeleteBusy(true)
    try {
      await api.delete(`/lesson-attachments/${attId}`)
      refresh()
      setConfirmDelete(null)
    } catch (ex) {
      toast(ex instanceof ApiError ? localizeDetail(ex.detail) : 'تعذّر الحذف')
    } finally {
      setDeleteBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="transition-ui clickable mt-2 rounded-xl border px-3 py-1 text-sm"
        style={{ borderColor: 'var(--border)' }}
      >
        مرفقات الدرس (PDF/صور)
      </button>
    )
  }
  return (
    <div className="mt-2 rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
      <form className="grid gap-2" onSubmit={createAndUpload}>
        <label className="text-sm">
          عنوان المرفق
          <input value={title} onChange={(e) => setTitle(e.target.value)} required className={fieldCls} style={fieldStyle} />
        </label>
        <label className="text-sm">
          ملف (PDF/PNG/JPEG/WEBP — أقصى 100MB)
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm"
          />
        </label>
        <button type="submit" disabled={!file || busy} className="btn-secondary transition-ui rounded-xl px-4 py-1.5">
          إضافة ورفع
        </button>
      </form>
      <ul className="mt-2 grid gap-1 text-sm">
        {(list.data ?? []).map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2">
            <span>
              {a.title} · <span className="muted-t">{a.has_file ? 'جاهز' : 'بانتظار الملف'}</span>
            </span>
            <button type="button" onClick={() => setConfirmDelete({ id: a.id, title: a.title })} className="underline">
              حذف
            </button>
          </li>
        ))}
      </ul>
      {confirmDelete && (
        <ConfirmDialog
          title="حذف المرفق"
          message={`سيتم حذف «${confirmDelete.title}» نهائيًا. لا يمكن التراجع.`}
          confirmLabel="حذف نهائي"
          busy={deleteBusy}
          onConfirm={() => remove(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
