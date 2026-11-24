# 26: Cloudflare Pages + GitHub Actions

**What to build:** the SPA served from Cloudflare Pages at `https://majlis.elsaeed.dev`, rebuilt and published automatically on every push to `main`, calling the production API at `https://api.majlis.elsaeed.dev`. No preview deployments: `main` is the only environment.

**Blocked by:** 25 Heroku API target

**Status:** ready-for-agent

- [x] `https://majlis.elsaeed.dev` loads the Arabic home page over a valid certificate
- [x] Client-side routes survive a hard refresh (SPA fallback), and unknown paths render the app rather than a Pages 404
- [x] Content-hashed assets are cached immutably while `index.html` is never cached
- [x] Security headers and the SPA CSP match the policy the compose proxy enforces; HSTS is enabled at the zone
- [x] `VITE_API_URL` points at the production API, and login works from both the custom domain and the pages.dev alias
- [x] A push to `main` publishes a new deployment within a few minutes with no manual step
- [x] A failed build leaves the previous deployment live and the workflow fails visibly
- [x] The workflow needs only `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`

## Comments

- **2026-11-23 — delivered (agent):** The SPA is live at `https://majlis.elsaeed.dev`, published by `.github/workflows/pages-deploy.yml` (Direct Upload, `main` only) from commit `9e65973`. Pages project `majlis-elsaeed`, first deployment `ec89a5f6`, Actions run 45165178716 green in **29 s**. Exactly one deployment exists — `production`, branch `main`, no previews.
  - **Headers + CSP:** all five headers are byte-identical to `infra/nginx.conf`'s `location /` block, checked against the live response rather than the file. `Cache-Control`: `/assets/*` → `public, max-age=31536000, immutable`; `/`, `/index.html`, `/theme-init.js` → `no-cache` (zone Browser Cache TTL is `0`, Respect Existing Headers, so the edge does not rewrite it). `/_headers` returns the SPA shell, not the control file.
  - **SPA fallback:** `/login`, `/dashboard`, `/courses/42`, `/teach/courses/7/codes` and a junk path all return `200` with HTML identical to `/`; an unknown path renders the app's own 404. No `404.html`, no `_redirects`.
  - **TLS + HSTS:** Google Trust Services `WE1`, `CN=majlis.elsaeed.dev`, valid to 2027‑02‑21; HTTP/2 + h3 advertised. Zone HSTS `max-age=15552000; includeSubDomains`, no preload, plus Always Use HTTPS.
  - **Login, both origins:** a temporary verified probe user logged in through the browser on `majlis.elsaeed.dev` and on the `pages.dev` alias — `POST /api/v1/auth/login → 200`, `/dashboard` reached, hard refresh keeps the session, zero CSP or beacon errors. Probe user deleted afterwards (`total_users=0`).
  - **Failed build leaves the site up:** probe branch `tmp/pages-failing-build-probe` (commit `b427304`, deliberate `TS2322`) ran run 45168919116: `bun run build` failed, **Publish to Cloudflare Pages skipped**, job red, canonical deployment still `ec89a5f6`, site `200`, same asset hash. Branch deleted.
  - **Two findings worth keeping:** (1) `majlis-elsaeed.pages.dev` resolves to `188.114.96.0/20`, which the operator's ISP blackholes — TCP connects time out while the custom domain's `104.21`/`172.67` addresses work. The alias is healthy at the edge, proven by mapping its hostname onto a reachable Cloudflare IP (same SNI/Host, same project), so its half of the login criterion is edge evidence, not a real client on that network. (2) The zone had Web Analytics auto-provisioned, injecting `static.cloudflareinsights.com/beacon.min.js` into every browser response (browser-UA-dependent, so a plain `curl` check misses it). `script-src 'self'` blocked it and every page load logged a violation; the ruleset is now `enabled: false`. Clearing `auto_install`, pausing and deleting the rule did not stop it — the ruleset flag is the switch.
  - **Quality gates:** **227** frontend tests on 35 files, `tsc -b && vite build` clean (bundle carries the production API base, no `localhost` fallback), lint warnings only. `/code-review` run on both axes; findings fixed: the header test now also fails on an *extra* header (HSTS included), the `dist/_headers` artifact gate and build-before-publish order are pinned, `/_headers` 404 in `frontend/nginx.conf` is pinned, actions are pinned to commit SHAs with a fixed `wranglerVersion`, and ADR‑0013 now names the `connect-src https:` trade-off and stops claiming the alias is reachable everywhere.
  - **Handoffs:** ticket 27 owns `ADMIN_*` seeding and backups (still unset on Heroku), ticket 28 owns SMTP — signup returns 500 until then. Re-enabling Web Analytics means widening the CSP in **both** `infra/nginx.conf` and `frontend/public/_headers`; the contract test forces them together. Zone SSL/TLS minimum version is still 1.0 and was left untouched.
