# 18: Account page, dark-mode depth, invite + auth hardening

**What to build:** a bilingual (ar/en pilot) account/profile page with display-name editing,
theme + language settings, and hold-to-confirm sign-out; visible tactile depth in dark mode;
invite-accept with no token field, confirm-password, and a colorful strength meter (same on
signup); navbar stripped to navigation only (no email/logout/theme); all auth errors Arabic
(`noValidate` + manual checks, killing English native bubbles).

**Blocked by:** 15 (Andalusian baseline), 17 (tactile patterns reused: HoldButton, DynamicButton).

**Status:** ready-for-agent

> Implemented 2026-10-15 (uncommitted). Verified: frontend 21 files / 111 tests + `tsc` clean;
> backend 148/148 on Postgres `majlis_test` (incl. new PATCH /auth/me test). Playwright-verified:
> dark edges, invite (no token field), account AR/EN + LTR flip, login still green. No commits.

## Scope

- [x] Dark mode: mid-tone tactile edges (`--edge-primary #7a5f16`, `--edge-secondary #0b6b4e`)
  so button depth reads on night blue; text inks untouched (contrast holds). Mirrored in preview.
- [x] `GET /account` (RequireAuth): avatar header (initial + role + verified badges), name edit
  (PATCH /auth/me, name-only, trimmed, blank→422), theme section, language section (ar/en pilot,
  persisted `mj_lang`, pre-paint script, LTR arabesque mirror), red-wash hold-to-sign-out
  (HoldButton + signed-out toast + redirect). Navbar entry + mobile entry.
- [x] Backend `PATCH /auth/me` (UpdateMeIn: trimmed non-blank ≤200; email/role immutable).
- [x] Navbar: removed email, logout (desktop + mobile), theme toggle. Toggle now lives on auth
  cards, landing hero, and account only.
- [x] Invite: token field removed (query-param only; Arabic alert when missing), confirm-password,
  colorful 4-segment meter (terracotta→gold→sage→turquoise) after confirm, mismatch blocks submit,
  autocomplete attrs fixed.
- [x] Signup: same confirm + meter concept.
- [x] Login/signup/verify/reset: `noValidate` + manual Arabic checks (missing/short/mismatch);
  wrong-password already mapped Arabic (verified live); native English bubbles eliminated.

## Out of scope

Full-EN site (account page is the pilot), password change while logged in (no endpoint),
avatar upload. Never commit without explicit instruction.
