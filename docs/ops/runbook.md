# Production operator runbook

Scope: Heroku app `majlis-elsaeed-api` (eu, container stack), Heroku Postgres
`postgresql-fluffy-87504` (`DATABASE_URL`, essential-0), Heroku Key-Value Store
(`REDIS_URL`, mini), R2 bucket `majlis`, and the SPA at
`https://majlis.elsaeed.dev` (Cloudflare Pages, ADR-0013). Deploy and rollback
steps are ticket 29's section; this file covers bootstrap, backups, restore,
rotation and scaling (ticket 27).

Never commit secrets or database dumps. All commands below are run by an
operator with Heroku access to the app. Use `-a majlis-elsaeed-api` on every
Heroku command (shown once below, omitted later).

## 1. Access and configuration

```bash
heroku login
heroku ps -a majlis-elsaeed-api
heroku config -a majlis-elsaeed-api --json | jq -r 'keys[]'   # names only
heroku config:get ADMIN_EMAIL -a majlis-elsaeed-api            # value, deliberately
heroku logs --tail -a majlis-elsaeed-api
```

Config vars: `APP_ENV=prod`, `FRONTEND_URL`, `CORS_ORIGINS`,
`RATE_LIMIT_CLIENT_IP_SOURCE=xff_rightmost`, `DATABASE_SSL_REQUIRED=1`,
`REDIS_SSL_CERT_REQS=none`, `S3_*`, `SECRET_KEY`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD`, and (ticket 28) `SMTP_*`. `DATABASE_URL` and `REDIS_URL` are
attached by Heroku. Config changes restart the web dyno; a release command
(`alembic upgrade head`) runs first, and a failing release keeps the previous
version live.

## 2. First admin (bootstrap)

The only admin creation path is the seed in `backend/app/services/admin_seed.py`,
called from `main.py`'s lifespan on **every web dyno boot**. Public signup can
never create an admin or teacher. Setting the two config vars is the whole
bootstrap; the config change restarts the dyno and the seed runs.

```bash
# Source from the gitignored local env (or an operator's password manager).
admin_email=$(sed -n 's/^ADMIN_EMAIL=//p' backend/.env | head -1)
admin_password=$(sed -n 's/^ADMIN_PASSWORD=//p' backend/.env | head -1)
heroku config:set ADMIN_EMAIL="$admin_email" ADMIN_PASSWORD="$admin_password" -a majlis-elsaeed-api
unset admin_email admin_password
```

What the seed does: validates the email, looks up that address, and inserts one
`User` with `role=admin`, `is_verified=true`, `is_active=true` and an Argon2
hash of `ADMIN_PASSWORD` — only the hash is stored. If the row already exists
it returns it untouched. Missing or empty config is a no-op; an invalid email
fails boot loudly.

Verify (no password or token in the output):

```bash
cat <<'PY' | heroku run --no-tty -- python -
import asyncio, os
from sqlalchemy import text
from app.core.database import AsyncSessionLocal
async def main():
    async with AsyncSessionLocal() as db:
        print((await db.execute(
            text("select email, role::text, is_verified, md5(hashed_password) "
                 "from users where email = :email"),
            {"email": os.environ["ADMIN_EMAIL"].lower()},
        )).one())     # one row: a duplicate would raise here
asyncio.run(main())
PY

admin_email=$(heroku config:get ADMIN_EMAIL)
admin_password=$(heroku config:get ADMIN_PASSWORD)
body=$(jq -n --arg e "$admin_email" --arg p "$admin_password" '{email:$e,password:$p}')
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://api.majlis.elsaeed.dev/api/v1/auth/login \
  -H 'Content-Type: application/json' --data "$body"     # 200
unset admin_password body
```

`heroku restart` then re-runs the seed: the user count and the hash fingerprint
must stay the same. Changing `ADMIN_PASSWORD` in config alone does **not**
reset an existing admin's password (that is the idempotency contract). To
actually rotate it, set the new value and apply it once:

```bash
heroku config:set ADMIN_PASSWORD='<new-secret>'
cat <<'PY' | heroku run --no-tty -- python -
import asyncio, os
from sqlalchemy import select
from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.user import User
async def main():
    s = get_settings()
    email = s.ADMIN_EMAIL.lower()
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.email == email))).scalar_one()
        user.hashed_password = get_password_hash(s.ADMIN_PASSWORD)
        await db.commit()
        print("rotated:", user.email, user.role)
