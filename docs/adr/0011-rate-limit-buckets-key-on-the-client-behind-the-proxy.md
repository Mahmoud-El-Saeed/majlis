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

## Amendment (ticket 25): Heroku appends, so production names its topology

Heroku's router appends the client address it detected to the RIGHT of any
`X-Forwarded-For` the client sent. Under the ticket-22 walk the rightmost
entry is a proxy record to be dropped, so the bucket would key on the
attacker-controlled leftmost value: rotating forged prefixes mints fresh
buckets and bypasses the signup/login limit.

- `RATE_LIMIT_CLIENT_IP_SOURCE` (Settings) replaces implicit inference:
  - `peer` (default) — raw TCP peer; with `RATE_LIMIT_TRUSTED_PROXIES > 0`
    it keeps the ticket-22 walk for configs that only set the hop count.
  - `xff_trusted_walk` — the ticket-22 walk; compose sets this explicitly
    (`N=1`) so the behaviour no longer depends on a default.
  - `xff_rightmost` — key on the last comma-separated entry; Heroku sets
    this. Forged prefixes cannot move the last entry, and two clients keep
    separate buckets.
- The limiter joins every `X-Forwarded-For` header value (RFC 7230 treats
  duplicate fields as one comma-separated list). Router 2.0 appends the
  detected address after the combined list, so the last entry stays the
  unforgeable one even when a client sends several headers.
- Operationally, `api.majlis.elsaeed.dev` (Cloudflare DNS record) must stay
  grey-cloud (DNS-only). Orange-clouding it inserts a CDN hop in front of
  the dyno, changing these semantics and requiring a return to the walk
  mode with the correct hop count.

