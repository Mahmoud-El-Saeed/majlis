import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { api } from '../api/http'
import type { CourseOut, DashboardOut, LessonOut, UploadUrlOut } from '../api/types'
import { courseHasBook, matchesArabic } from '../features/courses/helpers'
import { localizeDetail, str } from '../i18n'
import { Fab } from '../components/Fab'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { NumberBadge } from '../components/NumberBadge'
import { SearchBox } from '../components/SearchBox'
import { StarDivider } from '../components/Star8'
import { fieldCls, fieldStyle } from './Auth'

export function TeachDashboard() {
  const qc = useQueryClient()
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<DashboardOut>('/dashboard') })
  const [showNew, setShowNew] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const owned = (dash.data?.items ?? []).filter((i) => i.enrollment_status === 'owner' || i.enrollment_status === 'admin')

  const [query, setQuery] = useState('')
  // Numbering = index+1 in the FULL ordered list; filter keeps full-list numbers.
  const numberedOwned = owned.map((it, i) => ({ item: it, n: i + 1 }))
  const visibleOwned = numberedOwned.filter(({ item: it }) =>
    matchesArabic(`${it.course.title} ${it.course.book_title ?? ''}`, query),
  )

  const removeCourse = async (courseId: string) => {
    setDeleteBusy(true)
    try {
      await api.delete(`/courses/${courseId}`)
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setConfirmDelete(null)
    } catch (e) {
      setErr(e instanceof ApiError ? localizeDetail(e.detail) : 'تعذّر الحذف')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-28 sm:px-6 lg:px-8">
      <h1 className="font-heading text-3xl font-bold">لوحة المعلم</h1>
      <StarDivider />
      {err && (
        <p role="alert" className="mt-2 text-sm" style={{ color: 'var(--secondary)' }}>
          {err}
        </p>
      )}
      {!dash.isPending && owned.length === 0 && (
        <div className="card mt-4 rounded-2xl p-6 text-center">
          <p className="muted-t">لا سلاسل بعد — ابدأ أول سلسلة من زر + أسفل الشاشة</p>
        </div>
      )}
      {owned.length > 0 && (
        <div className="mt-4">
          <SearchBox value={query} onChange={setQuery} />
        </div>
      )}
      {query && owned.length > 0 && (
        <p className="muted-t mt-1 text-xs">
          {str.resultCount}: <span dir="ltr">{visibleOwned.length}</span>
        </p>
      )}
      {owned.length > 0 && visibleOwned.length === 0 && (
        <div className="card mt-4 rounded-2xl p-6 text-center">
          <p className="muted-t">{str.noResults}</p>
        </div>
      )}
      <ul className="mt-4 grid gap-4 sm:grid-cols-2">        {visibleOwned.map(({ item: it, n }) => (
          <li key={it.course.id} className="card arabesque rounded-2xl p-5">
            <div className="flex items-center gap-2">
              <NumberBadge n={n} />
              <h2 dir="auto" className="font-heading text-xl font-bold">{it.course.title}</h2>
            </div>
            <p className="muted-t text-sm">
              {it.ready_count}/{it.lesson_count} جاهزة
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link to={`/teach/courses/${it.course.id}`} className="btn-primary transition-ui rounded-xl px-4 py-1.5">
                إدارة الدروس
              </Link>              <Link
                to={`/teach/courses/${it.course.id}/codes`}
                className="transition-ui clickable rounded-xl border px-4 py-1.5"
                style={{ borderColor: 'var(--gold)' }}
              >
                الرموز والطلبات
              </Link>
              <Link
                to={`/teach/courses/${it.course.id}/exams`}
                className="transition-ui clickable rounded-xl border px-4 py-1.5"
                style={{ borderColor: 'var(--border)' }}
              >
                الاختبارات
              </Link>
              <CourseRename course={it.course} />
              <button
                type="button"
                onClick={() => setConfirmDelete({ id: it.course.id, title: it.course.title })}
                className="transition-ui clickable rounded-xl border px-4 py-1.5"
                style={{ borderColor: 'var(--secondary)' }}
              >
                حذف
              </button>
            </div>
          </li>
        ))}
      </ul>
      <Fab label="سلسلة جديدة" expanded onClick={() => setShowNew(true)} />
      {showNew && (
        <Modal title="سلسلة جديدة" onClose={() => setShowNew(false)}>
          <NewSeriesForm onDone={() => setShowNew(false)} />
        </Modal>
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="حذف السلسلة"
          message={`سيتم حذف «${confirmDelete.title}» نهائيًا مع دروسها واختباراتها. لا يمكن التراجع.`}
          confirmLabel="حذف نهائي"
          busy={deleteBusy}
          onConfirm={() => removeCourse(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
      {showNew && (
        <Modal title="سلسلة جديدة" onClose={() => setShowNew(false)}>
          <NewSeriesForm onDone={() => setShowNew(false)} />
        </Modal>
      )}
    </main>
  )
}

function NewSeriesForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<'book' | 'general'>('book')
  const [book, setBook] = useState('')
  const [description, setDescription] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () => {
      // Ticket 16: kind toggle is UI-only; the backend derives the kind from
      // whether a book name was stored. Book-based + empty name never leaves
      // the browser.
      if (kind === 'book' && !book.trim()) {
        throw new Error('bookNameRequired')
      }
      return api.post<CourseOut>('/courses', {
        title,
        description: description.trim() || undefined,
        book_title: kind === 'book' ? book.trim() || undefined : undefined,
      })
    },
    onSuccess: () => {
      setTitle('')
      setBook('')
      setDescription('')
      setErr(null)
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      onDone()
    },
    onError: (e) =>
      setErr(
        e instanceof Error && e.message === 'bookNameRequired'
          ? 'اخترت سلسلة بكتاب — اكتب اسم الكتاب أولًا'
          : e instanceof ApiError
            ? localizeDetail(e.detail)
            : 'تعذّر الإنشاء',
      ),
  })

  return (
    <>
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate()
        }}
      >
        <label>
          <span className="mb-1 block text-sm">العنوان</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required className={fieldCls} style={fieldStyle} />
        </label>
        <div>
          <span className="mb-1 block text-sm">نوع السلسلة</span>
          <div className="flex gap-2" role="radiogroup" aria-label="نوع السلسلة">
            <button
              type="button"
              role="radio"
              aria-checked={kind === 'book'}
              onClick={() => setKind('book')}
              className={`transition-ui rounded-xl border px-4 py-2 ${kind === 'book' ? 'btn-primary' : 'clickable'}`}
              style={kind === 'book' ? undefined : { borderColor: 'var(--border)' }}
            >
              شرح كتاب
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={kind === 'general'}
              onClick={() => setKind('general')}
              className={`transition-ui rounded-xl border px-4 py-2 ${kind === 'general' ? 'btn-primary' : 'clickable'}`}
              style={kind === 'general' ? undefined : { borderColor: 'var(--border)' }}
            >
              سلسلة عامة
            </button>
          </div>
        </div>
        {kind === 'book' && (
          <label>
            <span className="mb-1 block text-sm">اسم الكتاب</span>
            <input value={book} onChange={(e) => setBook(e.target.value)} className={fieldCls} style={fieldStyle} />
          </label>
        )}
        <label>
          <span className="mb-1 block text-sm">وصف (اختياري)</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={fieldCls} style={fieldStyle} />
        </label>
        <button type="submit" className="btn-primary transition-ui rounded-xl px-5 py-2">
          إنشاء
        </button>
      </form>
      {err && (
        <p role="alert" className="mt-2 text-sm" style={{ color: 'var(--secondary)' }}>
          {err}
        </p>
      )}
    </>
  )
}

