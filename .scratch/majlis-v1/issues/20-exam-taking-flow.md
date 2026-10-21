# 20: Exam taking flow — legible intro, resumable attempts, readable history

**What to build:** A student always knows what exam they are about to take, can leave and come back without losing an attempt, and can read their attempt history. The pre-start page shows the student-safe exam summary; reloading or returning mid-exam reopens the same attempt with saved answers and the running timer; the course card offers "متابعة الاختبار" when one is active; "محاولاتي" shows localized statuses and dates, a resume action, and an empty state. Refreshing never consumes another attempt.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

> Implemented 2026-10-20 (uncommitted), then reviewed (`/code-review`, Standards + Spec) and
> all findings fixed: row locks on draft save/submit (no wipe after a grade), expiry keeps the
> saved selection and scores 0, unload flush for the debounced autosave, expiry-aware resume,
> typed `AnswerSelection` payload, `StudentProgress` read model, shared exam test builders,
> split `MyAttempts` page, reversible constraint migration, and e2e assertions moved to the UI
> (plus a live API autosave round-trip in the gated smoke). Verified: frontend 24 files / 157
> tests + `tsc` + `oxlint` 0 errors; backend 168/168 on Postgres `majlis_test` + `ty` + `ruff`
> clean; Playwright 5 passed / 1 skipped; migration `b6419a8ca65a` upgrade → downgrade → upgrade
> proven on a scratch DB (row above 3 nulled on downgrade). No commits.

- [x] The student pre-start page shows title, description, duration, question count, attempts used/limit, and window status; no writer-only request is made and no 403 appears in the console.
- [x] Loading, missing-exam, not-enrolled, and empty-description states are explicit and in Arabic.
- [x] On load, an in-progress attempt is recovered with its questions, saved answers, and timer; the course exam card reads "متابعة الاختبار".
- [x] A second active attempt is never created; if the server reports one, the UI recovers it instead of showing a generic failure.
- [x] "محاولاتي" uses localized dates, labels in-progress as "قيد الأداء", submitted as "تم التسليم", and ungraded/unpublished correctly; it offers resume for in-progress and an empty state with a back link.
- [x] Frontend tests cover intro, recovery, and history; Playwright reloads mid-exam and confirms the same attempt resumes; attempts left are unchanged.
- [x] If a student-safe exam read is needed, it is added with backend tests and leaks neither questions nor answers.
