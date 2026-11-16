import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { api } from '../api/http'
import type { CourseOut, InviteOut, LessonOut } from '../api/types'
import { courseHasBook } from '../features/courses/helpers'
import { inviteStatusAr, localizeDetail, str } from '../i18n'
import { useToast } from '../components/Toast'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Fab } from '../components/Fab'
import { Modal } from '../components/Modal'
import { btnPrimary, fieldCls, fieldStyle } from './Auth'

type InviteList = { invites: InviteOut[] } | InviteOut[]

function normalizeInvites(data: InviteList | undefined): InviteOut[] {
  if (!data) return []
  if (Array.isArray(data)) return data
  return data.invites ?? []
}

export function AdminPage() {
  const [showInvite, setShowInvite] = useState(false)
  const [showLesson, setShowLesson] = useState(false)
  const [confirmInvite, setConfirmInvite] = useState<InviteOut | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const qc = useQueryClient()
  const { toast } = useToast()

  const invites = useQuery({
    queryKey: ['invites'],
    queryFn: () => api.get<InviteList>('/invites'),
  })

  const revoke = useMutation({
    mutationFn: (inviteId: string) => api.post(`/invites/${inviteId}/revoke`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invites'] })
      setConfirmInvite(null)
      toast('أُلغيت الدعوة')
    },
    onError: (e) => toast(e instanceof ApiError ? localizeDetail(e.detail) : 'تعذّر إلغاء الدعوة'),
  })

  const runRevoke = async () => {
    if (!confirmInvite) return
    setConfirmBusy(true)
    try {
      await revoke.mutateAsync(confirmInvite.id)
    } finally {
      setConfirmBusy(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pt-28 sm:px-6">
      <h1 className="font-heading text-3xl font-bold">{str.admin}</h1>
      <div className="card arabesque mt-4 rounded-2xl p-5">
        <h2 className="font-heading mb-2 font-bold">دعوات المعلمين (بدون تسجيل عام)</h2>
        <ul className="mt-3 grid gap-2 text-sm">
          {normalizeInvites(invites.data).map((inv) => {
            const status = inv.status
            return (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2" style={{ borderColor: 'var(--border)' }}>
                <span dir="ltr">{inv.email}</span>
                <span className="flex items-center gap-2">
                  <span className="muted-t">{inviteStatusAr[status]}</span>
                  {status === 'active' && (
                    <button
                      type="button"
                      onClick={() => setConfirmInvite(inv)}
                      className="transition-ui clickable rounded-lg border px-3 py-1"
                      style={{ borderColor: 'var(--secondary)' }}
                    >
                      إلغاء الدعوة
                    </button>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="card mt-4 rounded-2xl p-5">
        <h2 className="font-heading mb-1 font-bold">المستخدمون والحظر</h2>
        <p className="muted-t text-sm">
          لا توجد واجهة خلفية لإدارة المستخدمين/الحظر العام بعد (is_active موجود في القاعدة فقط) —
          الحظر المتاح حاليًا per-course عبر قائمة السلسلة.
        </p>
      </div>

      <div className="card mt-4 rounded-2xl p-5">
        <h2 className="font-heading mb-1 font-bold">الدروس</h2>
        <p className="muted-t mb-3 text-sm">
          أنشئ الدرس (العنوان + التاريخ + الوصف + لصق النصوص) ثم ارفع صوته من إدارة الدروس.
        </p>
        <button
          type="button"
          onClick={() => setShowLesson(true)}
          className="btn-secondary transition-ui rounded-xl px-5 py-2"
        >
          إنشاء درس
        </button>
      </div>

      <div className="card mt-4 rounded-2xl p-5">
        <h2 className="font-heading mb-1 font-bold">{str.vault}</h2>
        <p className="muted-t mb-3 text-sm">{str.vaultCardHint}</p>
        <Link to="/admin/vault" className="transition-ui clickable rounded-xl border px-5 py-2" style={{ borderColor: 'var(--gold)' }}>
          {str.vault}
        </Link>
      </div>

      <Fab label="دعوة معلم" icon="mail" expanded onClick={() => setShowInvite(true)} />
      {showInvite && (
        <Modal title="دعوة معلم (بدون تسجيل عام)" onClose={() => setShowInvite(false)}>
          <InviteForm onDone={() => setShowInvite(false)} />
        </Modal>
      )}
      {showLesson && (
        <Modal title="إنشاء درس" onClose={() => setShowLesson(false)}>
          <p className="muted-t mb-3 text-sm">
            أنشئ الدرس هنا (العنوان + التاريخ + الوصف + لصق النصوص) ثم ارفع صوته من إدارة الدروس.
          </p>
          <LessonCreateForm />
        </Modal>
      )}
      {confirmInvite && (
        <ConfirmDialog
          title="إلغاء الدعوة"
          message={`سيتوقف رابط الدعوة المرسل إلى ${confirmInvite.email} عن العمل فورًا.`}
          confirmLabel="إلغاء الدعوة"
          busy={confirmBusy}
          onConfirm={runRevoke}
          onCancel={() => setConfirmInvite(null)}
        />
      )}
    </main>
  )
}

function InviteForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [email, setEmail] = useState('')
  const [rawNote, setRawNote] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () => api.post<{ message: string }>('/invites', { email }),
    onSuccess: () => {
      setRawNote(`أُرسلت الدعوة إلى ${email} — الرابط في بريده (Mailpit محليًا)`)
      setEmail('')
      qc.invalidateQueries({ queryKey: ['invites'] })
      onDone()
    },
    onError: (e) => toast(e instanceof ApiError ? localizeDetail(e.detail) : 'تعذّر إنشاء الدعوة'),
  })

  return (
    <>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate()
        }}
      >
        <label className="flex-1">
          <span className="mb-1 block text-sm">{str.email}</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            dir="ltr"
            className={fieldCls}
            style={fieldStyle}
          />
        </label>
        <button type="submit" className="btn-primary transition-ui self-end rounded-xl px-5 py-2">
          إرسال الدعوة
        </button>
      </form>
      {rawNote && (
        <p role="status" className="mt-2 text-sm">
          {rawNote}
        </p>
      )}
    </>
  )
}

function LessonCreateForm() {
  const { toast } = useToast()
  const courses = useQuery({
    queryKey: ['courses-admin'],
    queryFn: () => api.get<CourseOut[]>('/courses'),
  })
  const [courseId, setCourseId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [lessonDate, setLessonDate] = useState('')
  const [pagesFrom, setPagesFrom] = useState('')
  const [pagesTo, setPagesTo] = useState('')
  const [voice, setVoice] = useState('')
  const [book, setBook] = useState('')
  const selected = courses.data?.find((c) => c.id === courseId)
  // Ticket 16: pages range exists only for book-based courses.
  const hasBook = selected ? courseHasBook(selected) : false

  return (
    <form
      className="grid gap-2"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!courseId) {
          toast('اختر السلسلة أولًا')
          return
        }
        try {
          await api.post<LessonOut>(`/courses/${courseId}/lessons`, {
            title,
            description: description.trim() || undefined,
            lesson_date: lessonDate || undefined,
            pages_from: hasBook && pagesFrom ? Number(pagesFrom) : undefined,
            pages_to: hasBook && pagesTo ? Number(pagesTo) : undefined,
            transcript_voice: voice || undefined,
            transcript_book: book || undefined,
            media_type: 'audio',
          })
          toast('أُنشئ الدرس — ارفع صوته من إدارة الدروس')
          setTitle('')
          setDescription('')
          setVoice('')
          setBook('')
        } catch (ex) {
          toast(ex instanceof ApiError ? localizeDetail(ex.detail) : 'تعذّر الإنشاء')
        }
      }}
    >
      <label>
        <span className="mb-1 block text-sm">السلسلة</span>
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)} required className={fieldCls} style={fieldStyle}>
          <option value="">— اختر —</option>
          {courses.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="mb-1 block text-sm">عنوان الدرس</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} required className={fieldCls} style={fieldStyle} />
      </label>
      <label>
        <span className="mb-1 block text-sm">وصف (اختياري)</span>
        <input value={description} onChange={(e) => setDescription(e.target.value)} className={fieldCls} style={fieldStyle} />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label>
          <span className="mb-1 block text-sm">التاريخ</span>
          <input type="date" value={lessonDate} onChange={(e) => setLessonDate(e.target.value)} dir="ltr" className={fieldCls} style={fieldStyle} />
        </label>
        {hasBook && (
          <>
            <label>
              <span className="mb-1 block text-sm">من صفحة (اختياري)</span>
              <input value={pagesFrom} onChange={(e) => setPagesFrom(e.target.value)} dir="ltr" inputMode="numeric" className={fieldCls} style={fieldStyle} />
            </label>
            <label>
              <span className="mb-1 block text-sm">إلى صفحة (اختياري)</span>
              <input value={pagesTo} onChange={(e) => setPagesTo(e.target.value)} dir="ltr" inputMode="numeric" className={fieldCls} style={fieldStyle} />
            </label>
          </>
        )}
      </div>
      <label>
        <span className="mb-1 block text-sm">نص ما قيل (لصق)</span>
        <textarea value={voice} onChange={(e) => setVoice(e.target.value)} rows={3} className={fieldCls} style={fieldStyle} />
      </label>
      <label>
        <span className="mb-1 block text-sm">نص صفحات الكتاب (لصق)</span>
        <textarea value={book} onChange={(e) => setBook(e.target.value)} rows={3} className={fieldCls} style={fieldStyle} />
      </label>
      <button type="submit" className={btnPrimary}>
        إنشاء الدرس
      </button>
    </form>
  )
}

