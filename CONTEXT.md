# Majlis / مجلس — Domain Glossary (CONTEXT.md)

Single-context repo. Use these terms exactly as defined; do not drift to synonyms.

## Core concepts

- **Course = book (كتاب / شرح كتاب):** one book explained by the sheikh from start to end. The top-level container students join.
- **Lesson = one recording session (درس / تسجيل):** one audio recording plus the pages explained in it. Has title, date, pages_from/to, one audio file, two transcript texts.
- **Pages range:** the pages_from → pages_to explained in a lesson. Books are not pre-split into chapters; the range is the structure.
- **Transcript (voice):** TEXT pasted by admin/teacher containing what was said in the recording (manual MVP, e.g. via Whisper script). A DB column on lessons, not a file.
- **Transcript (book):** TEXT pasted by admin/teacher containing the explained book pages for the lesson. A DB column on lessons, not a file.
- **Recording:** V1 = audio only (~100–150MB). Schema field `media_type` is generic so video can be added in V2 without migration, but V1 UI accepts audio only.

## People & access

- **Admin:** the dev helping the sheikh. Creates teacher invites, migrates old content, manages LLM keys, can platform-ban.
- **Teacher / Sheikh:** owns courses, generates join codes, approves students, authors exams, grades essays. Invite-only, never public signup.
- **Student:** public signup with email verification, joins courses only via codes, stays pending until approved.

## Enrollment

- **Join code:** temporary per-course code (default 8 chars, 7 days, 50 uses, max 5 active per course). Traceable and revocable by teacher/admin.
- **Pending:** student entered a valid code and waits for teacher review (sees name/phone/note).
- **Approved:** teacher accepted; student accesses course content.
- **Rejected:** soft refusal; student may re-apply with a (new) code.
- **Blocked:** per-course ban; student cannot rejoin that course. Platform ban is admin-only and separate.

## Assessment

- **Exam:** belongs to a course, optionally to one lesson (null lesson = general/book-wide). Config: attempts, duration, open/close window, pass score, show-result mode (immediate vs after-publish).
- **Question types:** MCQ (4 options, 1 correct), True/False, essay (max_score).
- **Attempt:** one student sitting. MCQ/TF auto-scored on submit; essay pending until teacher grades with score + feedback.
- **Gradebook:** read projection over attempts per course, with CSV export. Scores visible to students only per the exam's publish setting.

## Knowledge & chat

- **RAG core:** indexing + retrieval/answer over transcript TEXT from Postgres. No chat UI.
- **Chunk:** ~800 tokens / ~150 overlap (CONFIG, not constants). Metadata: lesson_id, course_id, pages range, source_type (voice|book).
- **Collection:** one Qdrant collection per course.
- **Chat:** per-course UI over the RAG core. Cites lesson title + pages. 30 queries/day/student, cached, graceful “AI busy”.
- **Key vault:** provider API keys stored Fernet-encrypted in Postgres (never .env), round-robin least-recent skipping 429/5xx, Redis fast pointer, full usage log.
- **Quality gate:** admin manually grades 20–30 eval answers before chat UI work starts.

## Milestones

- **Milestone 1 (tickets 01–06):** sheikh logs in, creates course, generates codes, approves students, uploads lesson audio + transcripts, students listen. Exams and chatbot come after.
