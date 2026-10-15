import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { ApiError } from '../api/client'
import { api } from '../api/http'
import type {
  AttachmentOut,
  CourseOut,
  LessonOut,
  LessonSummaryOut,
  PlayOut,
  UploadUrlOut,
} from '../api/types'
import { localizeDetail, str } from '../i18n'
import {
  courseHasBook,
  MAX_ATTACHMENT_BYTES,
  openAttachmentFile,
  putFileToUrl,
} from '../features/courses/helpers'
import { LessonBadge } from '../components/Badges'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DropZone } from '../components/DropZone'
import { DynamicButton, type DynamicButtonState } from '../components/DynamicButton'
import { Skeleton } from '../components/Skeleton'
import { TACTILE_SPRING, useReducedMotion } from '../components/tactile'
import { useToast } from '../components/Toast'
import { LessonUpload } from './Teach'
import { fieldCls, fieldStyle } from './Auth'

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
            saveFailed={saveEdit.isError}
          />
          <section aria-label="الملف الصوتي" className="card mt-4 rounded-2xl p-5">
            <h2 className="font-heading mb-2 font-bold">الملف الصوتي</h2>
            <LessonAudioManager
              lesson={lesson.data}
              lessonId={lessonId}
              onDone={() => {
                qc.invalidateQueries({ queryKey: ['lesson-manage', lessonId] })
                qc.invalidateQueries({ queryKey: ['lessons-manage', courseId] })
              }}
              onDeleteRequest={() => setConfirmDelete(true)}
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
  saveFailed,
}: {
  initial: LessonOut
  hasBook: boolean
  onSave: (draft: LessonOut) => void
  saving: boolean
  saveFailed: boolean
}) {
  const [draft, setDraft] = useState(initial)
  // Collapsed by default: the header below keeps title + status visible so
  // nothing is lost; the chevron toggles the full edit form.
  const [expanded, setExpanded] = useState(false)
  const formId = useId()
  const reduceMotion = useReducedMotion()
  // Done flash: show تم الحفظ briefly after a successful save only —
  // failures surface through the parent alert, never the done label.
  const [savedFlash, setSavedFlash] = useState(false)
  const wasSaving = useRef(false)
  useEffect(() => {
    if (saving) {
      wasSaving.current = true
      setSavedFlash(false)
      return
    }
    if (wasSaving.current) {
      wasSaving.current = false
      if (!saveFailed) {
        setSavedFlash(true)
        const t = window.setTimeout(() => setSavedFlash(false), 1600)
        return () => window.clearTimeout(t)
      }
    }
  }, [saving, saveFailed])
  const dynState: DynamicButtonState = saving ? 'busy' : savedFlash ? 'done' : 'idle'
  return (
    <section aria-label="بيانات الدرس" className="card mt-3 rounded-2xl p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="font-heading font-bold">بيانات الدرس</h2>
          <span dir="auto" className="muted-t truncate text-sm">
            {initial.title}
          </span>
          <LessonBadge status={initial.status} />
        </div>
        <motion.button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={formId}
          aria-label={expanded ? str.collapseInfo : str.expandInfo}
          whileTap={reduceMotion ? undefined : { scale: 0.94 }}
          transition={TACTILE_SPRING}
          className="transition-ui clickable flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
          style={{ borderColor: 'var(--border)' }}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            width="16"
            height="16"
            fill="none"
            style={{
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: reduceMotion ? 'none' : 'transform 200ms var(--ease-tactile)',
            }}
          >
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </motion.button>
      </div>
      {expanded && (
        <form
          id={formId}
          className="mt-2 grid gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            onSave(draft)
          }}
        >
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
          <DynamicButton type="submit" state={dynState} width="full" />
        </form>
      )}
    </section>
  )
}

