> **Superseded.** This was the pre-revision draft and is preserved as history only.
> The living spec is `.scratch/majlis-v1/spec.md` (seams re-confirmed after
> revision review). In particular this draft still describes a compress/worker
> pipeline, transcript txt files, and Google Drive — all rejected or removed;
> see ADR-0005 (superseded) and ADR-0008.

## Problem Statement

As a student in a mosque study circle learning Islamic sciences with a sheikh, I lose track of what was explained when I miss a session or want to review. Today recordings, book page photos/PDFs live in a shared Google Drive folder with no structure, no permissions control, no exams/grades, and no way to ask questions against what the sheikh actually said.

As the sheikh/teacher, I cannot control who joins, who sees which book/course, or follow student progress. As the admin/backend dev helping the sheikh, I want a private system that replaces Drive chaos, respects that this is not a public platform, and can grow into portfolio/sellable work.

## Solution

Majlis / مجلس — a private, Arabic-first LMS for a single mosque circle (sellable-ready later):

- Private enrollment: teachers invite-only, students self-signup then join courses via temporary codes + teacher approval.
- Structured content: Course = one book شرح كتاب, Lesson = one recording + pages range + attachments + two RAG source texts.
- Files pipeline: upload → compress → object storage → stream via signed URLs.
- Configurable exams (MCQ / True-False / essay) with gradebook and teacher-controlled result visibility.
- Per-course RAG chatbot that answers only from lesson transcripts/book extracts and cites the lesson.
- All Dockerized for a single VPS + CDN frontend.

## User Stories

1. As an admin, I want to create teacher accounts via email invite with activation + password set, so that no public teacher signup exists.
2. As an admin, I want to manually migrate old Drive recordings/PDFs into structured lessons, so that history is preserved.
3. As an admin, I want to manage LLM API keys in DB (add/disable) without touching .env, so that free-tier rotation is easy.
4. As an admin, I want to platform-ban a user if needed, so that abuse is contained.
5. As a teacher, I want to create a course representing one book, so that students follow one شرح from start to end.
6. As a teacher, I want to create lessons inside a course with title, date, pages_from/to, so that each recording maps to what was explained.
7. As a teacher, I want to generate a temporary per-course join code with expiry/usage limit, so that only trusted students join.
8. As a teacher, I want to list, trace and revoke active codes, so that leaked codes stop working.
9. As a teacher, I want to review a pending queue with student name/phone/note, so that I decide who listens.
10. As a teacher, I want to approve/reject pending students and block/unblock enrolled students per-course, so that rejected can retry with a new code but blocked cannot rejoin that course.
11. As a teacher, I want to upload/linking recording (audio/video), PDF pages, plus transcript_voice.txt and transcript_book.txt per lesson, so that students and RAG share same sources.
12. As a teacher, I want to see lesson processing → ready status after compress/upload, so that I know when students can stream.
13. As a teacher, I want to create an exam linked to a course with optional lesson_id (null = general), so that I cover single lesson or whole book.
14. As a teacher, I want to configure attempts, duration, open/close dates, pass score, and result visibility (immediate vs after-publish), so that each exam behaves differently without code changes.
15. As a teacher, I want to add MCQ (4 options, 1 correct), True-False, and essay (max_score) questions, so that knowledge and expression are both tested.
16. As a teacher, I want MCQ/TF auto-graded instantly and essay left pending, so that manual grading is only where needed.
17. As a teacher, I want to grade essays with score + feedback text, so that students learn.
18. As a teacher, I want a per-course gradebook with CSV export, so that I follow progress.
19. As a teacher, I want to choose publish timing for scores/reviews, so that students see results only when I allow.
20. As a student, I want public signup with email verification + login/refresh + password reset, so that I can access without teacher pre-creating me.
21. As a student, I want a dashboard with my courses + Join-with-code box anytime, so that one account joins N courses.
22. As a student, I want to stay pending until approved with clear status, so that I know I wait for sheikh review.
23. As a student, I want to view lessons with streaming audio/video (byte-range) + PDF pages, RTL Arabic responsive on mobile sizes, so that I review on phone.
24. As a student, I want to take an exam within its window with timer and single attempt by default, so that it feels fair.
25. As a student, I want to see my score/review only per teacher setting, so that I respect publish rules.
26. As a student, I want to ask the per-course chatbot in Arabic and get answers only from transcripts/book extracts with lesson citation, so that I trust it matches what the sheikh said.
27. As a student, I want a clear “not explained in lessons” refusal plus daily quota notice when AI is busy, so that hallucinations and cost overruns are bounded.
28. As a system, I want rate-limiting on signup/login/join-code/chat, so that public student signup cannot be spammed.

## Implementation Decisions

Seams proposed (highest possible, new codebase — please confirm):
- Seam 1 Identity & Enrollment: signup/verify/login/refresh/reset + invites + codes + approvals/blocks. This is the only auth seam; everything else calls it for membership checks.
- Seam 2 Course & Lesson library: course/book, lesson/session with pages range, attachments metadata, processing status. Single content seam; exams and chat read from it, never duplicate.
- Seam 3 Storage pipeline: intake on VPS temp → background compress → push to R2 → signed serve. Only seam allowed to touch bytes; API and worker communicate via job status, not filesystem paths.
- Seam 4 Assessment: exams, questions, attempts, auto-grade vs manual-grade, gradebook, publish gates. Only seam that writes grades.
- Seam 5 Knowledge & Chat: chunk/index transcripts, per-course collections, retrieve + cite, key vault rotation. Only seam allowed to call external LLM providers.

