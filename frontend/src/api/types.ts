// Backend contract types (/api/v1). Field names mirror Pydantic schemas exactly.

export type Role = 'admin' | 'teacher' | 'student'
export type EnrollmentStatus = 'pending' | 'approved' | 'rejected' | 'blocked'
export type DashboardEnrollmentStatus = EnrollmentStatus | 'owner' | 'admin'
export type LessonStatus = 'processing' | 'ready' | 'failed'
export type ShowResultMode = 'immediate' | 'after_publish'
export type QuestionType = 'mcq' | 'tf' | 'essay'
export type WindowStatus = 'open' | 'upcoming' | 'closed'

export type TokenOut = { access_token: string; refresh_token: string; token_type: string }
export type UserOut = {
  id: string
  email: string
  full_name?: string | null
  role: Role
  is_verified: boolean
}

export type CourseOut = {
  id: string
  title: string
  description?: string | null
  book_title?: string | null
  owner_id?: string | null
  created_at?: string | null
}

export type LessonSummaryOut = {
  id: string
  course_id: string
  title: string
  lesson_date?: string | null
  pages_from?: number | null
  pages_to?: number | null
  media_type?: string | null
  status: LessonStatus
  attachment_count: number
  created_at?: string | null
}

export type LessonOut = LessonSummaryOut & {
  audio_key?: string | null
  transcript_voice?: string | null
  transcript_book?: string | null
  can_manage?: boolean
}

export type PlayOut = { playback_url: string; expires_in: number }
export type UploadUrlOut = { upload_url: string; object_key: string; expires_in: number }

export type CodeOut = {
  id: string
  code: string
  code_prefix: string
  max_uses: number
  uses_count: number
  expires_at: string
  created_at: string
}
export type CodeListOut = Omit<CodeOut, 'code'>[]

export type EnrollmentOut = {
  id: string
  course_id: string
  course_title?: string | null
  user_id: string
  code_id?: string | null
  status: EnrollmentStatus
  display_name: string
  phone?: string | null
  note?: string | null
  decided_by?: string | null
  decided_at?: string | null
  created_at: string
  updated_at: string
}

export type DashboardItem = {
  course: CourseOut
  enrollment_status: DashboardEnrollmentStatus
  enrollment?: EnrollmentOut | null
  lesson_count: number
  ready_count: number
}
export type DashboardOut = { items: DashboardItem[] }

export type ExamOut = {
  id: string
  course_id: string
  lesson_id?: string | null
  title: string
  description?: string | null
  attempts_limit: number
  duration_minutes?: number | null
  open_at?: string | null
  close_at?: string | null
  pass_score: number
  show_result: ShowResultMode
}

// Student-safe: never carries correct_index / correct_answer.
export type StudentExamOut = ExamOut & {
  attempts_used: number
  attempts_left: number
  window_status: WindowStatus
  has_in_progress: boolean
  last_score?: number | null
}

export type QuestionOut = {
  id: string
  exam_id: string
  type: QuestionType
  prompt: string
  options?: string[] | null
  max_score: number
  position: number
}

export type ExamDetailOut = ExamOut & { questions: QuestionOut[] }

export type AttemptAnswerOut = {
  question_id: string
  selected_index?: number | null
  selected_bool?: boolean | null
  text_answer?: string | null
  awarded_score?: number | null
  is_correct?: boolean | null
  needs_grading: boolean
  feedback?: string | null
}

export type AttemptQuestionOut = {
  id: string
  type: QuestionType
  prompt: string
  options?: string[] | null
  max_score: number
  position: number
}

export type AttemptOut = {
  id: string
  exam_id: string
  course_id: string
  student_id: string
  status: string
  started_at: string
  expires_at?: string | null
  submitted_at?: string | null
  score?: number | null
  max_score: number
  is_published: boolean
  is_late: boolean
  questions: AttemptQuestionOut[]
  answers: AttemptAnswerOut[]
}

export type GradebookRowOut = {
  student_id: string
  display_name: string
  attempts: number
  best_score?: number | null
  last_score?: number | null
  published: boolean
}

export type InviteOut = {
  id: string
  email: string
  expires_at: string
  used_at?: string | null
  revoked_at?: string | null
  created_at: string
}

export type AttachmentOut = {
  id: string
  lesson_id: string
  title: string
  description?: string | null
  file_key?: string | null
  content_type?: string | null
  has_file: boolean
  created_at: string
}
