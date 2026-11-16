# 29: Ship proof and runbook

**What to build:** end-to-end proof that a real user can complete the core journey on `https://majlis.elsaeed.dev`, plus the runbook an operator needs to deploy, roll back and recover.

**Blocked by:** 26 Cloudflare Pages + GitHub Actions, 27 Production bootstrap and backups, 28 Production mail

**Status:** ready-for-agent

- [ ] The full journey passes on the live domain: signup → email verification → login → create a course → upload lesson media → play it back → invite a student → join with a code → take an exam → receive a grade
- [ ] No H12, H13, H15 or H18 errors appear in the Heroku log during the smoke run
- [ ] Uploads and playback go browser-to-R2 directly; no large request or response passes through the dyno
- [ ] `/code-review` findings are fixed or explicitly deferred with a reason
- [ ] The runbook covers deploy, rollback, backup and restore, secret rotation and scaling
