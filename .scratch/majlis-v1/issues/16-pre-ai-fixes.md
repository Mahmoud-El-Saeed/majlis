# 16: Pre-AI fixes — course model, attachments, UX splits, theme, Drive removal

**What to build:** one preparation pass over the shipped circle (tickets 01–09, 14, 15) so the domain matches how the sheikh actually teaches, two broken teacher flows work again, and no trace of Google Drive remains — before any AI work (tickets 10–12) starts.

**Blocked by:** None (can start immediately). Tickets 10–12 should start only after this lands.

**Status:** ready-for-agent

## Course model: series with an optional single book

- [ ] A course is a lesson series in one topic; it may carry exactly one book or no book at all. A series spanning several books is created as a bookless (general) series.
- [ ] Course creation shows a name field plus a kind toggle (book-based vs general); the book-name field appears only when book-based is chosen, and the frontend blocks saving a book-based course with an empty book name.
- [ ] Kind is fixed at creation and derived from whether a book name was stored — no separate stored kind. A book-based course can never lose its book name; a general course can never gain one (frontend prevents it, backend rejects it).
- [ ] In a general course the pages-range inputs never appear in the lesson form and no pages line is shown anywhere; stored pages on old lessons are kept but hidden. In a book-based course the pages inputs stay optional per lesson and never feel mandatory, and hiding follows the same rule when empty.
- [ ] Lesson creation/edit forms gain an optional description field (new nullable column via the normal migration flow); the existing course description (already stored) is exposed in the course create/edit forms.
- [ ] Glossary and spec updated so Course is never again defined as "one book"; exam, enrollment, and chat contracts that assumed a book still read correctly.

## Attachments: course-level PDFs, images for lessons, main-book designation

- [ ] Courses gain attachments (PDF only), uploaded after course creation through the same direct-to-storage confirm pattern as lesson audio/handouts; writers upload, approved members download.
- [ ] Lesson attachments additionally accept images (png/jpeg/webp) alongside PDF; the PDF-only rule stays for course attachments.
- [ ] Each file is capped at 100MB: instant client-side check before upload plus server-side verification at confirm time, with a friendly message suggesting compression; unsupported formats are rejected with a message naming the supported formats.
- [ ] On a book-based course the teacher may designate exactly one course attachment as the main book; designating a new one silently replaces the old, designating on a general course is rejected, and the main book is clearly badged in the UI.

## Broken teacher flows

- [ ] The codes + queue page renders codes, the pending queue, and the member list again (list responses are wrapped objects, not bare arrays).
- [ ] A course writer (owner-teacher/admin) can open an attempt to read essay text for grading; students keep the exact same visibility they have today (no answer leaks through the new path).
- [ ] Manual essay grading is verifiable end to end: write essay answer as a student, read it as the teacher, grade with score + feedback, student sees the result per the exam's publish setting.

## Frontend experience

- [ ] One page = one task: the essay-grading queue is separated from the gradebook view, and codes/queue management is separated from lesson management; no page keeps two unrelated jobs.
- [ ] Theme choice persists across refresh (stored choice wins, otherwise the OS preference on first visit, otherwise light) with no flash of the wrong theme on load.

## Drive removal and docs

- [ ] No user-facing Drive reference anywhere (the admin lesson-creation form stays, renamed to plain lesson creation); no backup-deferral or Drive-sync wording in the spec.
- [ ] The backup ADR is marked superseded (history preserved, not deleted); a small new ADR records the series-with-optional-book model and the attachment rules above.
- [ ] Full suite green on Postgres plus frontend tests and typecheck; behavior tests cover the new rules (kind fixed at creation, main-book replacement and rejection, size/format rejections, writer attempt read, student no-leak).
