# 17: Tactile Andalusian — kitchen interactions on the Andalusian baseline

**What to build:** keep the shipped Andalusian look (ticket 15) exactly as the identity, and give it
physical feel borrowed from the dqnamo kitchen: buttons that press down, a lesson player built like a
cassette (شريط الدرس), press-and-hold for destructive actions, upload targets that pull toward a drag,
save buttons that morph their label without layout shift, and one gold-foil accent reserved for the main
book. One delight per page, never all at once; Arabic-first RTL and both color modes stay correct.

**Blocked by:** 15 (the flat Andalusian components this ticket makes tactile).

**Status:** ready-for-agent

> Implemented 2026-10-15 (uncommitted): foundation by lead, patterns A–E via parallel
> subagents, Arabic strings centralized in `i18n.ts`. Verified: frontend 95/95 vitest +
> `tsc` clean; backend 147/147 on Postgres `majlis_test`. No schema/API changes.

## Must read before implementation (in this order)

1. `design-system/majlis/MASTER.md` — tokens, mode-aware fills (never white-on-gold), motifs, checklist
2. `design-system/majlis/preview.html` — behavior reference (toggle ليلي/نهاري, verify both modes)
3. `CONTEXT.md` — Lesson = one recording session (V1 audio only); Attachment rules (lesson PDF/images,
   course PDF-only, one main book per book-based course, 100MB cap); rejected vs blocked; role is
   capability, enrollment gates never check `role == "student"`
4. https://www.dqnamo.com/kitchen — the full experiment index (interaction language reference)
5. https://www.dqnamo.com/experiments/tactile-button — face + edge + depth, compressible press
6. https://www.dqnamo.com/experiments/dynamic-button — label morph without layout shift
7. https://www.dqnamo.com/experiments/hold-to-confirm — fill-while-held, rollback on release, timed undo
8. https://www.dqnamo.com/experiments/magnetic-drop-zone — target pulls toward incoming drag
9. https://www.dqnamo.com/experiments/cassette-player — reels, Side A, elapsed/total time
10. https://www.dqnamo.com/experiments/receipt-printer — staged physical feedback (reference for polish)
11. https://www.dqnamo.com/experiments/ticket — perforation + subtle tilt (reference for join-code card)
12. https://www.dqnamo.com/experiments/iridescent-foil — adapt as gold-only foil, one surface only

## Scope (build in this order; each item demoable on its own)

- [x] Foundation: tactile depth tokens (face/edge/ink) derived from the existing primary/secondary in both
  modes, one spring easing shared by all six patterns, `prefers-reduced-motion` fully static, visible focus
  kept, contrast ≥ 4.5:1 verified with the theme toggle. No production-page change yet; prove it in the
  preview harness.
- [x] Tactile button: every primary/secondary CTA (signup, login, play, exam submit) presses down and
  springs back; light face turquoise with dark-ink edge, dark face gold with dark text; keyboard-operable;
  demo on the home CTAs.
- [x] Dynamic label button: save/upload buttons morph their label (save → saving → done) with no layout
  shift; existing toast behavior unchanged; demo on a lesson/course save form.
  (Delivered on: lesson-info save, lesson-create save, lesson-attachment upload, course-attachment
  upload — all with success-only done flash. Teach audio upload keeps its determinate progressbar,
  which already communicates progress better than a morph.)
- [x] Hold-to-confirm: deleting a lesson, revoking a join code, and per-course block require press-and-hold
  with rollback on early release plus a timed undo; replaces the instant confirm on one real management
  screen; demo end to end as a teacher.
  (Delivered globally: all 5 ConfirmDialog screens, per user decision. The timed notice is honestly a
  dismiss/confirm — destructive API deletes are irreversible — labelled إغلاق, never تراجع.)
- [x] Magnetic drop zone: lesson-attachment and course-book upload targets pull toward an incoming drag
  before landing (idle sand-dashed → gold glow on approach), with an accessible file-picker fallback and the
  existing format/size rejections intact; demo by uploading one real attachment.
  (Also applied to the lesson-audio upload target for consistency; validation rules untouched.)
- [x] Cassette lesson player (شريط الدرس): the lesson-page player gains a tactile cassette shell in surface
  color with a thin gold frame, star-form reels turning while playing, Side-A + lesson title + pages range
  (book-based courses only), `mm:ss` ltr progress, silent re-fetch of expiring URLs, terracotta retry card
  on failure; demo by playing one real lesson.
- [x] Gold foil (last): exactly one surface — the designated main-book cover — gains a subtle gold-only
  sheen reacting to pointer/scroll; no rainbow coloring anywhere; demo on a book-based course in both modes.
  (Delivered on the الكتاب الأساسي designation badge — there is no book-cover art surface; pointer +
  ±6% scroll drift, gold-only, static under reduced-motion.)

## Out of scope

New pages, new API routes, schema changes, chat/vault backends (tickets 10–12), receipt-printer and ticket
patterns beyond reference, video (V2). Never commit without explicit instruction.
