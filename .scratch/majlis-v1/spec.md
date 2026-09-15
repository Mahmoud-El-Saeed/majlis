Status: ready-for-agent

## Problem Statement

As a student in a mosque study circle learning Islamic sciences with a sheikh, I lose track of what was explained when I miss a session or want to review. Today recordings, book page photos/PDFs live in a shared Google Drive folder with no structure, no permissions control, no exams/grades, and no way to ask questions against what the sheikh actually said.

As the sheikh/teacher, I cannot control who joins, who sees which book/course, or follow student progress. As the admin/backend dev helping the sheikh, I want a private system that replaces Drive chaos, respects that this is not a public platform, and can grow into portfolio/sellable work.

## Solution

Majlis / مجلس — a private, Arabic-first LMS for a single mosque circle (sellable-ready later):

- Private enrollment: teachers invite-only, students self-signup then join courses via temporary codes + teacher approval.
- Structured content: Course = one book شرح كتاب, Lesson = one recording session + pages range + audio + transcripts stored as DB text.
- Files: audio-only V1, browser uploads directly to object storage via presigned URLs, streamed with byte-range.
- Configurable exams (MCQ / True-False / essay) with gradebook and teacher-controlled result visibility.
- Per-course RAG chatbot that answers only from lesson transcripts and cites the lesson.
- All Dockerized for a single VPS + CDN frontend, plus a scheduled backup of irreplaceable recordings to the existing Google Drive archive.

Milestone 1 = tickets 01–06: at its end the sheikh can log in, create a course, generate codes, approve students, upload a lesson's audio + transcripts, and students can listen. Exams and chatbot come after; sequencing decisions must protect this milestone.

## User Stories

1. As an admin, I want to create teacher accounts via email invite with activation + password set, so that no public teacher signup exists.
2. As an admin, I want to manually migrate old Drive recordings into structured lessons, so that history is preserved.
3. As an admin, I want to paste transcripts into a textarea per lesson (voice + book) instead of uploading files, so that manual MVP transcription is frictionless.
4. As an admin, I want to manage LLM API keys in DB (add/disable) without touching .env, so that free-tier rotation is easy.
5. As an admin, I want to platform-ban a user if needed, so that abuse is contained.
6. As a teacher, I want to create a course representing one book, so that students follow one شرح from start to end.
7. As a teacher, I want to create lessons inside a course with title, date, pages_from/to, audio, and pasted transcripts, so that each recording maps to what was explained.
8. As a teacher, I want to generate a temporary per-course join code with expiry/usage limit, so that only trusted students join.
9. As a teacher, I want to list, trace and revoke active codes, so that leaked codes stop working.
10. As a teacher, I want to review a pending queue with student name/phone/note, so that I decide who listens.
11. As a teacher, I want to approve/reject pending students and block/unblock enrolled students per-course, so that rejected can retry with a new code but blocked cannot rejoin that course.
12. As a teacher, I want to upload lesson audio directly from the browser with retry on failure and see processing → ready status, so that I know when students can listen.
13. As a teacher, I want to author an exam linked to a course with optional lesson_id (null = general), so that I cover a single lesson or the whole book.
14. As a teacher, I want to configure attempts, duration, open/close dates, pass score, and result visibility (immediate vs after-publish), so that each exam behaves differently without code changes.
15. As a teacher, I want to add MCQ (4 options, 1 correct), True-False, and essay (max_score) questions, so that knowledge and expression are both tested.
16. As a teacher, I want MCQ/TF auto-graded instantly and essay left pending, so that manual grading is only where needed.
17. As a teacher, I want to grade essays with score + feedback text, so that students learn.
18. As a teacher, I want a per-course gradebook with CSV export, so that I follow progress.
19. As a teacher, I want to choose publish timing for scores/reviews, so that students see results only when I allow.
20. As a student, I want public signup with email verification + login/refresh + password reset, so that I can access without teacher pre-creating me.
21. As a student, I want a dashboard with my courses + Join-with-code box anytime, so that one account joins N courses.
22. As a student, I want to stay pending until approved with clear status, so that I know I wait for sheikh review.
23. As a student, I want to listen to lesson audio (byte-range HTML5 player) with RTL Arabic responsive UI on mobile sizes, so that I review on my phone.
24. As a student, I want to take an exam within its window with timer and limited attempts, so that it feels fair.
25. As a student, I want to see my score/review only per teacher setting, so that I respect publish rules.
26. As a student, I want to ask the per-course chatbot in Arabic and get answers only from transcripts with lesson citation (title + pages), so that I trust it matches what the sheikh said.
27. As a student, I want a clear “not explained in lessons” refusal plus “AI busy” notice with daily quota, so that hallucinations and cost overruns are bounded.
28. As a system, I want rate-limiting on signup/login/join-code/chat, so that public student signup cannot be spammed.
29. As the sheikh, I want recordings backed up to the existing Google Drive archive on a schedule, so that irreplaceable lessons survive an R2 failure.

