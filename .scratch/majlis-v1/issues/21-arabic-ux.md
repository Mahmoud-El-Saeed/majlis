# 21: Arabic UX — complete error copy and scoped language direction

**What to build:** Arabic users never see a retry-sounding generic message for a deterministic failure, and the English account-page pilot cannot break the rest of the app. Every backend detail reachable from the UI gets specific Arabic copy; choosing English affects only the account page's direction, while all Arabic-only pages stay RTL and intact across reloads.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [x] Invalid/expired/revoked/exhausted join code, attempts limit, attempt already in progress/submitted, invite expired/used/revoked, exam closed/not opened, and duplicate/blank form input each show specific Arabic copy.
- [x] A test enumerates every service-raised detail used by the UI and asserts a mapping or an explicit pass-through decision.
- [x] The generic fallback no longer tells the user to retry when retrying cannot help.
- [x] Choosing English on the account page does not flip direction or layout on dashboard, course, lesson, exam, or teacher pages; the account page renders LTR in English and RTL in Arabic.
- [x] The language choice persists across reload with no direction flash; switching back restores RTL everywhere.
- [x] Playwright covers invalid join, active-attempt conflict, attempts limit, and the language switch at desktop and 390px; a unit test pins the direction scope.
- [x] If English is instead hidden until full translation, the stored English preference can no longer affect existing pages.

## Comments

Implemented 2026-10-21 in commit `ab8612e` (plus a review-fix commit).

The error copy now comes from one contract file, `frontend/src/i18n/details.json`: 105 entries — the 91 details a service, the session gate, the rate limiter or the approval table can raise, the 422 messages the request schemas can produce, and the framework's own messages — each with its own Arabic, or, for the two developer-only messages that cannot reach a user, a deliberate pass-through with a reason.

`backend/tests/test_error_details_contract.py` AST-scans the backend source and fails when a detail has no entry, so a new error can never ship untranslated; it also derives the 422 messages from the schemas (Pydantic's wording is generated, not hard-coded) and fails when an error builds its message at runtime. `frontend/src/i18n.test.ts` proves every entry resolves to its own message.

The generic fallback is now "تعذّر إتمام الطلب" (no retry advice), the 422 validation list is translated message by message instead of collapsing to "HTTP 422", and the broad `/expired/i` and `/not found/i` patterns that used to answer "Invite link expired." with a 401 prompt are gone.

The language choice is scoped: `<html>` stays Arabic RTL, the account page renders LTR in English and RTL in Arabic, and switching back restores RTL everywhere.

Verified: frontend 25 files / 172 tests + `tsc` + `oxlint` 0 errors; backend 172/172 on Postgres `majlis_test` + `ty` + `ruff` clean on `app`/`tests`; Playwright 11 passed / 1 skipped (the live one needs a local stack).

### Notes

- The English detail and its Arabic live in one file because both packages must read it: the backend test proves coverage, the frontend test proves the mapping. `i18n.ts` keeps the UI's own chrome strings, and a stable entry id (`detailById`) is how the frontend asks for a specific message without re-typing the backend's English.
- A "duplicate" input only has a backend detail when the backend refuses it: duplicate email (`Email already registered.`) is covered; duplicate course and lesson titles are not refused by the backend at all, so there is no detail to translate (adding that rule is a separate change).
- The catalog is ordered by priority — the first entry that matches wins — so a broad pattern must never sit above the specific entries it would shadow.
- The 422 copy is field-agnostic ("الحقل" not "كلمة المرور"), because Pydantic's message carries no field name; the field-specific copy the user sees first is the client-side one the forms already show.
