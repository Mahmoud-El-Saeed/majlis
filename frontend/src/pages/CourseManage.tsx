import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { api } from '../api/http'
import type { LessonOut, LessonSummaryOut } from '../api/types'
import { localizeDetail } from '../i18n'
import { LessonBadge } from '../components/Badges'
import { LessonUpload } from './Teach'
import { btnPrimary, fieldCls, fieldStyle } from './Auth'

export function CourseManagePage() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const lessons = useQuery({
    queryKey: ['lessons-manage', id],
    queryFn: () => api.get<LessonSummaryOut[]>(`/courses/${id}/lessons`),
  })
  const [title, setTitle] = useState('')
  const [lessonDate, setLessonDate] = useState('')
  const [pagesFrom, setPagesFrom] = useState('')
  const [pagesTo, setPagesTo] = useState('')
  const [voice, setVoice] = useState('')
  const [book, setBook] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [editing, setEditing] = useState<LessonOut | null>(null)

  const create = useMutation({
    mutationFn: () =>
      api.post<LessonOut>(`/courses/${id}/lessons`, {
        title,
        lesson_date: lessonDate || undefined,
        pages_from: pagesFrom ? Number(pagesFrom) : undefined,
        pages_to: pagesTo ? Number(pagesTo) : undefined,
        transcript_voice: voice || undefined,
        transcript_book: book || undefined,
        media_type: 'audio',
      }),
    onSuccess: () => {
      setTitle('')
      setLessonDate('')
      setPagesFrom('')
      setPagesTo('')
      setVoice('')
      setBook('')
      setErr(null)
      qc.invalidateQueries({ queryKey: ['lessons-manage', id] })
    },
    onError: (e) => setErr(e instanceof ApiError ? localizeDetail(e.detail) : 'تعذّر الإنشاء'),
  })

  const saveEdit = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error('no edit')
      return api.put<LessonOut>(`/lessons/${editing.id}`, {
        title: editing.title,
        lesson_date: editing.lesson_date,
        pages_from: editing.pages_from,
        pages_to: editing.pages_to,
        transcript_voice: editing.transcript_voice,
        transcript_book: editing.transcript_book,
      })
    },
    onSuccess: () => {
      setEditing(null)
      qc.invalidateQueries({ queryKey: ['lessons-manage', id] })
    },
    onError: (e) => setErr(e instanceof ApiError ? localizeDetail(e.detail) : 'تعذّر الحفظ'),
  })

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pt-28 sm:px-6">
      <Link to="/teach" className="underline text-sm">
        ← لوحة المعلم
      </Link>
      <h1 className="font-heading mt-1 text-2xl font-bold">إدارة الدروس</h1>
      <div className="card mt-3 rounded-2xl p-5">
        <h2 className="font-heading mb-2 font-bold">درس جديد (لصق النصوص — لا ملفات)</h2>
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (pagesFrom && pagesTo && Number(pagesFrom) > Number(pagesTo)) {
              setErr('pages_from يجب أن تكون ≤ pages_to')
              return
            }
            create.mutate()
          }}
        >
          <label>
            <span className="mb-1 block text-sm">العنوان</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required className={fieldCls} style={fieldStyle} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="mb-1 block text-sm">تاريخ الدرس</span>
              <input type="date" value={lessonDate} onChange={(e) => setLessonDate(e.target.value)} dir="ltr" className={fieldCls} style={fieldStyle} />
            </label>
            <span />
            <label>
              <span className="mb-1 block text-sm">من صفحة</span>
              <input value={pagesFrom} onChange={(e) => setPagesFrom(e.target.value)} inputMode="numeric" dir="ltr" className={fieldCls} style={fieldStyle} />
            </label>
            <label>
              <span className="mb-1 block text-sm">إلى صفحة</span>
              <input value={pagesTo} onChange={(e) => setPagesTo(e.target.value)} inputMode="numeric" dir="ltr" className={fieldCls} style={fieldStyle} />
            </label>
          </div>
          <label>
            <span className="mb-1 block text-sm">نص ما قيل (صوت)</span>
            <textarea value={voice} onChange={(e) => setVoice(e.target.value)} rows={4} className={fieldCls} style={fieldStyle} />
          </label>
          <label>
            <span className="mb-1 block text-sm">نص صفحات الكتاب</span>
            <textarea value={book} onChange={(e) => setBook(e.target.value)} rows={4} className={fieldCls} style={fieldStyle} />
          </label>
          {err && (
            <p role="alert" className="text-sm" style={{ color: 'var(--secondary)' }}>
              {err}
            </p>
          )}
          <button type="submit" className={btnPrimary}>
            إنشاء الدرس
          </button>
        </form>
      </div>

      <ul className="mt-4 grid gap-3">
        {lessons.data?.map((l) => (
          <li key={l.id} className="card rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-heading font-bold">{l.title}</h3>
              <LessonBadge status={l.status} />
            </div>
            <p className="muted-t text-xs" dir="ltr">
              {l.pages_from ?? '?'} – {l.pages_to ?? '?'}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="transition-ui clickable rounded-xl border px-3 py-1 text-sm"
                style={{ borderColor: 'var(--border)' }}
                onClick={async () => {
                  const full = await api.get<LessonOut>(`/lessons/${l.id}`)
                  setEditing(full)
                }}
              >
                تحرير النصوص
              </button>
              <button
                type="button"
                className="transition-ui clickable rounded-xl border px-3 py-1 text-sm"
                style={{ borderColor: 'var(--secondary)' }}
                onClick={async () => {
                  if (!window.confirm(`حذف ${l.title}؟`)) return
                  try {
                    await api.delete(`/lessons/${l.id}`)
                    qc.invalidateQueries({ queryKey: ['lessons-manage', id] })
                  } catch (e) {
                    setErr(e instanceof ApiError ? localizeDetail(e.detail) : 'تعذّر الحذف')
                  }
                }}
              >
                حذف
              </button>
            </div>
            <LessonUpload lessonId={l.id} onDone={() => qc.invalidateQueries({ queryKey: ['lessons-manage', id] })} />
          </li>
        ))}
      </ul>

      {editing && (
        <div className="card mt-4 rounded-2xl p-5" role="dialog" aria-label="تحرير الدرس">
          <h2 className="font-heading mb-2 font-bold">تحرير: {editing.title}</h2>
          <label className="mb-2 block">
            <span className="mb-1 block text-sm">العنوان</span>
            <input
              value={editing.title}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              className={fieldCls}
              style={fieldStyle}
            />
          </label>
          <label className="mb-2 block">
            <span className="mb-1 block text-sm">تاريخ الدرس</span>
            <input
              type="date"
              value={editing.lesson_date ?? ''}
              onChange={(e) => setEditing({ ...editing, lesson_date: e.target.value || null })}
              dir="ltr"
              className={fieldCls}
              style={fieldStyle}
            />
          </label>
          <label className="mb-2 block">
            <span className="mb-1 block text-sm">نص ما قيل (صوت)</span>
            <textarea
              value={editing.transcript_voice ?? ''}
              onChange={(e) => setEditing({ ...editing, transcript_voice: e.target.value })}
              rows={5}
              className={fieldCls}
              style={fieldStyle}
            />
          </label>
          <label className="mb-3 block">
            <span className="mb-1 block text-sm">نص صفحات الكتاب</span>
            <textarea
              value={editing.transcript_book ?? ''}
              onChange={(e) => setEditing({ ...editing, transcript_book: e.target.value })}
              rows={5}
              className={fieldCls}
              style={fieldStyle}
            />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={() => saveEdit.mutate()} className="btn-primary transition-ui rounded-xl px-5 py-1.5">
              حفظ
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="transition-ui clickable rounded-xl border px-5 py-1.5"
              style={{ borderColor: 'var(--border)' }}
            >
              إلغاء
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