function formatMmSs(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '00:00'
  const m = Math.floor(totalSeconds / 60)
  const s = Math.floor(totalSeconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Lazy audio duration: fetches the short-lived playback URL, preloads
// metadata through a short-lived Audio element, caches the mm:ss label in
// state, and stays silent on any failure (badge + actions still render).
function useLessonAudioDuration(lessonId: string, audioKey: string | null, enabled: boolean) {
  const [duration, setDuration] = useState<string | null>(null)
  useEffect(() => {
    setDuration(null)
  }, [lessonId, audioKey])
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let el: HTMLAudioElement | null = null
    void (async () => {
      try {
        const p = await api.get<PlayOut>(`/lessons/${lessonId}/play`)
        if (cancelled || !p?.playback_url) return
        el = new Audio()
        el.preload = 'metadata'
        el.src = p.playback_url
        const secs: number = await new Promise<number>((resolve, reject) => {
          const a = el
          if (!a) {
            reject(new Error('no element'))
            return
          }
          const onLoaded = () => {
            a.removeEventListener('loadedmetadata', onLoaded)
            a.removeEventListener('error', onError)
            resolve(a.duration)
          }
          const onError = () => {
            a.removeEventListener('loadedmetadata', onLoaded)
            a.removeEventListener('error', onError)
            reject(new Error('metadata'))
          }
          a.addEventListener('loadedmetadata', onLoaded)
          a.addEventListener('error', onError)
        })
        if (cancelled) return
        if (Number.isFinite(secs) && secs >= 0) setDuration(formatMmSs(secs))
      } catch {
        // Silent: duration simply stays hidden.
      }
    })()
    return () => {
      cancelled = true
      if (el) {
        el.removeAttribute('src')
        try {
          el.load()
        } catch {
          // jsdom / detached element — ignore.
        }
        el = null
      }
    }
  }, [lessonId, audioKey, enabled])
  return duration
}

