import { useId, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { api } from '../api/http'
import type {
  AttemptOut,
  ExamDetailOut,
  ExamOut,
  GradebookRowOut,
  QuestionOut,
  QuestionType,
} from '../api/types'
import { localizeDetail, str } from '../i18n'
import { matchesArabic } from '../features/courses/helpers'
import { Fab } from '../components/Fab'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { NumberBadge } from '../components/NumberBadge'
import { SearchBox } from '../components/SearchBox'
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  MAX_MCQ_OPTIONS,
  MIN_MCQ_OPTIONS,
  blankDraft,
  draftToBody,
  positionsForOrder,
  toLocalInput,
  validateDraft,
  type QuestionDraft,
} from '../features/exams/helpers'
import { useToast } from '../components/Toast'
import { WindowBadge } from '../components/Badges'
import { windowStatusFromDates } from '../features/exams/helpers'
import { btnPrimary, fieldCls, fieldStyle } from './Auth'

export function ExamAuthorPage() {
  const { id: courseId = '' } = useParams()
  const [showNew, setShowNew] = useState(false)

  const exams = useQuery({
    queryKey: ['exams-manage', courseId],
    queryFn: () => api.get<ExamOut[]>(`/courses/${courseId}/exams`),
  })
  const [query, setQuery] = useState('')
  // Numbering = index+1 in the FULL ordered list; filter keeps full-list numbers.
  const numberedExams = (exams.data ?? []).map((ex, i) => ({ exam: ex, n: i + 1 }))
  const visibleExams = numberedExams.filter(({ exam: ex }) => matchesArabic(ex.title, query))

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pt-28 sm:px-6">
      <Link to="/teach" className="underline text-sm">
        → لوحة المعلم
      </Link>{' '}
      <Link to={`/teach/courses/${courseId}`} className="underline text-sm">
        إدارة الدروس
      </Link>
      <h1 className="font-heading mt-1 text-2xl font-bold">تأليف الاختبارات</h1>
      {(exams.data?.length ?? 0) > 0 && (
        <div className="mt-3">
          <SearchBox value={query} onChange={setQuery} placeholder={str.searchExamsPlaceholder} />
        </div>
      )}
      {query && (exams.data?.length ?? 0) > 0 && (
        <p className="muted-t mt-1 text-xs">
          {str.resultCount}: <span dir="ltr">{visibleExams.length}</span>
        </p>
      )}
      <ul className="mt-4 grid gap-3">
        {!exams.isPending && (exams.data ?? []).length === 0 && (
          <li className="card rounded-2xl p-5 text-center">
            <p className="muted-t">لا اختبارات بعد — أنشئ أول اختبار من زر + أسفل الشاشة</p>
          </li>
        )}
        {exams.data && exams.data.length > 0 && visibleExams.length === 0 && (
          <li className="card rounded-2xl p-5 text-center">
            <p className="muted-t">{str.noResults}</p>
          </li>
        )}
        {visibleExams.map(({ exam: ex, n }) => (
          <li key={ex.id} className="card arabesque rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <NumberBadge n={n} />
                <h2 dir="auto" className="font-heading font-bold">{ex.title}</h2>
              </div>
              <WindowBadge status={windowStatusFromDates(ex.open_at, ex.close_at)} />
            </div>
            <p className="muted-t text-xs">
              المحاولات <span dir="ltr">{ex.attempts_limit}</span> · المدة{' '}
              <span dir="ltr">{ex.duration_minutes ?? '—'}</span> دقيقة · النجاح{' '}
              <span dir="ltr">{ex.pass_score}</span> · {ex.show_result === 'immediate' ? 'فورية' : 'بعد النشر'}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link to={`/teach/exams/${ex.id}`} className="btn-primary transition-ui rounded-xl px-4 py-1.5">
                الأسئلة والمعاينة
              </Link>
              <Link to={`/teach/exams/${ex.id}/grade`} className="transition-ui clickable rounded-xl border px-4 py-1.5" style={{ borderColor: 'var(--gold)' }}>
                السجل
              </Link>
              <Link to={`/teach/exams/${ex.id}/essays`} className="transition-ui clickable rounded-xl border px-4 py-1.5" style={{ borderColor: 'var(--border)' }}>
                تصحيح المقالية
              </Link>
            </div>
          </li>
        ))}
      </ul>
      <Fab label="اختبار جديد" expanded onClick={() => setShowNew(true)} />
      {showNew && (
        <Modal title="اختبار جديد" onClose={() => setShowNew(false)}>
          <NewExamForm courseId={courseId} onDone={() => setShowNew(false)} />
        </Modal>
      )}
    </main>
  )
}

