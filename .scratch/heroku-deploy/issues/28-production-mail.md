# 28: Production mail

**What to build:** real transactional email from `Majlis <no-reply@majlis.elsaeed.dev>` through Resend's SMTP relay, replacing Mailpit in production, so verification, password-reset and teacher-invite links reach real inboxes. Moved out of ticket 13.

**Blocked by:** 26 Cloudflare Pages + GitHub Actions

**Status:** ready-for-agent

- [x] The transport negotiates STARTTLS and authenticates before sending; credentials are never sent in the clear
- [x] Production credentials come from environment configuration, while local development still defaults to Mailpit with no auth
- [ ] A real signup on the live site delivers a verification email, and the link opens the site and activates the account
- [ ] Password-reset and teacher-invite emails arrive from the same verified sender
- [x] Email bodies stay Arabic and subjects stay legible in RTL clients
- [x] Ticket 13 no longer carries the SMTP criterion and points here

## Comments

- **2026-11-25 — implementation (agent):** `app.core.mail.send_email` now opens
  SMTP with `starttls()` before `login()` on 587, or `SMTP_SSL` on 465, using a
  verifying `ssl` context. A credential pair with `SMTP_TLS=none` is refused
  before a socket opens; a half-set pair is rejected by
  `Settings.smtp_credentials()`. Production variables are `SMTP_HOST`,
  `SMTP_PORT`, `SMTP_TLS`, `SMTP_USERNAME`, `SMTP_PASSWORD` and `SMTP_FROM`;
  local/compose keep Mailpit with no auth. All three emails use the same
  `SMTP_FROM`, with Arabic UTF-8/base64 bodies and RFC 2047 subjects. Seven new
  transport tests plus config and reset-failure tests; ADR-0015 records the
  decision. A live `openssl s_client -starttls smtp -connect smtp.resend.com:587`
  probe negotiated TLSv1.3 with `CN=*.resend.com`, `Verification: OK`.
  Criteria 11–12 still need the operator's Resend key and a real inbox check —
  nothing is committed or deployed yet.