// Post-upload audio summary. Before any upload (status !== ready) the
// picker-first LessonUpload UI is kept exactly as-is. Once ready, a summary
// line (status badge + lazy mm:ss + replace/delete) replaces the bare
// toggle; استبدال reopens the picker, حذف reuses the page's existing
// lesson-delete confirm (no audio-only delete endpoint exists).
function LessonAudioManager({
  lesson,
  lessonId,
  onDone,
  onDeleteRequest,
}: {
  lesson: LessonOut
  lessonId: string
  onDone: () => void
  onDeleteRequest: () => void
}) {
  const [replacing, setReplacing] = useState(false)
  const ready = lesson.status === 'ready'
  const duration = useLessonAudioDuration(lessonId, lesson.audio_key ?? null, ready && !replacing)
  if (!ready || replacing) {
    return (
      <div>
        <LessonUpload
          lessonId={lessonId}
          defaultOpen={replacing ? true : lesson.status !== 'ready'}
          onDone={() => {
            setReplacing(false)
            onDone()
          }}
        />
        {replacing && ready && (
          <button
            type="button"
            onClick={() => setReplacing(false)}
            className="transition-ui clickable mt-2 rounded-xl border px-4 py-1.5 text-sm"
            style={{ borderColor: 'var(--border)' }}
          >
            {str.cancel}
          </button>
        )}
      </div>
    )
  }
  return (
    <div className="mt-2 rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
      <div className="flex flex-wrap items-center gap-2">
        <LessonBadge status={lesson.status} />
        {duration && (
          <span dir="ltr" className="text-sm tabular-nums">
            {duration}
          </span>
        )}
        <span className="flex flex-wrap items-center gap-2" style={{ marginInlineStart: 'auto' }}>
          <button
            type="button"
            onClick={() => setReplacing(true)}
            className="transition-ui clickable rounded-xl border px-3 py-1 text-sm"
            style={{ borderColor: 'var(--border)' }}
          >
            {str.replaceFile}
          </button>
          <button
            type="button"
            onClick={onDeleteRequest}
            className="transition-ui clickable rounded-xl border px-3 py-1 text-sm"
            style={{ borderColor: 'var(--secondary)' }}
          >
            {str.deleteFile}
          </button>
        </span>
      </div>
    </div>
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
  // Done flash only on true success (set inside try, never on catch).
  const [doneFlash, setDoneFlash] = useState(false)
  const flashDone = () => {
    setDoneFlash(true)
    window.setTimeout(() => setDoneFlash(false), 1600)
  }
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  // Per-row replace: inline DropZone swap + upload reusing the same
  // upload-url → PUT → confirm steps as the create form.
  const [replaceId, setReplaceId] = useState<string | null>(null)
  const [rowFiles, setRowFiles] = useState<Record<string, File | null>>({})
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({})
  const [rowDone, setRowDone] = useState<Record<string, boolean>>({})
  const flashRowDone = (attId: string) => {
    setRowDone((f) => ({ ...f, [attId]: true }))
    window.setTimeout(() => setRowDone((f) => ({ ...f, [attId]: false })), 1600)
  }

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
      flashDone()
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

  // Per-row replace upload: same ext/size gates and upload-url → PUT →
  // confirm steps (and identical rejection toasts) as the create form.
  const replaceUpload = async (attId: string) => {
    const picked = rowFiles[attId]
    if (!picked) return
    const ext = extOf(picked.name)
    if (!LESSON_ATTACHMENT_EXTS.includes(ext as (typeof LESSON_ATTACHMENT_EXTS)[number])) {
      toast('صيغة غير مدعومة — المسموح: PDF و PNG و JPEG و WEBP')
      return
    }
    if (picked.size > MAX_ATTACHMENT_BYTES) {
      toast('الملف كبير (أقصى 100MB) — يفضل ضغطه ثم إعادة المحاولة')
      return
    }
    setRowBusy((b) => ({ ...b, [attId]: true }))
    try {
      const u = await api.post<UploadUrlOut>(`/lesson-attachments/${attId}/upload-url`, {
        content_type: contentTypeOf(picked),
        file_ext: ext,
      })
      await putFileToUrl(u.upload_url, picked, contentTypeOf(picked))
      await api.post(`/lesson-attachments/${attId}/confirm`, { object_key: u.object_key })
      setRowFiles((f) => ({ ...f, [attId]: null }))
      setReplaceId(null)
      refresh()
      flashRowDone(attId)
    } catch (ex) {
      toast(ex instanceof ApiError ? localizeDetail(ex.detail) : 'فشل الرفع — أعد المحاولة برابط جديد')
    } finally {
      setRowBusy((b) => ({ ...b, [attId]: false }))
    }
  }

  const openFile = async (attId: string) => {
    try {
      await openAttachmentFile('lesson', attId)
    } catch (ex) {
      toast(ex instanceof ApiError ? localizeDetail(ex.detail) : 'تعذّر الفتح')
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
        <DropZone
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          onFile={(picked) => setFile(picked)}
          disabled={busy}
          label="ملف (PDF/PNG/JPEG/WEBP — أقصى 100MB)"
          fileName={file?.name ?? null}
        />
        <DynamicButton
          type="submit"
          width="full"
          variant="secondary"
          disabled={!file || busy}
          state={busy ? 'busy' : doneFlash ? 'done' : 'idle'}
          idleLabel={str.addAndUpload}
          busyLabel={str.uploadingNow}
          doneLabel={str.uploadDone}
        />
      </form>
      <ul className="mt-2 grid gap-2 text-sm">
        {(list.data ?? []).map((a) => (
          <li key={a.id} className="rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
            <div className="flex flex-wrap items-center gap-2">
              <p dir="auto" className="font-bold">
                {a.title}
              </p>
              {a.has_file ? (
                <span className="badge-primary transition-ui inline-flex items-center rounded-full px-3 py-1 text-xs font-bold">
                  جاهز
                </span>
              ) : (
                <span
                  className="transition-ui inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold"
                  style={{ borderColor: 'var(--gold)' }}
                >
                  بانتظار الملف
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => openFile(a.id)}
                disabled={!a.has_file}
                className="btn-secondary transition-ui clickable rounded-xl px-4 py-1.5 text-sm"
              >
                {str.openFile}
              </button>
              <button
                type="button"
                onClick={() => setReplaceId((cur) => (cur === a.id ? null : a.id))}
                aria-expanded={replaceId === a.id}
                aria-controls={`replace-${a.id}`}
                className="transition-ui clickable rounded-xl border px-4 py-1.5 text-sm"
                style={{ borderColor: 'var(--border)' }}
              >
                {str.replaceFile}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete({ id: a.id, title: a.title })}
                className="transition-ui clickable rounded-xl border px-4 py-1.5 text-sm"
                style={{ borderColor: 'var(--secondary)' }}
              >
                {str.deleteFile}
              </button>
            </div>
            {replaceId === a.id && (
              <div id={`replace-${a.id}`} className="mt-2 grid gap-2">
                <DropZone
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onFile={(picked) => setRowFiles((f) => ({ ...f, [a.id]: picked }))}
                  disabled={!!rowBusy[a.id]}
                  label="ملف (PDF/PNG/JPEG/WEBP — أقصى 100MB)"
                  fileName={rowFiles[a.id]?.name ?? null}
                />
                <DynamicButton
                  type="button"
                  variant="secondary"
                  disabled={!rowFiles[a.id] || rowBusy[a.id]}
                  onClick={() => replaceUpload(a.id)}
                  state={rowBusy[a.id] ? 'busy' : rowDone[a.id] ? 'done' : 'idle'}
                  idleLabel={str.upload}
                  busyLabel={str.uploadingNow}
                  doneLabel={str.uploadDone}
                />
              </div>
            )}
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