function NewExamForm({ courseId, onDone }: { courseId: string; onDone: () => void }) {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [attempts, setAttempts] = useState('1')
  const [duration, setDuration] = useState('')
  const [openAt, setOpenAt] = useState('')
  const [closeAt, setCloseAt] = useState('')
  const [passScore, setPassScore] = useState('50')
  const [showResult, setShowResult] = useState<'immediate' | 'after_publish'>('immediate')
  const [err, setErr] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () =>
      api.post<ExamOut>(`/courses/${courseId}/exams`, {
        title,
        description: description || undefined,
        attempts_limit: Number(attempts) || 1,
        duration_minutes: duration ? Number(duration) : undefined,
        open_at: openAt ? new Date(openAt).toISOString() : undefined,
        close_at: closeAt ? new Date(closeAt).toISOString() : undefined,
        pass_score: Number(passScore),
        show_result: showResult,
      }),
    onSuccess: () => {
      setErr(null)
      qc.invalidateQueries({ queryKey: ['exams-manage', courseId] })
      onDone()
    },
    onError: (e) => setErr(e instanceof ApiError ? localizeDetail(e.detail) : 'تعذّر الإنشاء'),
  })

  return (
    <>
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (openAt && closeAt && new Date(openAt) >= new Date(closeAt)) {
            setErr('تاريخ الفتح يجب أن يسبق تاريخ الإغلاق')
            return
          }
          create.mutate()
        }}
      >
        <label>
          <span className="mb-1 block text-sm">عنوان الاختبار</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required className={fieldCls} style={fieldStyle} />
        </label>
        <label>
          <span className="mb-1 block text-sm">الوصف (اختياري)</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={fieldCls} style={fieldStyle} />
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <label>
            <span className="mb-1 block text-sm">المحاولات</span>
            <input value={attempts} onChange={(e) => setAttempts(e.target.value)} dir="ltr" inputMode="numeric" className={fieldCls} style={fieldStyle} />
          </label>
          <label>
            <span className="mb-1 block text-sm">المدة (دقيقة)</span>
            <input value={duration} onChange={(e) => setDuration(e.target.value)} dir="ltr" inputMode="numeric" className={fieldCls} style={fieldStyle} />
          </label>
          <label>
            <span className="mb-1 block text-sm">درجة النجاح</span>
            <input value={passScore} onChange={(e) => setPassScore(e.target.value)} dir="ltr" inputMode="numeric" className={fieldCls} style={fieldStyle} />
          </label>
          <label>
            <span className="mb-1 block text-sm">يفتح في</span>
            <input type="datetime-local" value={openAt} onChange={(e) => setOpenAt(e.target.value)} dir="ltr" className={fieldCls} style={fieldStyle} />
          </label>
          <label>
            <span className="mb-1 block text-sm">يغلق في</span>
            <input type="datetime-local" value={closeAt} onChange={(e) => setCloseAt(e.target.value)} dir="ltr" className={fieldCls} style={fieldStyle} />
          </label>
          <label>
            <span className="mb-1 block text-sm">إظهار النتيجة</span>
            <select value={showResult} onChange={(e) => setShowResult(e.target.value as 'immediate' | 'after_publish')} className={fieldCls} style={fieldStyle}>
              <option value="immediate">فورية</option>
              <option value="after_publish">بعد النشر</option>
            </select>
          </label>
        </div>
        <button type="submit" className={btnPrimary}>
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

const btnSecondary = 'btn-secondary transition-ui rounded-xl px-4 py-2 font-bold'

function typeLabel(t: QuestionType): string {
  switch (t) {
    case 'mcq':
      return 'اختيار من متعدد'
    case 'tf':
      return 'صح / خطأ'
    case 'essay':
      return 'مقالية'
  }
}

export function questionToDraft(q: QuestionOut): QuestionDraft {
  return {
    type: q.type,
    prompt: q.prompt,
    options: [...(q.options ?? [])],
    correctIndex: q.correct_index != null ? String(q.correct_index) : '0',
    tfAnswer: q.correct_answer === false ? 'false' : 'true',
    maxScore: String(q.max_score),
  }
}

