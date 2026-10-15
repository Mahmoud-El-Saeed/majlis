# 19: Player timers + UX, codes repair, lesson-manage redesign (user QA batch)

**What to build:** fix the reported batch with zero behavior regressions: (1) cassette timer/
progress direction coherence; (2) six player UX items + volume; (3) codes revoke diagnosis +
max-uses control + unblock restores pre-block access; (4) lesson-manage: collapsed-by-default
info form, audio file summary, attachment cards with open/replace/delete.

**Blocked by:** 15 (baseline), 17 (tactile patterns), 18 (account patterns reused).

**Status:** ready-for-agent

> Implemented 2026-10-15 (uncommitted): player stream by lead, codes + lesson-manage via
> parallel subagents. Verified: frontend 22 files / 119 tests + `tsc` clean; backend 151/151 on
> Postgres `majlis_test` (incl. migration `acaec1950d18` reversibility); Playwright-verified on the
> real reported lesson (dark + light): timer/slider coherence, single title, one bar, spacing,
> real فتح buttons, volume row. No commits.

## 1. Audio player timers (bug) + UX + volume

- [ ] Direction coherence: elapsed label at bar START, duration at bar END, slider fill grows
  start→end in the same direction. (Suspect: `.audio-progress{direction:ltr}` fill vs RTL label
  order in `AudioPlayer.tsx:121-161`.) Assert the CSS direction contract in tests.
- [ ] Badge/title overlap: breathing room between `LessonBadge` and the lesson `h1` (Course.tsx).
- [ ] Title shown once: keep it in the cassette (Side-A + title + pages), drop the duplicate page `h1`
  OR rephrase — pick one, no duplication.
- [ ] One progress bar: remove the decorative `.cassette-tape` hairline; the range input is the
  single source of progress truth.
- [ ] Arch frame padding made even around the player card.
- [ ] Play button breathing room (gap, not cramped against the time).
- [ ] Attachment "فتح" becomes a real button (tactile/secondary, rounded) — no bare underlined text.
- [ ] Volume: mute toggle + volume slider in the cassette (persist `mj_vol`, reduced-motion safe).

## 2. Codes page repair

- [ ] Revoke diagnosis FIRST (browser repro on a throwaway code): prime suspect is the ticket-17
  hold-to-confirm — a plain click now rolls back and looks "broken". Fix = clearer affordance
  (explicit hold hint/label on the confirm button in this flow), not removing the hold.
- [ ] Max-uses control: backend already accepts `max_uses`/`expires_days` (CodeCreateIn) —
  frontend posts `{}`. Add teacher inputs (uses + days, defaults from server) to the generate form.
- [ ] Unblock restores pre-block access: today `blocked→rejected` forces re-apply. Add
  `status_before_block` (nullable PG enum column, migration per standing rules) set on block,
  restored on unblock (legacy NULL → approved). Update CONTEXT.md enrollment glossary.
  Backend tests on Postgres `majlis_test`; frontend reflects instant access.

## 3. Lesson-manage redesign

- [x] (verified 2026-10-15, second pass) Unblock fix deployment: root cause was a stale
  container (image predated the migration/code). Rebuilt; `status_before_block` live.
  Note: students stuck at rejected from the old code path must rejoin once with a fresh
  code — future block→unblock cycles restore instantly.
- [x] (verified 2026-10-15, second pass) Revoked codes filtered from the teacher list, so
  revoking visibly removes the row (codes.test covers it).
- [x] (verified 2026-10-15, second pass) Cassette echoes the outer arch (concentric
  110px frame) — screenshot-verified on the reported lesson, dark + light.
- [x] (verified 2026-10-15, second pass) Join modal asks for a name only when the account
  has none (else joins as the account name, with an /account pointer).

- [ ] Lesson info form collapsed by default, expandable to edit (chevron + aria-expanded).
- [ ] Audio section post-upload: file summary (status + duration via metadata, replace + delete
  actions) instead of the bare "رفع الصوت / استبدال" toggle. Duration loads lazily, cached.
- [ ] Attachment rows become cards: title + status badge + three explicit buttons
  (open / replace-in-place / delete with existing confirm). No bare underlined actions.

## Out of scope

New pages, chat/vault, video, schema changes beyond `status_before_block`. Never commit
without explicit instruction.

## Two-axis review fixes (2026-10-15, applied after approval)
- Standards: `pages/account.md` override filed for the LTR pilot; `str.*` reads moved to
  render time in ConfirmDialog/DropZone/DynamicButton (module-scope aliases deleted);
  `useHoldToFire` extracted and shared by ConfirmDialog + HoldButton (behavior identical,
  both hold suites green). Skipped: string-union + TACTILE naming smells (idiomatic/honest),
  Account `T` table (pilot needs one bilingual store — full-EN follow-up restructures `i18n`).
- Spec: dead cassette title/pages/head/crown deleted (direction was always less-chrome);
  invite name back to optional (API contract); undo stays dismiss-only by design
  (irreversible deletes); meter-after-confirm-field confirmed as specced;
  `CODE_DEFAULT_*` (50/7) + expires-0 semantics verified against `config.py` + service.
- Ops (no ticket asked, kept + noted): compose `ADMIN_*` passthrough + `FRONTEND_URL`
  overridable — required to run the stack at all (seed + CORS).

## Course page tabs + linked exams (2026-10-15, same ticket, pre-commit)

- [x] Lessons/exams split behind `الدروس (n)` / `الاختبارات (n)` tabs (role=tablist,
  aria-selected, counts); single-column panels.
- [x] Lesson-linked exams (`lesson_id`) surface as `اختبار الدرس` buttons beside استمع
  (book-wide exams stay in the exams tab only). Covered by `course-tabs.test.tsx`.
