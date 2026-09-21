# 13: Hardening + ship

**What to build:** production readiness and the final end-to-end proof — deploy, mail, limits, restore docs.

**Blocked by:** 06 Student lesson experience, 09 Grading + gradebook, 12 Chat UI.

**Status:** ready-for-agent

- [ ] Frontend deployed to Cloudflare Pages; API on VPS with TLS
- [ ] Production SMTP provider configured (dev Mailpit from ticket 01 is replaced, not removed)
- [ ] Rate-limits verified on signup/login/join-code/chat paths
- [ ] Backup + restore deferred to post-V1 (no R2→Drive schedule or restore runbook in V1; see ADR-0005)
- [ ] Full E2E smoke passes: signup → join → approve → listen → exam → grade → chat