export function ExamDetailManagePage() {
  const { examId = '' } = useParams()
  const qc = useQueryClient()
  const { toast } = useToast()
  const [confirmQ, setConfirmQ] = useState<{ id: string; prompt: string } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [drafts, setDrafts] = useState<Array<{ key: number; draft: QuestionDraft }>>([])
  const [draftSeq, setDraftSeq] = useState(1)
  const detail = useQuery({
    queryKey: ['exam-detail', examId],
    queryFn: () => api.get<ExamDetailOut>(`/exams/${examId}`),
  })

  const delQ = useMutation({
    mutationFn: (qid: string) => api.delete(`/questions/${qid}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exam-detail', examId] })
      setConfirmQ(null)
    },
  })

  const confirmDeleteQ = async (qid: string) => {
    setDeleteBusy(true)
    try {
      await delQ.mutateAsync(qid)
    } finally {
      setDeleteBusy(false)
    }
  }

  // Mouse drags start after 6px; touch uses long-press (200ms) so a swipe
  // to scroll the page is never hijacked into a drag — the reported "stuck
  // scroll" on question cards.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const questions = detail.data?.questions ?? []
  const sortableIds = [...questions.map((q) => q.id), ...drafts.map((d) => `draft-${d.key}`)]

  const addDraft = () => {
    const key = draftSeq
    setDraftSeq((k) => k + 1)
    setDrafts((ds) => [...ds, { key, draft: blankDraft('mcq') }])
    window.setTimeout(() => {
      document.getElementById(`draft-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 60)
  }

  const updateDraft = (key: number, next: QuestionDraft) => {
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, draft: next } : d)))
  }

  const discardDraft = (key: number) => {
    setDrafts((ds) => ds.filter((d) => d.key !== key))
  }

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = [...questions.map((q) => q.id), ...drafts.map((d) => `draft-${d.key}`)]
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    const moved = arrayMove(ids, from, to)
    const orderedQuestions = moved.filter((id) => !id.startsWith('draft-'))
    const current = new Map(questions.map((q) => [q.id, q.position] as const))
    const changed = positionsForOrder(orderedQuestions).filter((p) => current.get(p.id) !== p.position)
    if (changed.length === 0) return
    try {
      await Promise.all(changed.map((p) => api.put(`/questions/${p.id}`, { position: p.position })))
      qc.invalidateQueries({ queryKey: ['exam-detail', examId] })
    } catch (err) {
      toast(err instanceof ApiError ? localizeDetail(err.detail) : 'تعذّر إعادة الترتيب')
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-28 sm:px-6">
      <h1 className="font-heading text-2xl font-bold">{detail.data?.title ?? 'الاختبار'}</h1>
      <div className="mt-2 flex flex-wrap gap-2 text-sm">
        {detail.data?.course_id && (
          <Link to={`/teach/courses/${detail.data.course_id}/exams`} className="underline">
            → الاختبارات
          </Link>
        )}
        <Link to={`/teach/exams/${examId}/grade`} className="underline">
          السجل
        </Link>
        <Link to={`/teach/exams/${examId}/essays`} className="underline">
          تصحيح المقالية
        </Link>
      </div>
      {detail.data && <ExamSettingsForm exam={detail.data} examId={examId} />}
      {questions.length === 0 && drafts.length === 0 ? (
        <p className="card muted-t mt-4 rounded-2xl p-5 text-center">
          لا أسئلة بعد — أضف أول سؤال من زر + أسفل الشاشة
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <ol className="mt-4 grid gap-3">
              {questions.map((q, i) => (
                <QuestionCard
                  key={q.id}
                  q={q}
                  index={i}
                  examId={examId}
                  onDelete={() => setConfirmQ({ id: q.id, prompt: q.prompt })}
                />
              ))}
              {drafts.map((d) => (
                <DraftQuestionCard
                  key={d.key}
                  draftKey={d.key}
                  draft={d.draft}
                  examId={examId}
                  position={questions.length}
                  onChange={(next) => updateDraft(d.key, next)}
                  onSaved={() => discardDraft(d.key)}
                  onDiscard={() => discardDraft(d.key)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
      <Fab label="سؤال جديد" expanded onClick={addDraft} />
      {confirmQ && (
        <ConfirmDialog
          title="حذف السؤال"
          message={`سيتم حذف «${confirmQ.prompt}» نهائيًا مع إجابات الطلاب المرتبطة به. لا يمكن التراجع.`}
          confirmLabel="حذف نهائي"
          busy={deleteBusy}
          onConfirm={() => confirmDeleteQ(confirmQ.id)}
          onCancel={() => setConfirmQ(null)}
        />
      )}
    </main>
  )
}

export function ExamSettingsForm({ exam, examId }: { exam: ExamDetailOut; examId: string }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(exam.title)
  const [description, setDescription] = useState(exam.description ?? '')
  const [attempts, setAttempts] = useState(String(exam.attempts_limit))
  const [duration, setDuration] = useState(exam.duration_minutes != null ? String(exam.duration_minutes) : '')
  const [openAt, setOpenAt] = useState(toLocalInput(exam.open_at))
  const [closeAt, setCloseAt] = useState(toLocalInput(exam.close_at))
  const [passScore, setPassScore] = useState(String(exam.pass_score))
  const [showResult, setShowResult] = useState<'immediate' | 'after_publish'>(exam.show_result)
  const [err, setErr] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        title,
        attempts_limit: Number(attempts),
        pass_score: Number(passScore),
        show_result: showResult,
      }
      if (description.trim()) body['description'] = description
      else body['clear_description'] = true
      if (duration.trim()) body['duration_minutes'] = Number(duration)
      else body['clear_duration_minutes'] = true
      if (openAt) body['open_at'] = new Date(openAt).toISOString()
      else body['clear_open_at'] = true
      if (closeAt) body['close_at'] = new Date(closeAt).toISOString()
      else body['clear_close_at'] = true
      return api.put(`/exams/${examId}`, body)
    },
    onSuccess: () => {
      setErr(null)
      toast('تم حفظ الإعدادات')
      qc.invalidateQueries({ queryKey: ['exam-detail', examId] })
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? localizeDetail(e.detail) : 'تعذّر الحفظ'
      setErr(msg)
      if (e instanceof ApiError && e.status === 429) toast(msg)
    },
  })

  return (
    <section className="card mt-3 rounded-2xl p-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 font-bold"
      >
        <span>إعدادات الاختبار</span>
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <form
          className="mt-3 grid gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (openAt && closeAt && new Date(openAt) >= new Date(closeAt)) {
              setErr('تاريخ الفتح يجب أن يسبق تاريخ الإغلاق')
              return
            }
            save.mutate()
          }}
        >
          <label>
            <span className="mb-1 block text-sm">عنوان الاختبار</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required className={fieldCls} style={fieldStyle} />
          </label>
          <label>
            <span className="mb-1 block text-sm">الوصف (اختياري)</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className={fieldCls} style={fieldStyle} />
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <label>
              <span className="mb-1 block text-sm">المحاولات</span>
              <input value={attempts} onChange={(e) => setAttempts(e.target.value)} dir="ltr" inputMode="numeric" className={fieldCls} style={fieldStyle} />
            </label>
            <label>
              <span className="mb-1 block text-sm">المدة (دقيقة)</span>
              <input value={duration} onChange={(e) => setDuration(e.target.value)} dir="ltr" inputMode="numeric" className={fieldCls} style={fieldStyle} />
            </label>
            <label>
              <span className="mb-1 block text-sm">درجة النجاح</span>
              <input value={passScore} onChange={(e) => setPassScore(e.target.value)} dir="ltr" inputMode="numeric" className={fieldCls} style={fieldStyle} />
            </label>
            <label>
              <span className="mb-1 block text-sm">يفتح في</span>
              <input type="datetime-local" value={openAt} onChange={(e) => setOpenAt(e.target.value)} dir="ltr" className={fieldCls} style={fieldStyle} />
            </label>
            <label>
              <span className="mb-1 block text-sm">يغلق في</span>
              <input type="datetime-local" value={closeAt} onChange={(e) => setCloseAt(e.target.value)} dir="ltr" className={fieldCls} style={fieldStyle} />
            </label>
            <label>
              <span className="mb-1 block text-sm">إظهار النتيجة</span>
              <select value={showResult} onChange={(e) => setShowResult(e.target.value as 'immediate' | 'after_publish')} className={fieldCls} style={fieldStyle}>
                <option value="immediate">فورية</option>
                <option value="after_publish">بعد النشر</option>
              </select>
            </label>
          </div>
          <button type="submit" className={btnPrimary}>
            حفظ
          </button>
          {err && (
            <p role="alert" className="mt-2 text-sm" style={{ color: 'var(--secondary)' }}>
              {err}
            </p>
          )}
        </form>
      )}
    </section>
  )
}

