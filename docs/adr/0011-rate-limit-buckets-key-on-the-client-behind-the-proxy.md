# ADR-0011: Rate-limit buckets key on the client behind the proxy

Status: accepted

## Context

Fixed-window buckets keyed on `request.client.host` — the raw TCP peer. Behind
the compose nginx (Cloudflare → nginx → uvicorn) every request arriving came
from the nginx IP, so all clients shared one `rl:<path>:<nginx>` bucket: one
client exhausting signup/login or joins rate-limited everyone else on the
platform (ticket 22 audit finding).

## Decision

- `RATE_LIMIT_TRUSTED_PROXIES` (Settings, default `0`) declares how many
  proxies in front of the API are trusted to prepend X-Forwarded-For truth.
  `0` keeps today's raw-peer behaviour (direct dev access, tests).
- With `N > 0`, the limiter walks X-Forwarded-For from the right, drops the
  rightmost `N` entries (the trusted proxies' own records — with `N=1`,
  nginx's appended peer, i.e. the Cloudflare edge IP) and keys on the
  rightmost remaining entry — the client as the innermost trusted proxy saw
  it (with `N=1`, Cloudflare's appended visitor IP).
- XFF with no untrusted entry left after the cut (fewer than `N+1` entries —
  a client behind the proxy that injected no header of its own) falls back
  to the leftmost entry; no header at all → direct peer.
- Compose sets `RATE_LIMIT_TRUSTED_PROXIES=1` (the nginx hop; Cloudflare has
  already appended the real visitor IP before nginx appends itself).
- Tests pin: the old shared-bucket behaviour, per-client isolation once the
  setting is on, isolation preserved in the in-memory fallback (Redis down),
  and the Redis path's key shape (`tests/test_rate_limit.py`).

## Consequences

- A client forging its own XFF can shape part of its bucket key. On a
  deployment WITHOUT Cloudflare (a client reaching nginx directly), each
  forged value before nginx's appended real peer becomes a fresh leftmost
  entry — rotating forged XFF values rotates buckets and bypasses the own
  client's limit. Behind Cloudflare (the documented topology) CF appends the
  true visitor IP after any forged hops, so `N=1` keys on the visitor and
  forging is inert. If security ever depends on the limiter holding up
  against a direct-to-origin attacker, `N=0` (raw peer, unforgeable) is the
  conservative choice.
- Behind Cloudflare the trusted innermost report is exact (CF appends the
  visitor IP; nginx then appends CF's edge IP, which `N=1` drops). If the
  deployment ever fronts the API differently, `N` is the knob.

## Rejected alternatives

- Reading `X-Forwarded-For`'s leftmost entry always: rejected — first-entry
  trusting is the classic spoof.
- `uvicorn --proxy-headers --forwarded-allow-ips`: rejected — rewrites
  `request.client` process-wide but is invisible inside the app and in the
  ASGI TestClient used by tests; the limiter-level walk stays testable at
  the seam this repo tests.
- Per-endpoint token buckets per user id: rejected — the public seams this
  protects (signup, login) run before any identity exists.
