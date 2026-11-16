import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { api } from '../api/http'
import type {
  CourseAttachmentOut,
  CourseOut,
  LessonOut,
  LessonSummaryOut,
  UploadUrlOut,
} from '../api/types'
import { detailById, localizeDetail, str } from '../i18n'
import {
  MAX_ATTACHMENT_BYTES,
  courseHasBook,
  matchesArabic,
  openAttachmentFile,
  putFileToUrl,
} from '../features/courses/helpers'
import { LessonBadge } from '../components/Badges'
import { NumberBadge } from '../components/NumberBadge'
import { SearchBox } from '../components/SearchBox'
import { Fab } from '../components/Fab'
import { GoldFoil } from '../components/GoldFoil'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DropZone } from '../components/DropZone'
import { DynamicButton } from '../components/DynamicButton'
import { useToast } from '../components/Toast'
import { fieldCls, fieldStyle } from './Auth'

export function CourseManagePage() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const lessons = useQuery({
    queryKey: ['lessons-manage', id],
    queryFn: () => api.get<LessonSummaryOut[]>(`/courses/${id}/lessons`),
  })
  const course = useQuery({
    queryKey: ['course-manage', id],
    queryFn: () => api.get<CourseOut>(`/courses/${id}`),
  })
  // Ticket 16: pages range exists only for book-based courses.
  const hasBook = course.data ? courseHasBook(course.data) : false
  const [tab, setTab] = useState<'lessons' | 'files'>('lessons')
  const [showNew, setShowNew] = useState(false)
  const [query, setQuery] = useState('')
  // Numbering = index+1 in the FULL ordered list; filter keeps full-list numbers.
  const numberedLessons = (lessons.data ?? []).map((l, i) => ({ lesson: l, n: i + 1 }))
  const visibleLessons = numberedLessons.filter(({ lesson: l }) => matchesArabic(l.title, query))

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pt-28 sm:px-6">
      <Link to="/teach" className="underline text-sm">
        → لوحة المعلم
      </Link>
      <h1 className="font-heading mt-1 text-2xl font-bold">إدارة الدروس</h1>
      <div className="mt-2 flex flex-wrap gap-2 text-sm">
        <Link
          to={`/teach/courses/${id}/codes`}
          className="transition-ui clickable rounded-xl border px-4 py-1.5"
          style={{ borderColor: 'var(--gold)' }}
        >
          الرموز والطلبات
        </Link>
        <Link
          to={`/teach/courses/${id}/exams`}
          className="transition-ui clickable rounded-xl border px-4 py-1.5"
          style={{ borderColor: 'var(--border)' }}
        >
          الاختبارات
        </Link>
      </div>
      <div className="mt-3 flex gap-2" role="tablist" aria-label="أقسام الإدارة">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'lessons'}
          onClick={() => setTab('lessons')}
          className={`transition-ui rounded-xl border px-4 py-1.5 ${tab === 'lessons' ? 'btn-primary' : 'clickable'}`}
          style={tab === 'lessons' ? undefined : { borderColor: 'var(--border)' }}
        >
          الدروس
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'files'}
          onClick={() => setTab('files')}
          className={`transition-ui rounded-xl border px-4 py-1.5 ${tab === 'files' ? 'btn-primary' : 'clickable'}`}
          style={tab === 'files' ? undefined : { borderColor: 'var(--border)' }}
        >
          مرفقات السلسلة
        </button>
      </div>

      {tab === 'lessons' && (
      <>
      {(lessons.data?.length ?? 0) > 0 && (
        <div className="mt-3">
          <SearchBox value={query} onChange={setQuery} placeholder={str.searchLessonsPlaceholder} />
        </div>
      )}
      {query && (lessons.data?.length ?? 0) > 0 && (
        <p className="muted-t mt-1 text-xs">
          {str.resultCount}: <span dir="ltr">{visibleLessons.length}</span>
        </p>
      )}
      <ul className="mt-4 grid gap-2">
        {lessons.data?.length === 0 && (
          <li className="card rounded-2xl p-5 text-center">
            <p className="muted-t">لا دروس بعد — أنشئ أول درس من زر + أسفل الشاشة</p>
          </li>
        )}
        {lessons.data && lessons.data.length > 0 && visibleLessons.length === 0 && (
          <li className="card rounded-2xl p-5 text-center">
            <p className="muted-t">{str.noResults}</p>
          </li>
        )}
        {visibleLessons.map(({ lesson: l, n }) => (
          <li key={l.id} className="card rounded-2xl p-4">
            <Link
              to={`/teach/courses/${id}/lessons/${l.id}`}
              state={{ index: n }}
              className="transition-ui clickable flex items-center justify-between gap-2"
              aria-label={`إدارة درس: ${l.title}`}
            >
              <span className="flex items-center gap-2">
                <NumberBadge n={n} />
                <span dir="auto" className="font-heading font-bold">{l.title}</span>
              </span>
              <LessonBadge status={l.status} />
            </Link>
          </li>
        ))}
      </ul>
      </>
      )}
      {tab === 'lessons' && <Fab label="درس جديد" expanded onClick={() => setShowNew(true)} />}
      {showNew && (
        <Modal title="درس جديد" onClose={() => setShowNew(false)}>
          <NewLessonForm
            courseId={id}
            hasBook={hasBook}
            onDone={() => {
              qc.invalidateQueries({ queryKey: ['lessons-manage', id] })
              setShowNew(false)
            }}
          />
        </Modal>
      )}

      {tab === 'files' && <CourseAttachmentsManager courseId={id} hasBook={hasBook} />}
    </main>
  )
}

