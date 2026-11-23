# ADR-0012: Production API on Heroku's container stack

Status: accepted

## Context

Ticket 25 moves the production API from "a compose stack on a VPS" to
Heroku at `https://api.majlis.elsaeed.dev`, while keeping the compose stack
as the local/production-parity unit. Heroku supplies managed Postgres and
Key-Value Store (Redis), terminates TLS itself, and routes through its own
HTTP router. That changes four things the app cannot ignore: how migrations
run, where the client address comes from, how the database and Redis are
reached over TLS, and how idle connections behave under the router.

The repo is a monorepo (`backend/`, `frontend/`, `infra/`), and Heroku's
build context is fixed to the directory containing the Dockerfile.

## Decision

- **Container stack + `heroku.yml`.** `build.docker.web` is
  `backend/Dockerfile`; Heroku therefore builds from `backend/` exactly as
  compose does, with no monorepo buildpack. The image installs from
  `uv.lock` with `uv sync --no-dev --locked` and puts `.venv/bin` on
  `PATH`, so release/run commands are the real binaries rather than
  runtime `uv run` syncs.
- **Migrations in the release phase.** `release.command` is
  `alembic upgrade head`. Heroku runs it in a fresh dyno from the built
  image; a non-zero exit fails the release and the previous version keeps
  serving. The dyno is not started on a stale schema.
- **Keep-alive above the router's idle timeout.** Heroku Router 2.0 closes
  idle router-to-dyno connections at 90 s. `run.web` runs uvicorn with
  `--timeout-keep-alive 95` so every close is initiated by the router, plus
  `--timeout-graceful-shutdown 20`. A lower server timeout races the router
  and produces H13/H18. (The separate 55 s figure is the rolling window for
  data on an in-flight response, not connection idling.)
- **Database TLS is spelled per driver.** Heroku hands out `postgres://`
  with `sslmode=require`. SQLAlchemy forwards query params to
  `asyncpg.connect`, which only knows `ssl=`, while psycopg/Alembic only
  know `sslmode=`. `Settings.database_url()` and
  `Settings.sync_database_url()` translate both ways; `DATABASE_SSL_REQUIRED`
  forces TLS when the URL is silent.
- **Connection budget.** Essential-0 allows 20 connections. The app pool is
  `DB_POOL_SIZE=4` + `DB_MAX_OVERFLOW=2`, with `pool_pre_ping` and
  `pool_recycle`, leaving room for the release dyno and `heroku run`.
- **Redis over TLS with an intentional trust decision.** Heroku Key-Value
  Store uses `rediss://` with a self-signed certificate. Production sets
  `REDIS_SSL_CERT_REQS=none`; the default stays `required` everywhere else.
  Clients use 0.5 s connect/read timeouts so an unreachable store falls
  back to the limiter's in-memory window instead of hanging a login.
- **CORS is a list.** `FRONTEND_URL` is always allowed; `CORS_ORIGINS`
  adds comma-separated origins (the Pages alias). Trailing slashes are
  normalised and duplicates dropped.
- **Client address mode is explicit.** Production sets
  `RATE_LIMIT_CLIENT_IP_SOURCE=xff_rightmost` (ADR-0011 amendment); compose
  sets `xff_trusted_walk`. The router appends the client address to the
  right of any supplied header, so the last entry is the unforgeable one.
- **No `--proxy-headers`.** Nothing in the app trusts forwarded scheme or
  authority; TLS terminates at Heroku and the API only needs the right
  client address, which the limiter derives itself.
- **ACM for the custom domain.** `api.majlis.elsaeed.dev` is a DNS-only
  (grey-cloud) CNAME to the Heroku DNS target. Orange-clouding it would
  both break Heroku's certificate issuance and insert a CDN hop that
  ADR-0011's `xff_rightmost` mode does not model.

## Consequences

- A failing migration blocks the release rather than booting the new code
  against an old schema.
- Heroku's base image is not patched automatically on the container stack:
  rebuilds are driven by repo pushes (or a deliberate rebuild). That is the
  accepted cost of reusing the compose Dockerfile verbatim.
- `ADMIN_*`, SMTP and backup configuration are deliberately not part of
  this decision; tickets 27 and 28 own them. Signup will fail until 28
  lands a production mail transport.
- The compose stack never needs a new required environment variable: every
  new setting has a dev-safe default.

## Deployment configuration

The non-secret config vars this decision requires (set on the app; values
that are secrets are generated or supplied out of band):

| Variable | Value |
| --- | --- |
| `APP_ENV` | `prod` |
| `FRONTEND_URL` | `https://majlis.elsaeed.dev` |
| `CORS_ORIGINS` | `https://majlis-elsaeed.pages.dev` |
| `RATE_LIMIT_CLIENT_IP_SOURCE` | `xff_rightmost` |
| `DATABASE_SSL_REQUIRED` | `1` |
| `REDIS_SSL_CERT_REQS` | `none` |
| `S3_ENDPOINT_URL` | `https://<account-id>.r2.cloudflarestorage.com` |
| `S3_REGION` | `auto` |
| `S3_BUCKET` | `majlis` |
| `SECRET_KEY` | generated on the app, never committed |

`DATABASE_URL` and `REDIS_URL` are attached by Heroku Postgres and the
Key-Value Store. `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` are the R2 token
secrets and are set by the operator, not in the repo. `ADMIN_*` and
`SMTP_*` stay unset until tickets 27 and 28.

### R2 bucket CORS policy

The `majlis` bucket (one bucket for dev and production, as the app's
`S3_BUCKET` default) must accept browser presigned PUT/GET/HEAD from the
production origins. The rule applied to the bucket (Cloudflare API /
dashboard) is:

```json
[
  {
    "AllowedOrigins": [
      "https://majlis.elsaeed.dev",
      "https://majlis-elsaeed.pages.dev",
      "http://localhost:5173",
      "http://localhost:8080"
    ],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["Content-Type", "Content-Length", "Range"],
    "ExposeHeaders": ["ETag", "Accept-Ranges", "Content-Range", "Content-Length"],
    "MaxAgeSeconds": 3600
  }
]
```


