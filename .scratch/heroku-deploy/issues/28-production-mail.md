# 28: Production mail

**What to build:** real transactional email from `Majlis <no-reply@majlis.elsaeed.dev>` through Resend's SMTP relay, replacing Mailpit in production, so verification, password-reset and teacher-invite links reach real inboxes. Moved out of ticket 13.

**Blocked by:** 26 Cloudflare Pages + GitHub Actions

**Status:** ready-for-agent

- [ ] The transport negotiates STARTTLS and authenticates before sending; credentials are never sent in the clear
- [ ] Production credentials come from environment configuration, while local development still defaults to Mailpit with no auth
- [ ] A real signup on the live site delivers a verification email, and the link opens the site and activates the account
- [ ] Password-reset and teacher-invite emails arrive from the same verified sender
- [ ] Email bodies stay Arabic and subjects stay legible in RTL clients
- [ ] Ticket 13 no longer carries the SMTP criterion and points here
