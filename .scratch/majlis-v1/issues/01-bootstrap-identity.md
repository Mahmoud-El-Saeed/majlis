# 01: Bootstrap + Identity vertical

**What to build:** the foundation every other ticket stands on — a running stack where a student can sign up, verify email, log in, and fetch their profile, with Arabic RTL auth UI.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Compose brings up api + postgres + qdrant + redis + reverse-proxy plus Mailpit as dev SMTP; healthcheck passes
- [ ] Student signup → verification email (visible in Mailpit) → activation → login/refresh → me works end to end
- [ ] Password reset via email works through Mailpit
- [ ] Rate-limiting enforced on signup/login/reset endpoints
- [ ] Production SMTP is explicitly NOT here — it lands in ticket 13
- [ ] Seam behavior tests cover gates (unverified cannot log in, expired token rejected)