function NewLessonForm({
  courseId,
  hasBook,
  onDone,
}: {
  courseId: string
  hasBook: boolean
  onDone: () => void
}) {
  const qc = useQueryClient()
  const nav = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [lessonDate, setLessonDate] = useState('')
  const [pagesFrom, setPagesFrom] = useState('')
  const [pagesTo, setPagesTo] = useState('')
  const [voice, setVoice] = useState('')
  const [book, setBook] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () =>
      api.post<LessonOut>(`/courses/${courseId}/lessons`, {
        title,
        description: description.trim() || undefined,
        lesson_date: lessonDate || undefined,
        pages_from: hasBook && pagesFrom ? Number(pagesFrom) : undefined,
        pages_to: hasBook && pagesTo ? Number(pagesTo) : undefined,
        transcript_voice: voice || undefined,
        transcript_book: book || undefined,
        media_type: 'audio',
      }),
    onSuccess: (lesson) => {
      setErr(null)
      qc.invalidateQueries({ queryKey: ['lessons-manage', courseId] })
      onDone()
      // Land on the lesson's own page: upload, transcripts, and files
      // all live there now.
      nav(`/teach/courses/${courseId}/lessons/${lesson.id}`)
    },
    onError: (e) => setErr(e instanceof ApiError ? localizeDetail(e.detail) : 'تعذّر الإنشاء'),
  })

  return (
    <>
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (pagesFrom && pagesTo && Number(pagesFrom) > Number(pagesTo)) {
            // The catalog entry for the backend's own rule — no raw field
            // names in the Arabic UI, and no copy of the backend wording here.
            setErr(detailById('lesson_pages_order'))
            return
          }
          create.mutate()
        }}
      >
        <label>
          <span className="mb-1 block text-sm">العنوان</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required className={fieldCls} style={fieldStyle} />
        </label>
        <label>
          <span className="mb-1 block text-sm">وصف (اختياري)</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={fieldCls} style={fieldStyle} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="mb-1 block text-sm">تاريخ الدرس</span>
            <input type="date" value={lessonDate} onChange={(e) => setLessonDate(e.target.value)} dir="ltr" className={fieldCls} style={fieldStyle} />
          </label>
          <span />
          {hasBook && (
            <>
              <label>
                <span className="mb-1 block text-sm">من صفحة (اختياري)</span>
                <input value={pagesFrom} onChange={(e) => setPagesFrom(e.target.value)} inputMode="numeric" dir="ltr" className={fieldCls} style={fieldStyle} />
              </label>
              <label>
                <span className="mb-1 block text-sm">إلى صفحة (اختياري)</span>
                <input value={pagesTo} onChange={(e) => setPagesTo(e.target.value)} inputMode="numeric" dir="ltr" className={fieldCls} style={fieldStyle} />
              </label>
            </>
          )}
        </div>
        <label>
          <span className="mb-1 block text-sm">نص ما قيل (صوت)</span>
          <textarea value={voice} onChange={(e) => setVoice(e.target.value)} rows={4} className={fieldCls} style={fieldStyle} />
        </label>
        <label>
          <span className="mb-1 block text-sm">نص صفحات الكتاب</span>
          <textarea value={book} onChange={(e) => setBook(e.target.value)} rows={4} className={fieldCls} style={fieldStyle} />
        </label>
        {/* Success navigates away, so only idle/busy states are reachable. */}
        <DynamicButton
          type="submit"
          width="full"
          state={create.isPending ? 'busy' : 'idle'}
          idleLabel={str.createLesson}
          busyLabel={str.creatingLesson}
          doneLabel={str.createLesson}
        />
      </form>
      {err && (
        <p role="alert" className="mt-2 text-sm" style={{ color: 'var(--secondary)' }}>
          {err}
        </p>
      )}
    </>
  )
}

