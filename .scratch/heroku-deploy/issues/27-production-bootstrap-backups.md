# 27: Production bootstrap and backups

**What to build:** an operable production database — the admin account seeded from configuration, daily backups scheduled, a restore actually rehearsed, and the operator commands written down.

**Blocked by:** 25 Heroku API target

**Status:** ready-for-agent

- [x] The admin account is seeded idempotently from configuration on boot; restarting does not duplicate it or reset its password
- [x] The admin authenticates against the production API
- [x] A daily backup schedule exists and a completed backup is visible
- [x] A restore into a scratch database succeeds and row counts match the source at backup time
- [x] Rotation of `SECRET_KEY` and the mail credential is documented, including the effect on live sessions
- [x] One-off commands (seed, rotate, restore, scale) are recorded for the next operator

## Comments

- **2026-11-24 — delivered (agent):** Production database is bootstrapped and
  backed up. Admin credentials came from the operator's gitignored
  `backend/.env` (`infra/.env` verified identical; values never printed or
  committed) and were set with `heroku config:set ADMIN_EMAIL ADMIN_PASSWORD`
  on `majlis-elsaeed-api` (release v16). The existing boot-time seed created
  exactly one row (`role=admin`, `is_verified=true`); `POST
  /api/v1/auth/login → 200` and `/auth/me → role: admin`. After `heroku
  restart`, the user count stayed 1 and the admin hash fingerprint stayed
  `1222e99e45dfeb7c2c0f01b1bd75578a`; login still returned 200. The new test
  pins the same invariant in-process. Caveats (existing email no-ops, new
  `ADMIN_EMAIL` creates a second admin, config password changes do not reset
  the row) are in the runbook.
  - **Backups:** `heroku pg:backups:schedule DATABASE_URL --at "02:00 Africa/Cairo"`
    → `pg:backups:schedules` shows `DATABASE_URL: daily at 2:00 Africa/Cairo`.
    Manual `b001` captured under maintenance → `Completed`, 43.04 KB from an
    8.68 MB database; source row counts recorded in the same window.
  - **Restore rehearsal:** created a scratch `essential-0` add-on
    (`postgresql-parallel-92430`, attached as `RESTORE`), restored `b001` with
    `heroku pg:backups:restore`, and compared all 14 public tables against the
    source-at-capture counts: `users=1`, `alembic_version=1`, all other 12 = `0`.
    Alembic head (`b6419a8ca65a`), admin email/role and hash fingerprint also
    matched. Scratch add-on destroyed afterwards; `b001` and the daily schedule
    remain. Heroku's built-in schedule is free on essential-0 (7 daily + 1
    weekly retained); backups live with the add-on in the US — no off-site copy
    in V1, recorded in ADR-0014.
  - **Rotation:** rehearsed `SECRET_KEY` with a fresh 32-byte random value:
    the pre-rotation access token returned 401 afterwards, a fresh login
    returned 200 and `/health` stayed 200. The runbook records the full effect
    (all access/refresh/verify/reset/invite JWTs invalid instantly; DB-backed
    attempts survive). Mail credential rotation is documented generically;
    ticket 28 must confirm the final `SMTP_*` names. Admin-password rotation
    has a documented one-off hash update but was **not** rehearsed, so the
    seeded password remains the one chosen in `.env`.
  - **Docs:** new `docs/ops/runbook.md` (bootstrap, backups, restore drill and
    production promote path, rotation, scaling, one-off cheat sheet, dated drill
    log) and `docs/adr/0014-database-backups-via-heroku-pgbackups.md`; ADR-0012
    amended for `ADMIN_*` and `docs/architecture.md` points at the runbook.
    Ticket 29 will add deploy/rollback sections.
  - **Quality gates:** one test extended (no app-code change), **211** backend
    tests passed on Postgres, `ruff` clean, `ty check app` clean (the repo's
    pre-existing test-file diagnostics are unrelated), `/code-review` run on
    both axes with findings fixed: the ADR contradiction, the duplicated test
    assertions and heredocs, the unscoped hash fingerprint, capture-time count
    recording, and the speculative provider-specific mail text. No commit.
