import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { api } from '../api/http'
import type { AttemptOut, ExamDetailOut, ExamOut, QuestionOut, QuestionType } from '../api/types'
import { localizeDetail } from '../i18n'
import { useToast } from '../components/Toast'
import { WindowBadge } from '../components/Badges'
import { windowStatusFromDates } from '../features/exams/helpers'
import { btnPrimary, fieldCls, fieldStyle } from './Auth'

export function ExamAuthorPage() {
  const { id: courseId = '' } = useParams()
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

  const exams = useQuery({
    queryKey: ['exams-manage', courseId],
    queryFn: () => api.get<ExamOut[]>(`/courses/${courseId}/exams`),
  })

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
      setTitle('')
      setDescription('')
      setErr(null)
      qc.invalidateQueries({ queryKey: ['exams-manage', courseId] })
    },
    onError: (e) => setErr(e instanceof ApiError ? localizeDetail(e.detail) : 'تعذّر الإنشاء'),
  })

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pt-28 sm:px-6">
      <Link to="/teach" className="underline text-sm">
        ← لوحة المعلم
      </Link>
      <h1 className="font-heading mt-1 text-2xl font-bold">تأليف الاختبارات</h1>
      <form
        className="card mt-3 grid gap-2 rounded-2xl p-4"
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
              <option value="immediate">فورية immediate</option>
              <option value="after_publish">بعد النشر after_publish</option>
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
      <ul className="mt-4 grid gap-3">
        {exams.data?.map((ex) => (
          <li key={ex.id} className="card arabesque rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-heading font-bold">{ex.title}</h2>
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
                التصحيح والسجل
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}

export function ExamDetailManagePage() {
  const { examId = '' } = useParams()
  const qc = useQueryClient()
  const { toast } = useToast()
  const detail = useQuery({
    queryKey: ['exam-detail', examId],
    queryFn: () => api.get<ExamDetailOut>(`/exams/${examId}`),
  })
  const [prompt, setPrompt] = useState('')
  const [qtype, setQtype] = useState<QuestionType>('mcq')
  const [options, setOptions] = useState('أ,ب,ج,د')
  const [correctIndex, setCorrectIndex] = useState('0')
  const [tfAnswer, setTfAnswer] = useState<'true' | 'false'>('true')
  const [maxScore, setMaxScore] = useState('5')

  const addQ = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        type: qtype,
        prompt,
        max_score: Number(maxScore),
        position: detail.data?.questions.length ?? 0,
      }
      if (qtype === 'mcq') {
        const opts = options.split(',').map((s) => s.trim()).filter(Boolean)
        if (opts.length !== 4) throw new Error('MCQ needs exactly 4 options')
        body['options'] = opts
        body['correct_index'] = Number(correctIndex)
      }
      if (qtype === 'tf') body['correct_answer'] = tfAnswer
      return api.post<QuestionOut>(`/exams/${examId}/questions`, body)
    },
    onSuccess: () => {
      setPrompt('')
      qc.invalidateQueries({ queryKey: ['exam-detail', examId] })
    },
    onError: (e) => toast(e instanceof ApiError ? localizeDetail(e.detail) : 'تعذّر إضافة السؤال'),
  })

  const delQ = useMutation({
    mutationFn: (qid: string) => api.delete(`/questions/${qid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exam-detail', examId] }),
  })

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-28 sm:px-6">
      <h1 className="font-heading text-2xl font-bold">{detail.data?.title ?? 'الاختبار'}</h1>
      <div className="card mt-3 rounded-2xl p-4">
        <h2 className="font-heading mb-2 font-bold">سؤال جديد (MCQ 4 خيارات/1 صحيح · TF · مقالية)</h2>
        <div className="grid gap-2">
          <label>
            <span className="mb-1 block text-sm">النوع</span>
            <select value={qtype} onChange={(e) => setQtype(e.target.value as QuestionType)} className={fieldCls} style={fieldStyle}>
              <option value="mcq">اختيار من متعدد mcq</option>
              <option value="tf">صح/خطأ tf</option>
              <option value="essay">مقالية essay</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-sm">نص السؤال</span>
            <input value={prompt} onChange={(e) => setPrompt(e.target.value)} required className={fieldCls} style={fieldStyle} />
          </label>
          {qtype === 'mcq' && (
            <>
              <label>
                <span className="mb-1 block text-sm">الخيارات (افصل بفاصلة — 4 خيارات)</span>
                <input value={options} onChange={(e) => setOptions(e.target.value)} dir="ltr" className={fieldCls} style={fieldStyle} />
              </label>
              <label>
                <span className="mb-1 block text-sm">الفهرس الصحيح 0–3</span>
                <input value={correctIndex} onChange={(e) => setCorrectIndex(e.target.value)} dir="ltr" inputMode="numeric" className={fieldCls} style={fieldStyle} />
              </label>
            </>
          )}
          {qtype === 'tf' && (
            <label>
              <span className="mb-1 block text-sm">الإجابة الصحيحة</span>
              <select value={tfAnswer} onChange={(e) => setTfAnswer(e.target.value as 'true' | 'false')} className={fieldCls} style={fieldStyle}>
                <option value="true">صح true</option>
                <option value="false">خطأ false</option>
              </select>
            </label>
          )}
          <label>
            <span className="mb-1 block text-sm">الدرجة العظمى (للمقالية)</span>
            <input value={maxScore} onChange={(e) => setMaxScore(e.target.value)} dir="ltr" inputMode="numeric" className={fieldCls} style={fieldStyle} />
          </label>
          <button type="button" onClick={() => addQ.mutate()} className={btnPrimary}>
            إضافة السؤال
          </button>
        </div>
      </div>
      <ol className="mt-4 grid gap-3">
        {detail.data?.questions.map((q, i) => (
          <li key={q.id} className="card rounded-2xl p-4">
            <p className="font-bold">
              {i + 1}. {q.prompt} <span className="muted-t text-xs">({q.type} · {q.max_score})</span>
            </p>
            {q.options && (
              <p className="muted-t text-sm" dir="ltr">
                {q.options.join(' | ')}
              </p>
            )}
            <button type="button" onClick={() => delQ.mutate(q.id)} className="mt-2 underline text-sm">
              حذف
            </button>
          </li>
        ))}
      </ol>
    </main>
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
    queryFn: () => (cid ? api.get<Array<Record<string, unknown>>>(`/courses/${cid}/gradebook`) : Promise.resolve([])),
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

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pt-28 sm:px-6">
      <h1 className="font-heading text-2xl font-bold">السجل والتصحيح</h1>
      <p className="muted-t text-sm">MCQ/TF تُصحح تلقائيًا عند التسليم؛ المقالية تنتظر تصحيحك بدرجة + ملاحظة.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={exportCsv} className="btn-primary transition-ui rounded-xl px-4 py-1.5">
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
        <table className="w-full text-sm">
          <thead>
            <tr className="muted-t text-start">
              <th className="p-2">الطالب</th>
              <th className="p-2">المحاولات</th>
              <th className="p-2">الأفضل</th>
              <th className="p-2">الأخيرة</th>
            </tr>
          </thead>
          <tbody>
            {gradebook.data?.map((r, i) => (
              <tr key={i} className="border-t" style={{ borderColor: 'var(--border)' }}>
                <td className="p-2">{String(r['display_name'] ?? r['student_id'] ?? '—')}</td>
                <td className="p-2" dir="ltr">{String(r['attempts'] ?? '—')}</td>
                <td className="p-2" dir="ltr">{String(r['best_score'] ?? '—')}</td>
                <td className="p-2" dir="ltr">{String(r['last_score'] ?? '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <EssayQueue examId={examId} />
    </main>
  )
}

function EssayQueue({ examId }: { examId: string }) {
  const { toast } = useToast()
  const [attemptId, setAttemptId] = useState('')
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const [scores, setScores] = useState<Record<string, string>>({})
  const [feedbacks, setFeedbacks] = useState<Record<string, string>>({})

  const attempt = useQuery({
    queryKey: ['grade-attempt', loadedId],
    queryFn: () => api.get<AttemptOut>(`/attempts/${loadedId}`),
    enabled: Boolean(loadedId),
  })

  const essays = (attempt.data?.questions ?? []).filter((q) => q.type === 'essay')

  const save = async (qid: string, maxScore: number) => {
    if (!loadedId) return
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
      await api.patch(`/attempts/${loadedId}/answers/${qid}`, {
        awarded_score: awarded,
        feedback: feedbacks[qid],
      })
      toast('تم حفظ التصحيح')
      attempt.refetch()
    } catch (e) {
      toast(e instanceof ApiError ? localizeDetail(e.detail) : 'تعذّر الحفظ')
    }
  }

  return (
    <div className="card mt-4 rounded-2xl p-4">
      <h2 className="font-heading mb-2 font-bold">تصحيح المقالية (درجة + ملاحظة)</h2>
      <p className="muted-t mb-2 text-xs">
        الصق معرف المحاولة attempt_id (تجده في سجل الطالب)، ثم صحح كل سؤال مقالي بدرجة وملاحظة.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          setLoadedId(attemptId.trim() || null)
        }}
      >
        <label className="flex-1">
          <span className="mb-1 block text-sm">معرف المحاولة attempt_id</span>
          <input value={attemptId} onChange={(e) => setAttemptId(e.target.value)} dir="ltr" className={fieldCls} style={fieldStyle} />
        </label>
        <button type="submit" className="btn-secondary transition-ui self-end rounded-xl px-5 py-2">
          عرض المقالية
        </button>
      </form>
      {attempt.data && essays.length === 0 && <p className="muted-t mt-2 text-sm">لا أسئلة مقالية في هذه المحاولة.</p>}
      <ul className="mt-3 grid gap-3">
        {essays.map((q) => {
          const ans = attempt.data?.answers.find((a) => a.question_id === q.id)
          return (
            <li key={q.id} className="rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
              <p className="font-bold">{q.prompt}</p>
              <p className="muted-t mt-1 text-sm">إجابة الطالب: {ans?.text_answer || '—'}</p>
              <p className="muted-t text-xs">
                الحالية: <span dir="ltr">{ans?.awarded_score ?? '—'}</span> / <span dir="ltr">{q.max_score}</span>
                {ans?.needs_grading ? ' · بانتظار التصحيح needs_grading' : ''}
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
      <p className="hidden">{examId}</p>
    </div>
  )
}

export function CourseExamsPage() {
  return <ExamAuthorPage />
}