export function CourseRename({ course }: { course: CourseOut }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(course.title)
  const [description, setDescription] = useState(course.description ?? '')
  const [bookTitle, setBookTitle] = useState(course.book_title ?? '')
  const [err, setErr] = useState<string | null>(null)
  // Ticket 16: kind is fixed at creation — the book field appears only for
  // book-based courses and can never be cleared; general courses gain none.
  const hasBook = courseHasBook(course)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="transition-ui clickable rounded-xl border px-4 py-1.5"
        style={{ borderColor: 'var(--border)' }}
      >
        تحرير
      </button>
    )
  }
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault()
        setErr(null)
        if (hasBook && !bookTitle.trim()) {
          setErr('سلسلة الكتاب تحتفظ باسم كتابها — لا يمكن مسحه')
          return
        }
        try {
          await api.put<CourseOut>(`/courses/${course.id}`, {
            title,
            description: description.trim() || undefined,
            book_title: hasBook ? bookTitle.trim() : undefined,
          })
        } catch (ex) {
          setErr(ex instanceof ApiError ? localizeDetail(ex.detail) : 'تعذّر الحفظ')
          return
        }
        setOpen(false)
        qc.invalidateQueries({ queryKey: ['dashboard'] })
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
      {hasBook && (
        <label>
          <span className="mb-1 block text-sm">اسم الكتاب</span>
          <input value={bookTitle} onChange={(e) => setBookTitle(e.target.value)} required className={fieldCls} style={fieldStyle} />
        </label>
      )}
      <button type="submit" className="btn-primary transition-ui rounded-xl px-4 py-1.5">
        حفظ
      </button>
      {err && (
        <p role="alert" className="w-full text-sm" style={{ color: 'var(--secondary)' }}>
          {err}
        </p>
      )}
    </form>
  )
}

