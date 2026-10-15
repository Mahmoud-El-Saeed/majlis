# ADR-0008: Course as a series with an optional single book; attachment rules

Status: accepted (ticket 16)

## Context

Courses were modeled as "one book explained start to end", but the sheikh also runs topical series with no book, and even book-based series have lessons (intros, Q&A) with no pages. The kind is therefore derived from whether a book name was stored — no separate kind column, so the toggle can never contradict the data.

## Decision

- At most one book per course; multi-book series are created as general (bookless) courses. Kind is fixed at creation: a book-based course can never lose its book name, a general course can never gain one.
- Pages range is optional per lesson and hidden entirely for general courses.
- Attachments reuse the Seam 3 presigned pattern: course attachments PDF-only, lesson attachments PDF or images (png/jpeg/webp). Each file capped at 100MB (client pre-check plus server verify at confirm).
- One course attachment on a book-based course may be designated the main book; designating a new one silently replaces the old; designating on a general course is rejected.

## Considered options

- Stored kind column: rejected — second source of truth that can contradict `book_title`, with no divergent case to justify it.
- Multiple books per course: rejected — premature; general series cover the need.
- Total-size cap per course: rejected — per-file cap matches the audio precedent (R2 budget is the cap).

## Consequences

- Writers, not students, carry the kind invariant; students only ever observe its effects (hidden pages, main-book badge).
- Supersedes ADR-0005's world-view: Drive is fully out (see the superseded note there).
