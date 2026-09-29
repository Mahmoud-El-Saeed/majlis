import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { api } from '../api/http'
import type { CourseOut, DashboardOut, LessonOut, UploadUrlOut } from '../api/types'
import { localizeDetail } from '../i18n'
import { StarDivider } from '../components/Star8'
import { fieldCls, fieldStyle } from './Auth'

export function TeachDashboard() {
  const qc = useQueryClient()
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<DashboardOut>('/dashboard') })
  const [title, setTitle] = useState('')
  const [book, setBook] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const owned = (dash.data?.items ?? []).filter((i) => i.enrollment_status === 'owner' || i.enrollment_status === 'admin')

  const create = useMutation({
    mutationFn: () => api.post<CourseOut>('/courses', { title, book_title: book || undefined }),
    onSuccess: () => {
      setTitle('')
      setBook('')
      setErr(null)
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (e) => setErr(e instanceof ApiError ? localizeDetail(e.detail) : 'تعذّر الإنشاء'),
  })

  const removeCourse = async (courseId: string, courseTitle: string) => {
    if (!window.confirm(`حذف ${courseTitle}؟`)) return
    try {
      await api.delete(`/courses/${courseId}`)
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    } catch (e) {
      setErr(e instanceof ApiError ? localizeDetail(e.detail) : 'تعذّر الحذف')
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-28 sm:px-6 lg:px-8">
      <h1 className="font-heading text-3xl font-bold">لوحة المعلم</h1>
      <StarDivider />
      <div className="card mt-4 rounded-2xl p-5">
        <h2 className="font-heading mb-2 font-bold">كتاب جديد (دورة = كتاب)</h2>
        <form
          className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate()
          }}
        >
          <label>
            <span className="mb-1 block text-sm">العنوان</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required className={fieldCls} style={fieldStyle} />
          </label>
          <label>
            <span className="mb-1 block text-sm">اسم الكتاب</span>
            <input value={book} onChange={(e) => setBook(e.target.value)} className={fieldCls} style={fieldStyle} />
          </label>
          <button type="submit" className="btn-primary transition-ui self-end rounded-xl px-5 py-2">
            إنشاء
          </button>
        </form>
        {err && (
          <p role="alert" className="mt-2 text-sm" style={{ color: 'var(--secondary)' }}>
            {err}
          </p>
        )}
      </div>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2">
        {owned.map((it) => (
          <li key={it.course.id} className="card arabesque rounded-2xl p-5">
            <h2 className="font-heading text-xl font-bold">{it.course.title}</h2>
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
                onClick={() => removeCourse(it.course.id, it.course.title)}
                className="transition-ui clickable rounded-xl border px-4 py-1.5"
                style={{ borderColor: 'var(--secondary)' }}
              >
                حذف
              </button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}

export function CourseRename({ course }: { course: CourseOut }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(course.title)
  const [bookTitle, setBookTitle] = useState(course.book_title ?? '')

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
        await api.put<CourseOut>(`/courses/${course.id}`, {
          title,
          book_title: bookTitle || undefined,
        })
        setOpen(false)
        qc.invalidateQueries({ queryKey: ['dashboard'] })
      }}
    >
      <label>
        <span className="mb-1 block text-sm">العنوان</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} required className={fieldCls} style={fieldStyle} />
      </label>
      <label>
        <span className="mb-1 block text-sm">الكتاب</span>
        <input value={bookTitle} onChange={(e) => setBookTitle(e.target.value)} className={fieldCls} style={fieldStyle} />
      </label>
      <button type="submit" className="btn-primary transition-ui rounded-xl px-4 py-1.5">
        حفظ
      </button>
    </form>
  )
}

export function LessonUpload({ lessonId, onDone }: { lessonId: string; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

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
    </div>
  )
}
