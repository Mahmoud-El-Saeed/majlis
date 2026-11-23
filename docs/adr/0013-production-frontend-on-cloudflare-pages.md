# ADR-0013: Production frontend on Cloudflare Pages, published by GitHub Actions

Status: accepted

## Context

Ticket 26 serves the SPA at `https://majlis.elsaeed.dev` while the API stays
on Heroku (ADR-0012). The compose stack remains the local/production-parity
unit and still serves the same build through its own nginx behind the reverse
proxy, so one build now has two serving paths that must not drift. `main` is
the only environment: there are no preview deployments.

Pages offers two ways to publish — Git integration (Cloudflare runs the build)
or Direct Upload (we build, then upload the output). This repo builds with Bun
from `bun.lock`, and the API base is a build-time Vite variable, not a runtime
setting.

## Decision

- **Direct Upload from GitHub Actions, not Git integration.**
  `.github/workflows/pages-deploy.yml` runs on every push to `main` (plus
  `workflow_dispatch`), builds in `frontend/` with Bun 1.4.2 — the same pin as
  `frontend/Dockerfile` and the spec — and publishes `dist/` with
  `wrangler pages deploy --project-name=majlis-elsaeed --branch=main`. There is
  no `pull_request` trigger and no other branch, so no preview deployment is
  ever created. A Direct Upload project cannot later be switched to Git
  integration; that is accepted.
- **The build runs in CI, so `VITE_API_URL` lives in the workflow.**
  `https://api.majlis.elsaeed.dev/api/v1` is baked at build time. A Pages
  project environment variable would have no effect on a Direct Upload
  deployment — it only feeds Cloudflare-run builds — which is where ticket
  25's handoff note pointed.
- **Only two secrets.** `CLOUDFLARE_API_TOKEN` (Account → Cloudflare Pages →
  Edit) and `CLOUDFLARE_ACCOUNT_ID`. The token cannot touch DNS, zone settings
  or R2; those were configured out of band, once.
- **A failed build cannot publish.** Lint, tests and `tsc -b && vite build`
  run before the deploy step, so a red job leaves the previous production
  deployment serving. Pages also keeps the last successful deployment if an
  upload itself fails.
- **One publish at a time.** `concurrency: pages-production` with
  `cancel-in-progress: false`: a deploy is never cancelled mid-upload.
- **`_headers` is the production SPA policy.** `frontend/public/_headers`
  (Vite copies `public/` into `dist/`) stamps ADR-0010's four baseline headers
  and the same SPA CSP, byte for byte, on `/*`. `src/pages-deploy.test.ts`
  reads both files and fails on drift.
- **The cache split mirrors `frontend/nginx.conf`.** `/*` gets
  `Cache-Control: no-cache`, so HTML and the unhashed `theme-init.js`
  revalidate; `/assets/*` detaches that value and sets
  `public, max-age=31536000, immutable`. Order is load-bearing: Pages joins
  repeated header values, and two `max-age` directives conflict (RFC 9111), so
  the narrow rule must follow the broad one and detach first.
- **The zone must respect those headers.** `browser_cache_ttl` on `elsaeed.dev`
  is `0` (Respect Existing Headers). Cloudflare otherwise overrides any origin
  `Cache-Control` shorter than the zone's Browser Cache TTL, so the 4-hour
  default would have rewritten `no-cache` on `index.html` to `max-age=14400`
  and served stale HTML for hours after a deploy.
- **SPA fallback is Pages' default, not a rewrite.** With no top-level
  `404.html`, Pages serves `/` for any path that is not a static asset. We
  deliberately ship no `_redirects`: a `/* /index.html 200` rule is followed
  even when a real asset matches, which would shadow `/assets/*`.
- **The compose container must not serve the control file.**
  `frontend/nginx.conf` returns 404 for `/_headers`; the reverse proxy owns
  the headers on that path.
- **The custom domain is a proxied CNAME.** `majlis.elsaeed.dev` →
  `majlis-elsaeed.pages.dev`, orange-cloud, so the zone's edge settings apply.
  The `pages.dev` alias stays reachable and is already in the API's CORS list
  and the R2 bucket policy (ADR-0012).
- **HSTS at the zone, not in `_headers`.** `security_header` on `elsaeed.dev`:
  `max_age=15552000` (six months), `include_subdomains=true`, `preload=false`,
  plus Always Use HTTPS so the first plain-HTTP visit is upgraded too.
  ADR-0010's reasoning holds — the TLS terminator owns HSTS.
  `include_subdomains` also covers the grey-cloud `api` host in browsers that
  have seen the header; no preload commitment is made.

## Consequences

- Two files describe one policy (`infra/nginx.conf` and
  `frontend/public/_headers`); the contract test is what keeps them honest.
  The workflow has no `paths` filter, so a nginx-only edit still publishes.
- Production topology is Cloudflare Pages (SPA) + Heroku (API) + R2 (media).
  Compose is local parity, not the production target.
- Every push to `main` publishes, including backend-only commits. That is the
  price of "no manual step" and of never letting the two header sources drift.
- The `*.pages.dev` alias serves the same app and is not access-controlled. It
  is an accepted second origin, already allowlisted by the API and R2.
- Zone-wide HSTS with `include_subdomains` means any future subdomain of
  `elsaeed.dev` must be HTTPS-capable for six months after a browser sees the
  header.

## Rejected alternatives

- **Git integration (Cloudflare builds).** Rejected: it creates preview
  deployments for other branches and pull requests, and `main` is the only
  environment. It also moves the Bun build off the pin we control.
- **`_redirects` with `/* /index.html 200`.** Rejected: it shadows real assets;
  the documented SPA default already does the job.
- **A top-level `404.html`.** Rejected: it switches Pages out of SPA rendering,
  so client routes would 404 on a hard refresh.
- **HSTS in `_headers`.** Rejected: it would miss the zone's other hostnames
  and duplicate the edge's authority (ADR-0010).
- **`VITE_API_URL` as a Pages project env var.** Rejected: inert for Direct
  Upload, and it would suggest the value can be changed without a rebuild.

## Deployment configuration

| Item | Value |
| --- | --- |
| Pages project | `majlis-elsaeed` (Direct Upload, production branch `main`) |
| Alias | `https://majlis-elsaeed.pages.dev` |
| Custom domain | `majlis.elsaeed.dev` (proxied CNAME, Google-issued certificate) |
| Workflow | `.github/workflows/pages-deploy.yml` |
| Repository secrets | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |
| Build-time API base | `https://api.majlis.elsaeed.dev/api/v1` |
| Zone HSTS | six months, `includeSubDomains`, no preload |
| Zone Browser Cache TTL | `0` — Respect Existing Headers |