function CourseAttachmentsManager({ courseId, hasBook }: { courseId: string; hasBook: boolean }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<Record<string, File | null>>({})
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  // Per-attachment done flash, set only on true success (inside try).
  const [doneFlash, setDoneFlash] = useState<Record<string, boolean>>({})
  const flashDone = (attId: string) => {
    setDoneFlash((f) => ({ ...f, [attId]: true }))
    window.setTimeout(() => setDoneFlash((f) => ({ ...f, [attId]: false })), 1600)
  }
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const list = useQuery({
    queryKey: ['course-attachments-manage', courseId],
    queryFn: () => api.get<CourseAttachmentOut[]>(`/courses/${courseId}/attachments`),
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['course-attachments-manage', courseId] })

  const create = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await api.post(`/courses/${courseId}/attachments`, {
        title,
        description: description.trim() || undefined,
      })
      setTitle('')
      setDescription('')
      refresh()
    } catch (ex) {
      toast(ex instanceof ApiError ? localizeDetail(ex.detail) : 'تعذّر الإنشاء')
    }
  }

  const upload = async (attId: string) => {
    const file = files[attId]
    if (!file) return
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast('الملف كبير (أقصى 100MB) — يفضل ضغطه ثم إعادة المحاولة')
      return
    }
    setBusy((b) => ({ ...b, [attId]: true }))
    try {
      const u = await api.post<UploadUrlOut>(`/course-attachments/${attId}/upload-url`, {
        content_type: file.type || 'application/pdf',
        file_ext: '.pdf',
      })
      await putFileToUrl(u.upload_url, file, file.type || 'application/pdf')
      await api.post(`/course-attachments/${attId}/confirm`, { object_key: u.object_key })
      setFiles((f) => ({ ...f, [attId]: null }))
      refresh()
      flashDone(attId)
    } catch (ex) {
      toast(ex instanceof ApiError ? localizeDetail(ex.detail) : 'فشل الرفع — أعد المحاولة برابط جديد')
    } finally {
      setBusy((b) => ({ ...b, [attId]: false }))
    }
  }

  const designate = async (attId: string) => {
    try {
      await api.post(`/course-attachments/${attId}/main`, {})
      toast('أصبح الكتاب الأساسي للسلسلة')
      refresh()
    } catch (ex) {
      toast(ex instanceof ApiError ? localizeDetail(ex.detail) : 'تعذّر التعيين')
    }
  }

  const remove = async (attId: string) => {
    setDeleteBusy(true)
    try {
      await api.delete(`/course-attachments/${attId}`)
      refresh()
      setConfirmDelete(null)
    } catch (ex) {
      toast(ex instanceof ApiError ? localizeDetail(ex.detail) : 'تعذّر الحذف')
    } finally {
      setDeleteBusy(false)
    }
  }

  const openFile = async (attId: string) => {
    try {
      await openAttachmentFile('course', attId)
    } catch (ex) {
      toast(ex instanceof ApiError ? localizeDetail(ex.detail) : 'تعذّر الفتح')
    }
  }

  return (
    <section aria-label="مرفقات السلسلة" className="card mt-4 rounded-2xl p-5">
      <h2 className="font-heading mb-2 font-bold">مرفقات السلسلة (PDF — أقصى 100MB للملف)</h2>
      <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={create}>
        <label>
          <span className="mb-1 block text-sm">عنوان المرفق</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required className={fieldCls} style={fieldStyle} />
        </label>
        <label>
          <span className="mb-1 block text-sm">وصف (اختياري)</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={fieldCls} style={fieldStyle} />
        </label>
        <button type="submit" className="btn-secondary transition-ui self-end rounded-xl px-4 py-2">
          إضافة
        </button>
      </form>
      <ul className="mt-3 grid gap-2">
        {(list.data ?? []).map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
            <div>
              <p className="font-bold">
                {a.title}{' '}
                {a.is_main_book && (
                  <GoldFoil>
                    <span className="rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: 'var(--gold)' }}>
                      الكتاب الأساسي
                    </span>
                  </GoldFoil>
                )}
              </p>
              <p className="muted-t text-xs">{a.has_file ? 'جاهز' : 'بانتظار رفع الملف'}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!a.has_file && (
                <div className="flex items-center gap-2 text-xs">
                  <DropZone
                    accept=".pdf,application/pdf"
                    onFile={(picked) => setFiles((f) => ({ ...f, [a.id]: picked }))}
                    disabled={!!busy[a.id]}
                    label={str.pdfFileLabel}
                    fileName={files[a.id]?.name ?? null}
                  />
                  <DynamicButton
                    type="button"
                    variant="secondary"
                    disabled={!files[a.id] || busy[a.id]}
                    onClick={() => upload(a.id)}
                    state={busy[a.id] ? 'busy' : doneFlash[a.id] ? 'done' : 'idle'}
                    idleLabel={str.upload}
                    busyLabel={str.uploadingNow}
                    doneLabel={str.uploadDone}
                  />
                </div>
              )}
              {a.has_file && (
                <button type="button" onClick={() => openFile(a.id)} className="underline">
                  فتح
                </button>
              )}
              {hasBook && !a.is_main_book && (
                <button type="button" onClick={() => designate(a.id)} className="underline">
                  تعيين ككتاب أساسي
                </button>
              )}
              <button
                type="button"
                onClick={() => setConfirmDelete({ id: a.id, title: a.title })}
                className="transition-ui clickable rounded-lg border px-3 py-1"
                style={{ borderColor: 'var(--secondary)' }}
              >
                حذف
              </button>
            </div>
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
    </section>
  )
}

