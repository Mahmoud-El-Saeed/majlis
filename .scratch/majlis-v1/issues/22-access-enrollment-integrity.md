# 22: Access, enrollment & operational integrity

**What to build:** The platform identifies clients correctly behind the proxy, gates every non-approved enrollment with a clear status, lets join requests carry the contact details the API already accepts, and closes the operational findings from the audit: public API docs, missing proxy security headers, an order-dependent backend test, and application lint noise.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [x] Rate limiting keys on the real client behind the reverse proxy; exhausting one client's bucket does not rate-limit another. A test reproduces the current shared-bucket behaviour and proves per-client isolation; the Redis fallback still works.
- [x] Direct course navigation in pending, rejected, or blocked states shows a clear Arabic status page and the correct next step, with no tabs, counts, content, or silent 403s.
- [x] The dashboard hint matches the real status; blocked does not say it is awaiting review.
- [x] The join form collects name when the account has none, plus optional phone and note, for new and existing accounts; the teacher pending queue displays all three.
- [x] The enrollment read returns the course title instead of always null, pinned by a backend test.
- [x] `/docs` and `/openapi.json` are disabled or protected in production, and the reverse proxy sends baseline security headers; both decisions are documented.
- [x] The admin-seed test passes on a virgin `majlis_test` database and the full backend suite is order-independent; lint is clean on application code (generated migrations fixed or explicitly excluded).
- [x] Playwright covers blocked and pending direct navigation and the join form; verification commands are recorded in the ticket comment.

## Comments

Implemented 2026-11-06 (not yet committed — awaiting the commit instruction).

**Rate limiting (item 1).** The limiter (`backend/app/core/rate_limit.py`) previously keyed on `request.client.host` — the TCP peer — so behind the compose nginx every client shared one `rl:<path>:<nginx>` bucket. New `client_key()` walks `X-Forwarded-For` from the right: `RATE_LIMIT_TRUSTED_PROXIES` (Settings, default `0` = today's direct-peer behaviour) rightmost entries are the trusted proxies; the bucket keys on the rightmost entry before them. Compose sets `RATE_LIMIT_TRUSTED_PROXIES=1` (ADR-0011 records the walk, the shorter-chain fallbacks and the rejection of leftmost-trusting / uvicorn-flag approaches). `tests/test_rate_limit.py` (6 tests) reproduces the old shared-bucket behaviour, proves per-client isolation (A exhausting its bucket leaves B's first request alone — inside both the Redis path and the in-memory fallback), proves Redis stays the source of counts with the right key shape, proves the no-header direct-peer fallback, and proves the documented Cloudflare→nginx two-hop chain keys on the visitor, never the shared edge IP.

**Gated course access (items 2–3).** `CoursePage` now early-returns a dedicated status page for `pending`/`rejected`/`blocked` (`components/EnrollmentStatusCard.tsx`): the Arabic badge, a per-status next step and a way back to the dashboard — no tab bar, no counts, no lesson/exam scaffolding. Content queries stay disabled until the membership read permits them, so a gated student issues no content requests at all (no silent 403s). Unknown-course errors render an explicit `role=alert` retry card. The dashboard hints come from the same source (`enrollmentStatusHint`), so blocked says "تم حظرك من هذه السلسلة؛ لا يمكنك إعادة الانضمام إليها." and never the pending "انتظر مراجعة" copy; the old hardcoded "أدخلت رمزًا؟ انتظر مراجعة الشيخ." line is gone.

**Join form + queue (item 4).** `JoinBox` collects optional `phone` (dir="ltr") and `note` beside the existing name-when-account-has-none rule; empty strings are omitted so the backend keeps storing nulls, and the success toast text moved into `i18n.ts`. The backend already accepted all three fields (`JoinIn`) and the teacher pending queue (`CodesQueue.tsx`) already displayed name/phone/note — the backend tests existed for both, so this item needed only the frontend form.

