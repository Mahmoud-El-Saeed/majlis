# 25: Heroku API target

**What to build:** the production API running on Heroku at `https://api.majlis.elsaeed.dev`, backed by Heroku Postgres and Heroku Key-Value Store, with schema migrations applied on every release, so the Cloudflare Pages frontend can call it. The existing docker-compose stack keeps working untouched.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `GET /health` returns 200 over a valid Heroku ACM certificate for `api.majlis.elsaeed.dev`
- [ ] Every release applies the Alembic migrations; a failing migration blocks the release instead of booting a stale schema
- [ ] The web process binds Heroku's `$PORT` and keeps idle connections alive long enough to avoid H13/H18 errors
- [ ] CORS allows `https://majlis.elsaeed.dev` and `https://majlis-elsaeed.pages.dev`
- [ ] Rate-limit buckets key on the client address Heroku appended, so a forged `X-Forwarded-For` cannot bypass signup/login limits and two clients never share a bucket
- [ ] Redis is reached over TLS (`rediss://`); an unreachable Key-Value Store falls back in memory with a warning instead of blocking login
- [ ] Postgres connects over SSL and stays under Essential-0's 20-connection ceiling with one web dyno plus release/one-off dynos
- [ ] R2 accepts a browser preflight from the Pages origin for presigned PUT/GET/HEAD with the required headers
- [ ] The compose stack still boots locally with no new required environment variables
- [ ] ADR-0011 records Heroku's append semantics; ADR-0010 records the headers the API now emits itself
