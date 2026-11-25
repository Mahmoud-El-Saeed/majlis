# ADR-0015: Production mail via Resend's SMTP relay

Status: accepted

## Context

Tickets 02 and 20 built verification, password-reset and teacher-invite emails
around one seam, `app.core.mail.send_email`, backed by Mailpit at
`localhost:1025`. Ticket 25 put the API on Heroku, where there is no Mailpit:
`SMTP_*` was deliberately left unset and public signup returned 502. Ticket 28
requires those three emails to reach real inboxes from
`Majlis <no-reply@majlis.elsaeed.dev>`.

The sending domain `majlis.elsaeed.dev` is already registered in Resend: DKIM
is published at `resend._domainkey.majlis.elsaeed.dev` and the Forge Return-Path
is a DNS-only CNAME `send.majlis.elsaeed.dev → send.forge.rmta.net`. Resend Forge
changes the delivery infrastructure, not the SMTP endpoint or credentials.
There is no DMARC record for the domain at the time of this decision.

## Decision

- **Use Resend's first-party SMTP relay, not its HTTP API.** Host
  `smtp.resend.com`, username `resend`, password = a sending-only Resend API
  key, `SMTP_FROM = Majlis <no-reply@majlis.elsaeed.dev>`. Port 587 with
  STARTTLS is production; port 465 with implicit TLS is an equivalent fallback.
- **TLS is mandatory whenever credentials exist.** `SMTP_TLS` is
  `none | starttls | ssl`. With `starttls`, `smtplib.starttls()` must succeed
  before `login()`; with `ssl`, `SMTP_SSL` is used. A credential pair with
  `none` is rejected before any socket is opened, and a half-configured pair
  is rejected by `Settings.smtp_credentials()`. Certificate verification uses
  `ssl.create_default_context()` — never `CERT_NONE`.
- **Keep the seam synchronous.** `send_email(to, subject, body)` is unchanged;
  call sites already wrap it in `asyncio.to_thread`, so the event loop never
  blocks. No new dependency: `smtplib` and `ssl` are stdlib.
- **Keep messages Arabic and transport-safe.** Subjects are RFC 2047 encoded
  by `EmailMessage`; bodies are UTF-8 text with base64 transfer encoding, plus
  `Date` and a `Message-ID` in the sender domain. V1 sends plain text only —
  no HTML templates, unsubscribe headers or tracking.
- **Dev keeps Mailpit.** Defaults stay `localhost:1025`, `SMTP_TLS=none`, no
  credentials; compose passes the new variables through with empty defaults.
  Every new setting has a dev-safe default, so the compose stack needs no new
  required variable.
- **Failure policy stays explicit.** Signup and invite still fail with 502 and
  roll back before commit, so the operator can retry. Password-reset mail
  failure still returns the same status and body as an unknown address — a 500
  there would disclose which emails are registered. Timing still differs,
  because only a known address triggers up to 10 seconds of SMTP work; closing
  that side channel would require a constant-time dummy send and is out of V1.
  Send failures are logged server-side at `error` level with the exception
  *type* only: SMTP exceptions can carry the recipient address in their args,
  so neither the exception nor its message is logged.
- **Out of V1:** bounce/complaint webhooks, suppression lists, retry queues,
  inbound mail and a DMARC policy record.

## Production configuration

| Variable | Value |
| --- | --- |
| `SMTP_HOST` | `smtp.resend.com` |
| `SMTP_PORT` | `587` |
| `SMTP_TLS` | `starttls` |
| `SMTP_USERNAME` | `resend` |
| `SMTP_PASSWORD` | sending-only Resend API key (Heroku config var, never committed) |
| `SMTP_FROM` | `Majlis <no-reply@majlis.elsaeed.dev>` |

`FRONTEND_URL` is already `https://majlis.elsaeed.dev`, so the emailed
verify/reset/invite links point at the live SPA.

## Consequences

- A remote SMTP outage blocks new signups and teacher invites with 502; no
  account or invite row is persisted. Passing that failure through to the
  caller is deliberate — a silent success would strand the user with no email.
- Requests wait at most 10 seconds for the relay. Because the email is sent
  before the request commits, a timeout after Resend accepted the message can
  deliver a link to a user row that was rolled back. The existing atomicity
  tests prefer that rare orphan email to persisting an unverified account the
  user cannot re-create.
- Resend's free tier limits daily and monthly volume; current V1 traffic is
  far below it. The sending-only key cannot read the dashboard or send from
  another domain.
- DKIM and the Forge CNAME must not be removed from DNS; doing so breaks
  authentication and deliverability. Without DMARC, receivers rely on DKIM
  and SPF alignment; adding `p=none` later is a deliberate follow-up.
- Rotating the mail key is a config-var change plus a dyno restart. It does
  not touch `SECRET_KEY`, so live sessions and previously emailed links stay
  valid.