**Enrollment reads carry the course title (item 5).** Every enrollment surface now names its course (previously always `null` outside `/enrollments/mine`): the join response, `GET /courses/{id}/my-enrollment`, the teacher queue and all four decision responses get the title via one batched `course_repository.titles_for()` id→title query; `/enrollments/mine`'s old N+1 collapsed into that same query. Pinned by `test_enrollment_reads_carry_the_course_title` (and the frontend status page uses the title so a gated student still sees which series they belong to).

**Docs & proxy hardening (item 6).** A first `APP_ENV` setting (`"dev"|"prod"`, default dev) disables `/docs`, `/redoc` and `/openapi.json` in `create_app()` when prod (ADR-0009); compose is the production unit and ships `APP_ENV=prod` by default, `tests/test_docs_security.py` pins dev-serves/prod-404 including a live `/health`. `infra/nginx.conf` now sends the five baseline headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`) with `always`, also on `/health`; ADR-0010 records the set, the nginx `add_header` inheritance gotcha the `location /` block has to repeat the headers for, and why HSTS belongs at the Cloudflare TLS edge instead.

**Virgin DB, order-independence, lint (item 7).** Reproduced first: `test_seed_creates_verified_admin_once` failed with `relation "users" does not exist` on a virgin `majlis_test` (the seed file has no `client` fixture to build its schema). The test's `db` fixture now creates the schema before and drops it after, so the file is self-sufficient and leaves the DB as it found it. Added `pytest-randomly` and proved order-independence with three seeds (42, 7, 3131) plus a virgin-DB run at seed 911 — all green (183 tests then; 184 after the review round's added rate-limit test). Ruff now explicitly excludes alembic's generated vault (`alembic/versions`); the maintained `alembic/env.py` was fixed (one import sort) rather than excluded, and `ruff check .` is clean.

**Playwright (item 8).** New `e2e/enrollment-status.spec.ts` (6 tests, mocked API, no live stack needed): direct navigation for pending/rejected/blocked asserts the status card with its badge, hint and dashboard link and asserts `tablist`/`tabpanel`/lesson lists are absent (blocked additionally asserts the pending copy never appears); the dashboard hint test pins blocked-on-dashboard showing the blocked hint, not the review one; two join-form tests capture the POST body for a no-name account (name field shown, so `display_name` + `phone` + `note` all sent) and for an existing-name account (no name field shown, phone/note still sent).

Verified (commands as run):

- backend: `uv run ruff check .` → clean · `uv run ty check app` → clean · `uv run pytest -q` → **184 passed** (Postgres `majlis_test` + real containerized Redis; the pre-review 183-test suite also passed on a virgin `majlis_test` at seed 911 and across seeds 42/7/3131, and the post-review suite passes under pytest-randomly's fresh seed each run)
- frontend: `bun run typecheck` · `bun run lint` (0 errors) · `bun run test` → **27 files / 179 tests** · `bunx playwright test` → **25 passed / 1 skipped** (the skipped one is the documented live flow needing the full local stack)

No new backend error details were introduced, so `frontend/src/i18n/details.json` and the AST contract test are untouched.

### Notes

- `RATE_LIMIT_TRUSTED_PROXIES` is the knob to revisit if the traffic path ever changes: with Cloudflare appending the visitor IP and nginx appending its peer, `1` resolves the true client; without Cloudflare, a client that sends no X-Forwarded-For of its own still resolves to the browser IP directly against nginx (a forging client can rotate its claimed key — ADR-0011 consequences; `N=0` is the conservative escape hatch).
- The successful-join toast copy is now `str.joinToastSuccess` (byte-identical Arabic), so the e2e can assert it without duplicating literals.
- `test_rate_limit.py` intentionally stubs authentication instead of the DB: a limiter-covered POST must answer 401 deterministically, and an endpoint explosion must not be able to mask limiter behaviour.
- The rate-limit isolation fixture flushes the same `rl:*` Redis keys conftest's client fixture does — the earlier ordering flakes came from counts surviving their 60s TTL across full-suite runs.