// Google-Forms-style options editor: one input per option, add/remove,
// and a radio on each row to pick the correct answer (2–10 options).
export function McqOptionsEditor({
  options,
  correctIndex,
  onChange,
}: {
  options: string[]
  correctIndex: string
  onChange: (options: string[], correctIndex: string) => void
}) {
  const setOpt = (i: number, v: string) =>
    onChange(options.map((o, j) => (j === i ? v : o)), correctIndex)
  const removeOpt = (i: number) => {
    if (options.length <= MIN_MCQ_OPTIONS) return
    const next = options.filter((_, j) => j !== i)
    const ci = Number(correctIndex)
    const adjusted = ci === i ? Math.min(ci, next.length - 1) : ci > i ? ci - 1 : ci
    onChange(next, String(adjusted))
  }
  const addOpt = () => {
    if (options.length >= MAX_MCQ_OPTIONS) return
    onChange([...options, ''], correctIndex)
  }
  const group = useId()
  return (
    <div>
      <span className="mb-1 block text-sm">الاختيارات (علّم على الإجابة الصحيحة)</span>
      <ul className="grid gap-2">
        {options.map((opt, i) => (
          <li key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name={group}
              checked={Number(correctIndex) === i}
              onChange={() => onChange(options, String(i))}
              aria-label={`اختيار الإجابة الصحيحة: اختيار ${i + 1}`}
              className="shrink-0"
            />
            <input
              value={opt}
              onChange={(e) => setOpt(i, e.target.value)}
              dir="auto"
              placeholder={`اختيار ${i + 1}`}
              aria-label={`نص الاختيار ${i + 1}`}
              className={`${fieldCls} flex-1`}
              style={fieldStyle}
            />
            <button
              type="button"
              onClick={() => removeOpt(i)}
              disabled={options.length <= MIN_MCQ_OPTIONS}
              aria-label={`حذف اختيار ${i + 1}`}
              className="transition-ui clickable shrink-0 rounded-lg border px-2 py-1 text-sm disabled:opacity-40"
              style={{ borderColor: 'var(--border)' }}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={addOpt}
        disabled={options.length >= MAX_MCQ_OPTIONS}
        className="transition-ui clickable mt-2 rounded-xl border px-4 py-1.5 text-sm disabled:opacity-40"
        style={{ borderColor: 'var(--border)' }}
      >
        + إضافة اختيار
      </button>
    </div>
  )
}

export function QuestionFields({  draft,
  onChange,
}: {
  draft: QuestionDraft
  onChange: (next: QuestionDraft) => void
}) {
  return (
    <div className="grid gap-2">
      <label>
        <span className="mb-1 block text-sm">النوع</span>
        <select value={draft.type} onChange={(e) => onChange({ ...draft, type: e.target.value as QuestionType })} className={fieldCls} style={fieldStyle}>
          <option value="mcq">اختيار من متعدد</option>
          <option value="tf">صح / خطأ</option>
          <option value="essay">مقالية</option>
        </select>
      </label>
      <label>
        <span className="mb-1 block text-sm">نص السؤال</span>
        <input value={draft.prompt} onChange={(e) => onChange({ ...draft, prompt: e.target.value })} dir="auto" className={fieldCls} style={fieldStyle} />
      </label>
      {draft.type === 'mcq' && (
        <McqOptionsEditor
          options={draft.options}
          correctIndex={draft.correctIndex}
          onChange={(options, correctIndex) => onChange({ ...draft, options, correctIndex })}
        />
      )}
      {draft.type === 'tf' && (
        <label>
          <span className="mb-1 block text-sm">الإجابة الصحيحة</span>
          <select value={draft.tfAnswer} onChange={(e) => onChange({ ...draft, tfAnswer: e.target.value as 'true' | 'false' })} className={fieldCls} style={fieldStyle}>
            <option value="true">صح</option>
            <option value="false">خطأ</option>
          </select>
        </label>
      )}
      <label>
        <span className="mb-1 block text-sm">الدرجة العظمى</span>
        <input value={draft.maxScore} onChange={(e) => onChange({ ...draft, maxScore: e.target.value })} dir="ltr" inputMode="numeric" className={fieldCls} style={fieldStyle} />
      </label>
    </div>
  )
}

export function QuestionCard({
  q,
  index,
  examId,
  onDelete,
}: {
  q: QuestionOut
  index: number
  examId: string
  onDelete: () => void
}) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q.id })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<QuestionDraft>(() => questionToDraft(q))
  const [err, setErr] = useState<string | null>(null)

  const saveQ = useMutation({
    mutationFn: () => api.put(`/questions/${q.id}`, draftToBody(draft, q.position)),
    onSuccess: () => {
      setErr(null)
      setEditing(false)
      toast('تم حفظ السؤال')
      qc.invalidateQueries({ queryKey: ['exam-detail', examId] })
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? localizeDetail(e.detail) : 'تعذّر الحفظ'
      setErr(msg)
      if (e instanceof ApiError && e.status === 429) toast(msg)
    },
  })

  const submit = () => {
    const v = validateDraft(draft)
    if (v) {
      setErr(v)
      return
    }
    saveQ.mutate()
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : undefined }}
      className="card rounded-2xl p-4"
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-label="سحب لإعادة الترتيب"
          {...attributes}
          {...listeners}
          className="cursor-grab px-1 text-lg leading-none"
          style={{ touchAction: 'pan-y' }}
        >
          ⋮⋮
        </button>
        <div className="min-w-0 flex-1">
          {!editing ? (
            <>
              <p className="font-bold">
                <span dir="ltr">{index + 1}.</span> {q.prompt}{' '}
                <span className="muted-t text-xs">
                  ({typeLabel(q.type)} · <span dir="ltr">{q.max_score}</span>)
                </span>
              </p>
              {q.options && q.options.length > 0 && (
                <p className="muted-t text-sm" dir="auto">
                  {q.options.join(' | ')}
                </p>
              )}
              <div className="mt-2 flex gap-3 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(questionToDraft(q))
                    setErr(null)
                    setEditing(true)
                  }}
                  className="underline"
                >
                  تحرير
                </button>
                <button type="button" onClick={onDelete} className="underline">
                  حذف
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mb-2 font-bold">
                <span dir="ltr">{index + 1}.</span> تحرير السؤال
              </p>
              <QuestionFields draft={draft} onChange={setDraft} />
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={submit} disabled={saveQ.isPending} className={btnPrimary} style={{ width: 'auto' }}>
                  حفظ
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(questionToDraft(q))
                    setErr(null)
                    setEditing(false)
                  }}
                  className={btnSecondary}
                >
                  إلغاء
                </button>
              </div>
              {err && (
                <p role="alert" className="mt-2 text-sm" style={{ color: 'var(--secondary)' }}>
                  {err}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  )
}