## Implementation Decisions

Seams (highest possible, greenfield — re-confirmed after revision review):
- Seam 1 Identity & Enrollment: signup/verify/login/refresh/reset + invites + codes + approvals/blocks. The only auth seam; everything else calls it for membership checks.
- Seam 2 Course & Lesson library: course/book, lesson/session with pages range, audio ref, transcript TEXT fields, processing status. Single content seam; exams and chat read from it, never duplicate.
- Seam 3 Storage: presigned direct-to-R2 audio upload + verify + signed serve. Only seam allowed to touch media bytes; no worker, no transcoding in V1.
- Seam 4 Assessment authoring: exams, question bank, config knobs. Only seam that defines what is graded.
- Seam 5 Assessment taking & grades: attempts, auto-grade vs manual-grade, gradebook, publish gates. Only seam that writes grades.
- Seam 6 Knowledge core: chunk/index transcripts from Postgres, retrieve + answer via CLI/curl. Only seam that builds the index.
- Seam 7 Chat surface: per-course chat UI over the knowledge core with quota/cache. Only seam students touch for AI.

Modules and interfaces:
- Identity module exposes current-user, role check (admin/teacher/student), course-membership check (approved or not).
- Enrollment exposes code generation/validation/consumption with expiry/uses/audit, plus approval transition pending → approved/rejected/blocked.
- Course module: Course has title/description/book ref + organization_id reserved for future multi-org. Lesson has title, date, pages_from/to, audio ref, media_type (generic, audio-only in V1 UI), transcript_voice TEXT, transcript_book TEXT, processing status.
- Storage contract: browser PUTs audio directly to R2 via short-lived presigned URL (~100–150MB files); client confirms; API verifies object exists then marks lesson ready; failure = retry with a fresh URL. Serve via short-lived signed URLs with Range support; single private bucket with course/lesson prefix. No ffmpeg, no compression, no background worker service in Compose.
- Exam authoring contract: Exam has course + nullable lesson, attempts, duration, open/close window, show-result mode immediate/after-publish, pass score. Question has type MCQ/TF/essay with options/correct/max_score.
- Taking contract: Attempt has score, per-question grades, feedback, published flag. MCQ/TF auto-scored on submit; essay left pending for manual grade + feedback text.
- Gradebook is a read projection over attempts; CSV export is a representation, not separate storage.
- RAG core contract: indexing reads transcript TEXT directly from Postgres (never files); chunk ~800 tokens / ~150 overlap, chunk sizes as CONFIG not constants; 1 Qdrant collection per course; chunk metadata lesson_id, course_id, pages range, source_type voice|book. Retrieval/answer callable from CLI or curl; LLM via Groq/OpenRouter, embeddings via Gemini, all through the key vault. Eval script answers 20–30 realistic Arabic questions logging answer + citations; admin manually grades quality — this gate must pass before chat UI starts.
- Chat contract: per-course UI, citations shown (lesson title + pages), 30 queries/day/student, response caching, graceful “AI busy” error. Prompt enforces Arabic-first, sources-only, refuse otherwise.
- Key vault: provider/model/encrypted key/weight/active/quota/last_used stored in Postgres encrypted at rest (Fernet), decrypt only in worker memory, rotation by least-recently-used skipping 429/5xx, full usage log with tokens/latency/error, Redis caches rotation pointer for speed. Master encryption key only secret in env; no provider keys in .env ever.
- API style: async FastAPI, async Postgres access, Alembic migrations, JWT short access + long refresh. Arabic-first error messages where user-facing.
- Deployment: Docker Compose services api + postgres + qdrant + redis + reverse-proxy (no worker). Frontend static build via Cloudflare Pages (fallback static via Nginx). Redis is used for rate-limiting, chat cache, and rotation pointer.
- Backup: scheduled rclone sync R2 → the existing Google Drive archive as disaster recovery (see ADR-0005).
- Rejected vs blocked semantics: rejected = soft, may re-apply with new code; blocked = per-course ban, cannot rejoin that course; platform ban admin-only.
- Lesson upload in V1 admin-only; teacher-upload is V2 to bound scope.

