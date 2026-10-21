# 24: Shell, auth, and media polish

**What to build:** The public shell works at phone widths, reflects whether the user is signed in, and the auth forms behave the way users expect. Listening to a long lesson survives reloads and offers basic navigation. Hidden routes either get an entry point or are removed until their feature ships.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] At 320px and 390px the anonymous navbar shows "تسجيل الدخول" and "حساب جديد" on one line each; the authenticated menu does not repeat "حسابي" already visible in the bar.
- [ ] Landing-page auth CTAs adapt to auth state; signed-in users are not prompted to sign up or log in.
- [ ] Login, signup, and reset fields expose appropriate autocomplete attributes; login/signup/reset offer a show-password control; search inputs show placeholders.
- [ ] Per-course chat gets a link from the course page or is removed until built; the admin vault is linked from admin. The decision is noted in the ticket comment.
- [ ] The audio player restores the last position per lesson (clamped to duration), offers ±10-second skips and at least 0.75×–2× speed, and keeps volume persistence and reduced-motion behaviour.
- [ ] Tests cover auth-field attributes, position restore/clamp, skip, and speed; Playwright checks 320/390px navigation and reload-resume on a real lesson.