export function DraftQuestionCard({
  draftKey,
  draft,
  examId,
  position,
  onChange,
  onSaved,
  onDiscard,
}: {
  draftKey: number
  draft: QuestionDraft
  examId: string
  position: number
  onChange: (next: QuestionDraft) => void
  onSaved: () => void
  onDiscard: () => void
}) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `draft-${draftKey}`,
  })
  const [err, setErr] = useState<string | null>(null)

  const add = useMutation({
    mutationFn: () => api.post<QuestionOut>(`/exams/${examId}/questions`, draftToBody(draft, position)),
    onSuccess: () => {
      setErr(null)
      toast('تمت إضافة السؤال')
      qc.invalidateQueries({ queryKey: ['exam-detail', examId] })
      onSaved()
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? localizeDetail(e.detail) : 'تعذّر إضافة السؤال'
      setErr(msg)
      if (e instanceof ApiError && e.status === 429) toast(msg)
    },
  })

  const submit = () => {
    const v = validateDraft(draft)
    if (v) {
      setErr(v)
      return
    }
    add.mutate()
  }

  return (
    <li
      ref={setNodeRef}
      id={`draft-${draftKey}`}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : undefined }}
      className="rounded-2xl border-2 border-dashed p-4"
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-label="سحب لإعادة الترتيب"
          {...attributes}
          {...listeners}
          className="cursor-grab px-1 text-lg leading-none"
          style={{ touchAction: 'pan-y' }}
        >
          ⋮⋮
        </button>
        <div className="min-w-0 flex-1">
          <p className="mb-2 font-bold">سؤال جديد</p>
          <QuestionFields draft={draft} onChange={onChange} />
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={submit} disabled={add.isPending} className={btnPrimary} style={{ width: 'auto' }}>
              إضافة السؤال
            </button>
            <button type="button" onClick={onDiscard} className={btnSecondary}>
              تجاهل
            </button>
          </div>
          {err && (
            <p role="alert" className="mt-2 text-sm" style={{ color: 'var(--secondary)' }}>
              {err}
            </p>
          )}
        </div>
      </div>
    </li>
  )
}