Technical clarifications:
- Pinned stable versions: Python 3.14.7, Postgres 18.6, Qdrant v1.19.0 with client 1.19.0, Redis 8.10, FastAPI 0.141.1, LangGraph 1.2.9 + current langchain-core, React 19.3, Bun 1.4.2, uv 0.12.13, Ruff 0.16.6.
- Package management: uv for backend, bun for frontend. Lint/format: ruff.
- V1 media = audio only (~100–150MB per recording). No size limit enforced in app; operational cap is R2 budget.
- Email required for verification/reset via SMTP (provider configurable).
- TLS via Cloudflare to VPS proxy.

Schema sketch (decision-rich, from design discussion):
- users, teacher_invites, courses, lessons (with audio ref, media_type, transcript_voice TEXT, transcript_book TEXT), enrollment_codes with uses/expiry/audit, enrollments with status pending/approved/rejected/blocked, exams, questions, attempts, attempt_answers, grades projection, llm_api_keys encrypted, llm_usage_log, chat_cache, rag_chunks metadata.

## Testing Decisions

What makes a good test here: test external behavior through the seam, not implementation. Auth shows correct gate; enrollment shows correct transition; exam shows correct grade/publish; chat shows cited or refused answer. No R2 network or LLM network in unit tests — fake at seam boundary. RAG quality is graded manually with the eval script before chat UI, not by unit tests.

Modules to test:
- Identity & Enrollment: invite/verify/login, code consume/expiry/uses, approve/reject/block transitions, spam rate-limits.
- Course & Lesson: create course/lesson, pages range validation, transcript fields saved/edited, processing → ready transition, membership gate for viewing.
- Storage: presigned URL issued, client confirm after real PUT marks ready, verify-missing stays unready with retry, signed serve supports Range.
- Assessment authoring: exam + question CRUD, config knobs persist and validate.
- Taking & grades: MCQ/TF auto-score, essay pending → manual grade + feedback, attempts limit, window enforcement, immediate vs after-publish visibility, gradebook CSV shape.
- Knowledge core: indexing reads Postgres text, chunk metadata complete, retrieval cites correct lesson, out-of-scope refused, rotation skips failing key and logs usage, quota/cache hit behavior.

Prior art: greenfield, no existing tests. Start with API-level behavior tests per seam plus contract tests for R2-signed serve (Range) and vault rotation using fakes.

## Out of Scope

- Video upload UI and all transcoding/compression (V2; schema media_type reserved, no migration needed).
- Background worker service (removed with the transcode pipeline).
- Word-level timestamps (“minute X”) — V2 after word segments.
- Automatic Whisper/agent transcription pipeline — V1 manual paste; auto is V2.
- Teacher self-upload UI beyond admin — V2.
- Multi-organization SaaS, HLS streaming, video multi-bitrate, shuffle/proctoring, mobile native app, Drive sync (upload direction), public course discovery.
- Unlimited retention guarantees beyond R2 + scheduled Drive backup.

## Further Notes

- Working name Majlis / مجلس, tagline direction “private circle”. Logo placeholder uppercase MAJLIS.
- Milestone 1 (tickets 01–06) ships the usable circle first; exams then chatbot. Full-time estimate unchanged in shape: M1 first, then assessment, then knowledge.
- Exam ticket split (authoring vs taking) and RAG split (core vs UI with manual quality gate) are deliberate sequencing to keep slices demoable and protect M1.
- Frontend must be responsive for mobile sizes, RTL Arabic first, no native app.
- Cost control: external LLM APIs required (Groq/OpenRouter for generation, Gemini for embeddings) via rotation over free tiers; Qdrant stays on VPS; quota + cache mandatory.