asyncio.run(main())
PY
```

Verify the old password now 401s and the new one 200s. A password change does
**not** revoke existing JWTs; if the credential was compromised, rotate
`SECRET_KEY` too (section 5).

Caveats: if an account with `ADMIN_EMAIL` already exists (e.g. a public
sign-up), the seed no-ops and does not promote it — check its role explicitly.
Changing `ADMIN_EMAIL` later creates a **second** admin on the next boot; the
old one remains. With `web=0` no boot occurs, so no seed runs.

## 3. Backups

Daily logical backups use Heroku PGBackups (ADR-0014), scheduled against the
`DATABASE_URL` attachment. Essential-0 retains 7 daily + 1 weekly scheduled
backup and 5 manual backups; backups live with the add-on (in the US, not in
the EU region) and disappear after it is deprovisioned. PGBackups is for
databases up to ~20 GB. **Heroku does not notify on scheduled backup
failures** — check the list periodically.

```bash
heroku pg:backups:schedule DATABASE_URL --at "02:00 Africa/Cairo"
heroku pg:backups:schedules                 # DATABASE_URL: daily at 2:00 Africa/Cairo
heroku pg:backups                           # IDs, status, size
heroku pg:backups:info b001
heroku pg:backups:download b001 -o /tmp/opencode/b001.dump
```

Capture before risky migrations. To compare a restore against the source
*at capture time* (not at drill time), take the counts in the same quiet
window — maintenance mode prevents writes between the dump and the count:

```bash
count_tables() {  # $1 = config var to read instead of DATABASE_URL, or empty
  local override="$1"
  local cmd="COUNT_TARGET=${override} python -"
  cat <<'PY' | heroku run --no-tty -- sh -c "$cmd" | jq -c .
import os
target = os.environ.get("COUNT_TARGET")
if target:
    os.environ["DATABASE_URL"] = os.environ[target]
os.environ["DATABASE_SSL_REQUIRED"] = "1"
import asyncio, json
from sqlalchemy import text
from app.core.database import AsyncSessionLocal
async def main():
    async with AsyncSessionLocal() as db:
        tables = (await db.execute(text(
            "select schemaname, tablename from pg_tables "
            "where schemaname='public' order by tablename"
        ))).all()
        counts = {}
        for schema, table in tables:
            counts[table] = await db.scalar(text(f'select count(*) from "{schema}"."{table}"'))
        print(json.dumps(counts, sort_keys=True))
asyncio.run(main())
PY
}

heroku maintenance:on
heroku pg:backups:capture --wait-interval 5
count_tables "" > /tmp/opencode/source-counts.json
heroku maintenance:off
```

A schedule belongs to a database attachment: it is lost on a plan-tier change,
a swap, or a promote. After any of those, re-run `pg:backups:schedule` and
confirm with `pg:backups:schedules`.

## 4. Restore

### Rehearsal into a scratch database

Do not restore over the live database. Create a disposable database on the same
app, restore a backup into it, compare row counts with the source at capture
time, then delete it:

```bash
heroku addons:create heroku-postgresql:essential-0 --as RESTORE
# wait for State: available
heroku pg:backups:restore b001 RESTORE_URL --confirm majlis-elsaeed-api
```

Count every public table in the restored database with the same function and
compare it with the counts saved at capture time (§3):

```bash
count_tables RESTORE_URL > /tmp/opencode/restore-counts.json
diff <(jq -S . /tmp/opencode/source-counts.json) \
     <(jq -S . /tmp/opencode/restore-counts.json) && echo "ROW COUNTS MATCH"
