# 13: Hardening + ship

**What to build:** production readiness and the final end-to-end proof — deploy, mail, limits, restore docs.

**Blocked by:** 06 Student lesson experience, 09 Grading + gradebook, 12 Chat UI.

**Status:** ready-for-agent

- [ ] Frontend deployed to Cloudflare Pages; API on VPS with TLS
- [ ] Production SMTP provider configured (dev Mailpit from ticket 01 is replaced, not removed)
- [ ] Rate-limits verified on signup/login/join-code/chat paths
- [ ] Manual restore runbook documented (the backup schedule itself already shipped in ticket 05)
- [ ] Full E2E smoke passes: signup → join → approve → listen → exam → grade → chat
