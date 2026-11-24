# ADR-0014: Database backups via Heroku PGBackups

Status: accepted

## Context

Ticket 25 moved production metadata, transcripts and the key vault to Heroku
Postgres `essential-0` (ADR-0012). Ticket 27 requires an operable production
database: a seeded admin, a daily backup schedule, a rehearsed restore and
written operator commands. ADR-0005 covers **media** backups and explicitly
defers them; it does not decide anything about the database. The database is
small (8.68 MB at the time of this decision) but holds the only copy of
accounts, enrollment, exams, grades and API keys.

Heroku PGBackups is included with every essential-tier database: a manual
capture is stored as a logical `pg_dump` archive, and a daily schedule can be
attached to a database config var. Essential-0 retains 5 manual backups and 7
daily + 1 weekly scheduled backups. Backups are stored in the US regardless of
the database's eu region, and there are no failure notifications for scheduled
captures.

## Decision

- **Daily logical backups through PGBackups.** `heroku pg:backups:schedule
  DATABASE_URL --at "02:00 Africa/Cairo"` is the production schedule, with an
  additional manual capture before risky migrations. The operator checks
  `heroku pg:backups` periodically because Heroku does not alert on failures.
- **Restore into a scratch database, never over the live one.** Provision an
  empty temporary Postgres add-on, `pg:backups:restore` into it, compare row
  counts and the Alembic head with the source at capture time, then delete the
  scratch add-on. Production recovery uses the same pattern with `pg:promote`
  and a fresh backup schedule on the promoted database.
- **No off-site copy in V1.** The backups live with the add-on; a deprovisioned
  app or add-on loses them after Heroku's grace period. Before destroying the
  database, download a backup (`pg:backups:download`) and keep it outside
  Heroku. Recording backups to R2 on a schedule is future work, not part of
  ticket 27.
- **The runbook is the authority for the commands.** `docs/ops/runbook.md`
  records bootstrap, backup, restore, rotation and scaling commands; ticket 29
  will add deploy and rollback to the same file.

## Consequences

- Recovery is bounded by PGBackups' retention: up to 7 daily points and one
  weekly point, plus the last 5 manual captures. A destructive change
  discovered a week later cannot be undone from these backups; an off-site
  copy would extend that window.
- A backup is kept in Heroku's US storage, separate from the eu database —
  this may matter for data-residency assumptions, but the project has no
  residency requirement in V1.
- PGBackups is intended for databases up to about 20 GB. Growth beyond that
  needs a different backup mechanism (physical backups or a direct
  `pg_dump` pipeline).
- A schedule is tied to its database attachment. Plan changes, attachment
  swaps, restores and promotes can drop it; re-create and verify it after any
  of those operations.
- The admin seed is independent of backups: a restored database already
  containing the admin is left untouched, and one without it is seeded on the
  next web boot when `ADMIN_*` is configured.
- Media files in R2 remain a single copy in V1 per ADR-0005 and ADR-0004; this
  decision protects only Postgres.
