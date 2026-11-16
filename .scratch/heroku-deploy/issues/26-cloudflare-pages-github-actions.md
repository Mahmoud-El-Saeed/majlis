# 26: Cloudflare Pages + GitHub Actions

**What to build:** the SPA served from Cloudflare Pages at `https://majlis.elsaeed.dev`, rebuilt and published automatically on every push to `main`, calling the production API at `https://api.majlis.elsaeed.dev`. No preview deployments: `main` is the only environment.

**Blocked by:** 25 Heroku API target

**Status:** ready-for-agent

- [ ] `https://majlis.elsaeed.dev` loads the Arabic home page over a valid certificate
- [ ] Client-side routes survive a hard refresh (SPA fallback), and unknown paths render the app rather than a Pages 404
- [ ] Content-hashed assets are cached immutably while `index.html` is never cached
- [ ] Security headers and the SPA CSP match the policy the compose proxy enforces; HSTS is enabled at the zone
- [ ] `VITE_API_URL` points at the production API, and login works from both the custom domain and the pages.dev alias
- [ ] A push to `main` publishes a new deployment within a few minutes with no manual step
- [ ] A failed build leaves the previous deployment live and the workflow fails visibly
- [ ] The workflow needs only `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