// Strict STUB — no API exists (tickets 10–12 NOT built). Zero fetch calls.
export function VaultStubPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-28 sm:px-6">
      <h1 className="font-heading text-2xl font-bold">{str.vault}</h1>
      <p className="card mt-3 rounded-2xl border p-4 text-sm" style={{ borderColor: 'var(--gold)' }}>
        {str.stubNote} — لا مفاتيح في الواجهة أو .env أبدًا (تُخزّن مشفّرة في Postgres لاحقًا).
      </p>
      <div className="card mt-3 rounded-2xl p-5 opacity-80" aria-disabled="true">
        <div className="grid gap-2 text-sm">
          <div className="flex justify-between rounded-xl border px-3 py-2" style={{ borderColor: 'var(--border)' }}>
            <span>Groq · llama-3 · ••••</span>
            <span className="muted-t">نشط · آخر استخدام قبل ساعتين</span>
          </div>
          <div className="flex justify-between rounded-xl border px-3 py-2" style={{ borderColor: 'var(--border)' }}>
            <span>Gemini · embeddings · ••••</span>
            <span className="muted-t">معطّل</span>
          </div>
        </div>
        <button type="button" disabled className="btn-primary transition-ui mt-3 rounded-xl px-5 py-1.5">
          إضافة مفتاح (معطّل)
        </button>
      </div>
    </main>
  )
}

// Ticket 24: the per-course chat route is REMOVED until ticket 12 ships.
// The RAG core, key vault and manual quality gate do not exist yet, so a
// fake chat (bubbles, quota, citation) would promise answers it cannot
// give. Re-adding it means: build the backend, then restore the UI —
// never the other way round.