```

Also check `select version_num from alembic_version` and the admin row
(`email`, `role`, `md5(hashed_password)`) against the source. The same
`count_tables` function is used for both databases; only the config var
changes.
Delete the scratch add-on afterwards and verify the daily schedule still exists:

```bash
heroku addons:destroy postgresql-<scratch-id> --confirm majlis-elsaeed-api
heroku pg:backups:schedules
```

A local Docker scratch is an equivalent drill when an extra add-on is not
wanted: `heroku pg:backups:download b001 -o /tmp/opencode/b001.dump`, then
`docker run --rm -d --name majlis-restore -e POSTGRES_PASSWORD=restore -p 127.0.0.1:55432:5432 postgres:18.6`,
`docker exec majlis-restore createdb -U postgres majlis_restore`,
`docker exec -i majlis-restore pg_restore -U postgres -d majlis_restore --no-owner --no-privileges < /tmp/opencode/b001.dump`.
Delete the dump file afterwards — it contains user data.

### Production recovery (destructive)

1. Put the app in maintenance: `heroku maintenance:on`.
2. Create a new empty Postgres: `heroku addons:create heroku-postgresql:essential-0 --as RESTORE`.
3. Restore into it: `heroku pg:backups:restore bNNN RESTORE_URL --confirm majlis-elsaeed-api`.
4. Verify counts, Alembic head and a login against the restored database.
5. Promote it: `heroku pg:promote RESTORE_URL`; wait for `/health`.
6. Re-create the backup schedule on the promoted `DATABASE_URL` (section 3),
   then `heroku maintenance:off`.
7. Only after verification, destroy the old database — its backups go with it.

Restoring directly over `DATABASE_URL` is possible but destructive and drops
all client connections; prefer the add-on + promote path above.

## 5. Rotation

### `SECRET_KEY` (all signed tokens)

`SECRET_KEY` signs access (15 min), refresh (7 days), verification (24 h),
password-reset (1 h) and teacher-invite (72 h) tokens. There is no dual-key
grace period: rotation invalidates **all** of them immediately. Users are
logged out and must log in again; already-emailed verify/reset/invite links
become unusable and invites must be re-sent. Database-backed state (exam
attempts and saved draft answers, enrollment, grades) is unaffected — a
student logs back in and resumes the same attempt. Rotate at a quiet time,
ideally outside exam windows.

```bash
heroku config:set SECRET_KEY="$(openssl rand -hex 32)"
curl -s -o /dev/null -w '%{http_code}\n' https://api.majlis.elsaeed.dev/health   # 200
# The pre-rotation access token now returns 401; a fresh login returns 200.
```

### Mail credential (ticket 28)

Ticket 28 adds the production SMTP credential; until it lands, there is no
production mail secret to rotate. The procedure is: create the new provider
credential first, set the app's `SMTP_*` credential config vars (the names
ticket 28 chooses), let the dyno restart, verify with a real password-reset or
invite email, and only then revoke the old provider credential. Creating the
new credential before updating config avoids a send-failure window. Rotation
has **no effect on live sessions** — signatures use `SECRET_KEY`, not the mail
credential — and previously sent links stay valid.

### Admin password

See section 2. Config alone does not change it; apply the one-off hash update.
It does not invalidate sessions — rotate `SECRET_KEY` as well for a compromise.

## 6. Scaling and maintenance

```bash
heroku ps:scale web=1                 # 0 stops the API (and the boot seed)
heroku ps:resize web=basic            # current production size
heroku maintenance:on / heroku maintenance:off
heroku ps -a majlis-elsaeed-api
```

Each dyno opens a pool of 4 + 2 overflow connections; essential-0 caps the
database at 20, including the release and one-off dynos. Scaling to multiple
web dynos multiplies that budget — check with `heroku pg:info` before doing
so. Migrations run once in the release phase, not in web dynos.

## 7. One-off command cheat sheet

| Task | Command |
| --- | --- |
| Seed admin | `heroku config:set ADMIN_EMAIL=… ADMIN_PASSWORD=…` (restart; creates only if absent) |
| Rotate admin password | `heroku config:set ADMIN_PASSWORD=…` + the hash-update heredoc in §2 |
| Rotate session keys | `heroku config:set SECRET_KEY="$(openssl rand -hex 32)"` |
| Capture backup | `heroku pg:backups:capture` |
| Check backups | `heroku pg:backups` / `heroku pg:backups:schedules` |
| Restore drill | `heroku pg:backups:restore bNNN RESTORE_URL --confirm majlis-elsaeed-api` |
| Scale / freeze | `heroku ps:scale web=1` / `heroku maintenance:on` |

## 8. Drill log

_2026-11-24, ticket 27:_

- Admin seeded from the operator's gitignored `.env`: one row, role `admin`,
  verified; login → 200 and `/auth/me` → `admin`. After `heroku restart` the
  row count and the admin hash fingerprint were unchanged and login → 200.
- Schedule `DATABASE_URL: daily at 2:00 Africa/Cairo`; manual backup `b001`
  Completed (43.04 KB from an 8.68 MB database). Source counts were taken in
  the same maintenance window as the capture.
- Restore into a scratch `essential-0` add-on from `b001`: all 14 public table
  counts matched (`users=1`, `alembic_version=1`, the rest `0`), as did the
  Alembic head `b6419a8ca65a` and the admin's hash fingerprint. The scratch
  add-on was destroyed; the schedule and `b001` remained.
- `SECRET_KEY` rotated: the pre-rotation access token returned 401 with the new
  key, a fresh login returned 200, and `/health` stayed 200.
- Mail credential rotation is documented in §5; ticket 28 confirms the final
  `SMTP_*` names. Media backups remain out of scope (ADR-0005).