export function GradebookPage() {
  const { examId = '' } = useParams()
  const { toast } = useToast()
  // Route supplies examId; courseId resolved via exam detail.
  const detail = useQuery({
    queryKey: ['exam-detail', examId],
    queryFn: () => api.get<ExamDetailOut>(`/exams/${examId}`),
  })
  const cid = detail.data?.course_id ?? ''
  const gradebook = useQuery({
    queryKey: ['gradebook', cid],
    queryFn: () => (cid ? api.get<GradebookRowOut[]>(`/courses/${cid}/gradebook`) : Promise.resolve([])),
    enabled: Boolean(cid),
  })

  const exportCsv = async () => {
    if (!cid) return
    try {
      const blob = await api.downloadCsv(`/courses/${cid}/gradebook/export`)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gradebook-${cid}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast(e instanceof ApiError ? localizeDetail(e.detail) : 'تعذّر التصدير')
    }
  }

  const publishExam = useMutation({
    mutationFn: () => api.post(`/exams/${examId}/publish`, {}),
    onSuccess: () => toast('تم النشر'),
    onError: (e) => toast(e instanceof ApiError ? localizeDetail(e.detail) : 'تعذّر النشر'),
  })

  const [query, setQuery] = useState('')
  const rows = (gradebook.data ?? []).filter((r) => r.exam_id === examId)
  const visibleRows = rows.filter((r) => matchesArabic(`${r.student_name} ${r.student_email}`, query))
  const examTitle = detail.data?.title ?? ''

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pt-28 sm:px-6">
      <h1 className="font-heading text-2xl font-bold">
        {examTitle ? `سجل الدرجات: ${examTitle}` : 'سجل الدرجات'}
      </h1>
      <p className="muted-t text-sm">MCQ/TF تُصحح تلقائيًا عند التسليم؛ المقالية تُصحح في صفحة مستقلة.</p>
      {cid && (
        <Link to={`/teach/courses/${cid}/exams`} className="underline text-sm">
          → الاختبارات
        </Link>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          to={`/teach/exams/${examId}/essays`}
          className="btn-primary transition-ui rounded-xl px-4 py-1.5"
        >
          تصحيح المقالية
        </Link>
        <button type="button" onClick={exportCsv} className="transition-ui clickable rounded-xl border px-4 py-1.5" style={{ borderColor: 'var(--border)' }}>
          تصدير CSV
        </button>
        <button
          type="button"
          onClick={() => publishExam.mutate()}
          className="transition-ui clickable rounded-xl border px-4 py-1.5"
          style={{ borderColor: 'var(--gold)' }}
        >
          نشر النتائج
        </button>
      </div>
      <div className="card mt-3 overflow-x-auto rounded-2xl p-4">
        {rows.length > 0 && (
          <div className="mb-2">
            <SearchBox value={query} onChange={setQuery} placeholder={str.searchStudentsPlaceholder} />
          </div>
        )}
        {query && rows.length > 0 && (
          <p className="muted-t mb-2 text-xs">
            {str.resultCount}: <span dir="ltr">{visibleRows.length}</span>
          </p>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="muted-t text-start">
              <th className="p-2">الطالب</th>
              <th className="p-2">الدرجة</th>
              <th className="p-2">الحالة</th>
              <th className="p-2">منشور</th>
              <th className="p-2">تصحيح</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !gradebook.isPending && (
              <tr>
                <td colSpan={5} className="muted-t p-4 text-center">
                  لا محاولات مُسلّمة بعد
                </td>
              </tr>
            )}
            {rows.length > 0 && visibleRows.length === 0 && (
              <tr>
                <td colSpan={5} className="muted-t p-4 text-center">
                  {str.noResults}
                </td>
              </tr>
            )}
            {visibleRows.map((r) => (
              <tr key={r.attempt_id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                <td className="p-2">
                  <span dir="auto" className="font-bold">{r.student_name}</span>
                  {r.student_email !== r.student_name && (
                    <span dir="ltr" className="muted-t block text-xs">{r.student_email}</span>
                  )}
                </td>
                <td className="p-2" dir="ltr">{r.score ?? '—'} / {r.max_score}</td>
                <td className="p-2">{r.status === 'submitted' ? 'مُسلّمة' : r.status}{r.is_late ? ' · متأخر' : ''}</td>
                <td className="p-2">{r.is_published ? 'نعم' : 'لا'}</td>
                <td className="p-2">
                  <Link to={`/teach/exams/${examId}/essays?attempt=${r.attempt_id}`} className="underline">
                    صحح
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}

export function EssayGradingPage() {
  const { examId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { toast } = useToast()
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get('attempt'))
  const [scores, setScores] = useState<Record<string, string>>({})
  const [feedbacks, setFeedbacks] = useState<Record<string, string>>({})

  const detail = useQuery({
    queryKey: ['exam-detail', examId],
    queryFn: () => api.get<ExamDetailOut>(`/exams/${examId}`),
  })
  const cid = detail.data?.course_id ?? ''
  const gradebook = useQuery({
    queryKey: ['gradebook', cid],
    queryFn: () => (cid ? api.get<GradebookRowOut[]>(`/courses/${cid}/gradebook`) : Promise.resolve([])),
    enabled: Boolean(cid),
  })
  const submitted = (gradebook.data ?? []).filter((r) => r.exam_id === examId)

  const pick = (nextId: string | null) => {
    setSelectedId(nextId)
    setScores({})
    setFeedbacks({})
    // Deep-linkable grading position: back/forward + gradebook links survive.
    setSearchParams(nextId ? { attempt: nextId } : {}, { replace: true })
  }

  const step = (dir: 1 | -1) => {
    if (!selectedId) {
      if (submitted.length > 0) pick(submitted[0].attempt_id)
      return
    }
    const i = submitted.findIndex((r) => r.attempt_id === selectedId)
    const next = submitted[i + dir]
    if (next) pick(next.attempt_id)
  }

  const attempt = useQuery({
    queryKey: ['grade-attempt', selectedId],
    queryFn: () => api.get<AttemptOut>(`/attempts/${selectedId}`),
    enabled: Boolean(selectedId),
  })

  const essays = (attempt.data?.questions ?? []).filter((q) => q.type === 'essay')

  const save = async (qid: string, maxScore: number) => {
    if (!selectedId) return
    const awarded = Number(scores[qid])
    if (!Number.isFinite(awarded) || awarded < 0 || awarded > maxScore) {
      toast(`الدرجة بين 0 و ${maxScore}`)
      return
    }
    if (!feedbacks[qid]?.trim()) {
      toast('الملاحظة مطلوبة مع الدرجة')
      return
    }
    try {
      await api.patch(`/attempts/${selectedId}/answers/${qid}`, {
        awarded_score: awarded,
        feedback: feedbacks[qid],
      })
      toast('تم حفظ التصحيح')
      attempt.refetch()
      if (cid) qc.invalidateQueries({ queryKey: ['gradebook', cid] })
    } catch (e) {
      toast(e instanceof ApiError ? localizeDetail(e.detail) : 'تعذّر الحفظ')
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-28 sm:px-6">
      <Link to={`/teach/exams/${examId}/grade`} className="underline text-sm">
        → السجل
      </Link>{' '}
      {cid && (
        <Link to={`/teach/courses/${cid}/exams`} className="underline text-sm">
          الاختبارات
        </Link>
      )}
      <h1 className="font-heading mt-1 text-2xl font-bold">تصحيح المقالية (درجة + ملاحظة)</h1>
      <label className="card mt-3 block rounded-2xl p-4">
        <span className="mb-1 block text-sm">المحاولة المُسلّمة</span>
        <div className="flex gap-2">
          <select
            value={selectedId ?? ''}
            onChange={(e) => pick(e.target.value || null)}
            className={`${fieldCls} flex-1`}
            style={fieldStyle}
          >
            <option value="">— اختر محاولة —</option>
            {submitted.map((r) => {
              const pending = r.answers.filter((a) => a.needs_grading).length
              return (
                <option key={r.attempt_id} value={r.attempt_id}>
                  {r.student_email} · {r.score ?? '—'}/{r.max_score}
                  {pending > 0 ? ` · ${pending} بانتظار التصحيح` : ''}
                </option>
              )
            })}
          </select>
        </div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => step(1)}
            disabled={submitted.length === 0}
            className="transition-ui clickable rounded-xl border px-4 py-1.5 text-sm"
            style={{ borderColor: 'var(--border)' }}
          >
            التالية ←
          </button>
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={submitted.length === 0}
            className="transition-ui clickable rounded-xl border px-4 py-1.5 text-sm"
            style={{ borderColor: 'var(--border)' }}
          >
            → السابقة
          </button>
        </div>
      </label>
      {attempt.data && essays.length === 0 && <p className="muted-t mt-2 text-sm">لا أسئلة مقالية في هذه المحاولة.</p>}
      <ul className="mt-3 grid gap-3">
        {essays.map((q) => {
          const ans = attempt.data?.answers.find((a) => a.question_id === q.id)
          return (
            <li key={q.id} className="card rounded-2xl p-4">
              <p className="font-bold">{q.prompt}</p>
              <p className="muted-t mt-1 text-sm">إجابة الطالب: {ans?.text_answer || '—'}</p>
              <p className="muted-t text-xs">
                الحالية: <span dir="ltr">{ans?.awarded_score ?? '—'}</span> / <span dir="ltr">{q.max_score}</span>
                {ans?.needs_grading ? ' · بانتظار التصحيح' : ''}
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-[120px_1fr_auto]">
                <label>
                  <span className="mb-1 block text-sm">الدرجة</span>
                  <input
                    value={scores[q.id] ?? ''}
                    onChange={(e) => setScores((s) => ({ ...s, [q.id]: e.target.value }))}
                    dir="ltr"
                    inputMode="numeric"
                    className={fieldCls}
                    style={fieldStyle}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm">ملاحظة</span>
                  <input
                    value={feedbacks[q.id] ?? ''}
                    onChange={(e) => setFeedbacks((s) => ({ ...s, [q.id]: e.target.value }))}
                    className={fieldCls}
                    style={fieldStyle}
                  />
                </label>
                <button type="button" onClick={() => save(q.id, q.max_score)} className="btn-secondary transition-ui self-end rounded-xl px-4 py-2">
                  حفظ
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="muted-t mt-2 text-xs">درجات الطلاب تظهر فقط حسب إعداد النشر immediate / after_publish.</p>
    </main>
  )
}

export function CourseExamsPage() {
  return <ExamAuthorPage />
}
