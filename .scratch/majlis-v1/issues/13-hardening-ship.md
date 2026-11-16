# 13: Hardening + ship

**What to build:** production readiness and the final end-to-end proof — deploy, limits, restore docs.

**Blocked by:** 06 Student lesson experience, 09 Grading + gradebook, 12 Chat UI.

**Status:** ready-for-agent

- [ ] Frontend deployed to Cloudflare Pages; API on Heroku with TLS (tickets 25–26)
- [ ] Rate-limits verified on signup/login/join-code/chat paths
- [ ] Backup + restore deferred to post-V1 (no R2→Drive schedule or restore runbook in V1; see ADR-0005)
- [ ] Full E2E smoke passes: signup → join → approve → listen → exam → grade → chat

Production SMTP was moved out of this ticket — see ticket 28 (production mail) in `.scratch/heroku-deploy/issues/`. Dev Mailpit stays the local default.