export function LessonUpload({ lessonId, onDone, defaultOpen = true }: { lessonId: string; onDone: () => void; defaultOpen?: boolean }) {
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [open, setOpen] = useState(defaultOpen)

  const run = async () => {
    if (!file) return
    setMsg(null)
    try {
      // Fresh URL every attempt (retry = fresh URL).
      const u = await api.post<UploadUrlOut>(`/lessons/${lessonId}/upload-url`, {
        content_type: file.type || 'audio/mpeg',
      })
      setProgress(5)
      // Browser PUTs audio directly to R2 (no worker, no transcoding in V1).
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', u.upload_url)
        xhr.setRequestHeader('Content-Type', file.type || 'audio/mpeg')
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 95))
        }
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`PUT ${xhr.status}`)))
        xhr.onerror = () => reject(new Error('upload failed'))
        xhr.send(file)
      })
      setProgress(98)
      // Client confirms; API verifies object exists then marks lesson ready.
      await api.post<LessonOut>(`/lessons/${lessonId}/confirm`, { object_key: u.object_key })
      setProgress(100)
      onDone()
    } catch (e) {
      setMsg(e instanceof ApiError ? localizeDetail(e.detail) : 'فشل الرفع — أعد المحاولة برابط جديد')
      setProgress(null)
    }
  }

  return (
    <div className="mt-2 rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="transition-ui clickable text-sm underline"
        >
          رفع الصوت / استبدال
        </button>
      ) : (
      <>
      <label className="block text-sm">
        ملف صوتي (V1 صوت فقط ~100–150MB)
        <input
          type="file"
          accept="audio/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm"
        />
      </label>
      {progress !== null && (
        <div className="mt-2 h-2 rounded-full" style={{ backgroundColor: 'var(--sand)' }} role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-2 rounded-full" style={{ width: `${progress}%`, backgroundColor: 'var(--primary)' }} />
        </div>
      )}
      {msg && (
        <p role="alert" className="mt-1 text-sm" style={{ color: 'var(--secondary)' }}>
          {msg}
        </p>
      )}
      <button type="button" onClick={run} disabled={!file} className="btn-secondary transition-ui mt-2 rounded-xl px-4 py-1.5">
        رفع وتأكيد
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="transition-ui clickable mt-2 block text-sm underline"
      >
        إخفاء
      </button>
      </>
      )}
    </div>
  )
}
