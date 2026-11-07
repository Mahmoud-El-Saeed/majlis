# ADR-0010: Baseline security headers at the reverse proxy

Status: accepted

## Context

The reverse proxy (nginx) forwarded requests verbatim and stamped no
response headers. An audit finding (ticket 22) asked for baseline security
headers. TLS terminates at Cloudflare in front of this proxy, and this host
serves only the JSON API — the SPA lives on Cloudflare Pages, not here.

## Decision

nginx sets, on every response (including 4xx/5xx, `always`):

| Header | Value | Why |
| --- | --- | --- |
| `X-Content-Type-Options` | `nosniff` | MIME confusion on API errors |
| `X-Frame-Options` | `DENY` | no framing of any origin response |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | no cross-origin URL leakage |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | API host needs none of these |
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'` | safe baseline for a JSON-only host |

HSTS is deliberately not set here: browsers ignore it over plain HTTP and
this proxy runs behind the Cloudflare edge, so the header belongs at the TLS
terminator (Cloudflare `Strict Transport-Security`).

## Consequences

- The five headers live in `infra/nginx.conf` at server level with the same
  five repeated inside the `location /` text response — nginx's `add_header`
  inheritance drops server-level headers the moment a location defines its
  own `add_header`, so the repetition is load-bearing, not redundant.
- If the SPA ever moves under this proxy, revisit CSP (`none` would be
  wrong for a real frontend) before serving HTML from here.

## Rejected alternatives

- Security headers set by FastAPI middleware instead: rejected — two places
  to keep in sync, and the proxy can also stamp 4xx/5xx from itself.
- HSTS at nginx behind Cloudflare: rejected — ineffective on plain HTTP and
  the authority for it is the TLS edge.