Modules and interfaces:
- Identity module exposes current-user, role check (admin/teacher/student), course-membership check (approved or not).
- Enrollment exposes code generation/validation/consumption with expiry/uses/audit, plus approval transition pending → approved/rejected/blocked.
- Course module: Course has title/description/book ref + organization_id reserved for future multi-org. Lesson has title, date, pages_from/to, recording ref, pdf ref, transcript_voice, transcript_book, processing status.
- Storage contract: lesson attachments transition processing → ready/failed; serve via short-lived signed URLs with Range support; single bucket with course/lesson prefix; local temp deleted after R2 confirm.
- Exam contract: Exam has course + nullable lesson, attempts, duration, open/close window, show-result mode immediate/after-publish, pass score. Question has type MCQ/TF/essay with options/correct/max_score. Attempt has score, per-question grades, feedback, published flag.
- Gradebook is a read projection over attempts; CSV export is a representation, not separate storage.
- Chat contract: per-course collection, chunk approx 800 tokens / 150 overlap over transcript_voice + transcript_book with metadata lesson/pages; prompt enforces Arabic-first, sources-only, cite lesson title, refuse otherwise; per-student daily quota + response cache.
- Key vault: provider/model/encrypted key/weight/active/quota/last_used stored in Postgres encrypted at rest, decrypt only in worker memory, rotation by least-recently-used skipping 429/5xx, full usage log with tokens/latency/error, Redis caches rotation pointer for speed. Master encryption key only secret in env.
- API style: async FastAPI, async Postgres access, Alembic migrations, JWT short access + long refresh. Arabic-first error messages where user-facing.
- Deployment: Docker Compose services api + frontend + postgres + qdrant + worker + redis + reverse-proxy; the frontend is a static build served by its own nginx container behind the reverse proxy. Single R2 bucket private.
- Rejected vs blocked semantics: rejected = soft, may re-apply with new code; blocked = per-course ban, cannot rejoin that course; platform ban admin-only.
- Lesson upload in V1 admin-only; teacher-upload is V2 to bound scope.

Technical clarifications:
- Pinned stable versions: Python 3.14.7, Postgres 18.6, Qdrant v1.19.0 with client 1.19.0, Redis 8.10, FastAPI 0.141.1, LangGraph 1.2.9 + current langchain-core, React 19.3, Bun 1.4.2, uv 0.12.13, Ruff 0.16.6.
- Package management: uv for backend, bun for frontend. Lint/format: ruff.
- No size limit enforced in app for V1; operational cap is VPS temp + R2 budget. No transcoding options in V1, single preset: video 720p H264, audio Opus/MP3 64k, PDF/images as-is.
- Email required for verification/reset via SMTP (provider configurable).
- TLS via Cloudflare to VPS proxy.

Schema sketch (decision-rich, from design discussion):
- users, teacher_invites, courses, lessons, lesson_files, enrollment_codes with uses/expiry/audit, enrollments with status pending/approved/rejected/blocked, exams, questions, attempts, attempt_answers, grades projection, llm_api_keys encrypted, llm_usage_log, chat_cache, rag_chunks metadata.

## Testing Decisions

What makes a good test here: test external behavior through the seam, not implementation. Auth shows correct gate; enrollment shows correct transition; exam shows correct grade/publish; chat shows cited or refused answer. No filesystem, ffmpeg, R2, or LLM network in unit tests — fake at seam boundary.

Modules to test:
- Identity & Enrollment: invite/verify/login, code consume/expiry/uses, approve/reject/block transitions, spam rate-limits.
- Course & Lesson: create course/lesson, pages range validation, processing → ready transition, membership gate for viewing.
- Storage pipeline: job success moves to ready + signed URL issued, failure stays failed with reason, temp cleanup logic.
- Assessment: MCQ/TF auto-score, essay pending → manual grade + feedback, attempts limit, window enforcement, immediate vs after-publish visibility, gradebook CSV shape.
- Knowledge & Chat: retrieval cites correct lesson, out-of-scope refused, quota/cache hit, key rotation skips failing key and logs usage.

Prior art: greenfield, no existing tests. Start with API-level behavior tests per seam plus contract tests for R2-signed serve (Range) and vault rotation using fakes.

## Out of Scope

- Word-level timestamps (“minute X”) — V2 after word segments.
- Automatic Whisper/agent transcription pipeline — V1 manual upload of two txt files; auto is V2.
- Teacher self-upload UI beyond admin — V2.
- Multi-organization SaaS, HLS streaming, video multi-bitrate, shuffle/proctoring, mobile native app, Drive sync, public course discovery.
- Transcoding presets choice, unlimited retention guarantees beyond R2, scheduled recording backup + restore (deferred to post-V1).

## Further Notes

- Working name Majlis / مجلس, tagline direction “private circle”. Logo placeholder uppercase MAJLIS.
- Full-time build estimate 6-8 weeks all-in-one V1: auth/enrollment + courses/lessons + storage pipeline, then exams, then RAG + vault. Do not split bot to later without explicit re-scope.
- Frontend must be responsive for mobile sizes, RTL Arabic first, no native app.
- Operational warning: 100GB VPS is temp only; R2 is source of truth and sole copy for V1.
- Cost control: external LLM APIs required (Groq/OpenRouter for generation, Gemini for embeddings); Qdrant stays on VPS; quota + cache mandatory.
