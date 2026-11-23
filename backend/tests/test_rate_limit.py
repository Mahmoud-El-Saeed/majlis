"""Ticket 22 + 25: the limiter keys buckets on the real client behind the proxy.

History/bug: the limiter keyed on `request.client.host` — the raw TCP peer.
Behind the compose nginx every client collapsed into one
`rl:<path>:<nginx-ip>` bucket, so exhausting one client's bucket denied the
rest. These tests pin: the old shared-bucket behaviour, per-client isolation
once the trusted proxy's X-Forwarded-For is honored, per-client isolation in
the in-memory fallback (Redis down), and the Redis path itself.

Ticket 25 adds the Heroku router, which *appends* the client address to the
right of any client-supplied header. The trusted-proxy walk would trust that
forged prefix, so production names its topology explicitly:
`RATE_LIMIT_CLIENT_IP_SOURCE=xff_rightmost`.
"""

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.main import create_app

# ASGITransport presents the ASGI "client" as 127.0.0.1; the direct-peer
# bucket below is asserted against that exact value.
DIRECT_PEER_BUCKET_PREFIX = "rl:/api/v1/auth/login:"


@pytest_asyncio.fixture
async def rl_client(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[AsyncClient]:
    """Minimal app without a usable DB: limiter-covered POSTs return a clean
    401 from a stubbed authentication (the limiter answers first, and an
    endpoint explosion must not be able to mask limiter behaviour)."""
    from app.services import auth_service

    async def no_authenticate(_db: object, _email: str, _password: str) -> None:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    monkeypatch.setattr(auth_service, "authenticate", no_authenticate)

    app = create_app()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture(autouse=True)
async def one_login_attempt_and_isolation(monkeypatch: pytest.MonkeyPatch) -> None:
    """Limit login to 1/min and reset limiter state around every test.

    The flush is conftest's public `flush_rate_limits`: without it, counts
    persist in the real Redis across runs (60s TTL) and yesterday's run
    exhausts today's first client before its first POST even lands.
    """
    from app.core import rate_limit as rl
    from tests.conftest import flush_rate_limits

    monkeypatch.setitem(rl.LIMITED_ENDPOINTS, "/api/v1/auth/login", 1)
    await flush_rate_limits()
    yield  # type: ignore[misc]
    await flush_rate_limits()


async def _post_login(client: AsyncClient, *headers: tuple[str, str]) -> int:
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "x@example.com", "password": "nope"},
        headers=dict(headers),
    )
    return resp.status_code

async def test_shared_bucket_when_proxy_not_trusted(
    rl_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Reproduces the reported bug: trusted proxies = 0 (the old default) means
    X-Forwarded-For is ignored — two distinct clients share one bucket and the
    second is denied because of the first client's traffic."""
    from app.core import rate_limit as rl

    monkeypatch.setattr(rl.settings, "RATE_LIMIT_CLIENT_IP_SOURCE", "peer")
    monkeypatch.setattr(rl.settings, "RATE_LIMIT_TRUSTED_PROXIES", 0)

    first = await _post_login(rl_client, ("X-Forwarded-For", "203.0.113.10"))
    second = await _post_login(rl_client, ("X-Forwarded-For", "203.0.113.20"))

    assert first != 429
    assert second == 429  # shared bucket: client A's exhaust hits client B


async def test_per_client_isolation_when_proxy_trusted(
    rl_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """One trusted proxy (nginx) → the rightmost untrusted XFF entry is the
    client. Client A exhausting its bucket must NOT deny client B's first
    request (limit=1: each client's own second request still limits)."""
    from app.core import rate_limit as rl

    monkeypatch.setattr(rl.settings, "RATE_LIMIT_CLIENT_IP_SOURCE", "xff_trusted_walk")
    monkeypatch.setattr(rl.settings, "RATE_LIMIT_TRUSTED_PROXIES", 1)

    a_first = await _post_login(rl_client, ("X-Forwarded-For", "203.0.113.10"))
    assert a_first != 429
    a_second = await _post_login(rl_client, ("X-Forwarded-For", "203.0.113.10"))
    assert a_second == 429  # A's own bucket is exhausted

    b_first = await _post_login(rl_client, ("X-Forwarded-For", "203.0.113.20"))
    assert b_first != 429  # B untouched — that is the fix
    b_second = await _post_login(rl_client, ("X-Forwarded-For", "203.0.113.20"))
    assert b_second == 429  # B has its own bucket too


async def test_memory_fallback_keeps_per_client_isolation(
    rl_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Redis down → in-memory fallback still limits, still per client."""
    from app.core import rate_limit as rl

    monkeypatch.setattr(rl.settings, "RATE_LIMIT_CLIENT_IP_SOURCE", "xff_trusted_walk")
    monkeypatch.setattr(rl.settings, "RATE_LIMIT_TRUSTED_PROXIES", 1)

    def explode() -> object:
        raise ConnectionError("redis down")

    monkeypatch.setattr(rl, "get_redis", explode)
    a_first = await _post_login(rl_client, ("X-Forwarded-For", "203.0.113.10"))
    assert a_first != 429
    a_second = await _post_login(rl_client, ("X-Forwarded-For", "203.0.113.10"))
    assert a_second == 429

    b_first = await _post_login(rl_client, ("X-Forwarded-For", "203.0.113.20"))
    assert b_first != 429
    b_second = await _post_login(rl_client, ("X-Forwarded-For", "203.0.113.20"))
    assert b_second == 429


class _FakeRedis:
    """Records the limiter's Redis calls, standing in for a real Redis."""

    def __init__(self) -> None:
        self.counts: dict[str, int] = {}
        self.expiries: list[str] = []

    async def incr(self, key: str) -> int:
        self.counts[key] = self.counts.get(key, 0) + 1
        return self.counts[key]

    async def expire(self, key: str, ttl: int) -> None:
        self.expiries.append(key)


@pytest.fixture
def heroku_rightmost(monkeypatch: pytest.MonkeyPatch) -> _FakeRedis:
    """Heroku topology: rightmost XFF entry, no proxy walk, fake Redis."""
    from app.core import rate_limit as rl

    monkeypatch.setattr(rl.settings, "RATE_LIMIT_CLIENT_IP_SOURCE", "xff_rightmost")
    monkeypatch.setattr(rl.settings, "RATE_LIMIT_TRUSTED_PROXIES", 0)
    fake = _FakeRedis()
    monkeypatch.setattr(rl, "get_redis", lambda: fake)
    return fake


async def test_redis_path_keys_on_forwarded_client(
    rl_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Redis available → counts live in Redis, one key per (path, client)."""
    from app.core import rate_limit as rl

    monkeypatch.setattr(rl.settings, "RATE_LIMIT_CLIENT_IP_SOURCE", "xff_trusted_walk")
    monkeypatch.setattr(rl.settings, "RATE_LIMIT_TRUSTED_PROXIES", 1)

    fake = _FakeRedis()
    monkeypatch.setattr(rl, "get_redis", lambda: fake)

    await _post_login(rl_client, ("X-Forwarded-For", "203.0.113.10"))
    await _post_login(rl_client, ("X-Forwarded-For", "203.0.113.20"))

    assert set(fake.counts) == {
        "rl:/api/v1/auth/login:203.0.113.10",
        "rl:/api/v1/auth/login:203.0.113.20",
    }
    assert fake.expiries  # first hit of each key sets the 60s window


async def test_cloudflare_chain_keys_on_the_visitor_not_the_edge(
    rl_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The documented topology is two hops: Cloudflare appends the visitor,
    nginx appends the CF edge. With N=1 the edge is dropped and the visitor
    is the key — never the shared edge IP (the original shared-bucket bug one
    hop further out). Single-entry tests alone take the shorter-chain
    fallback, so this is the only test exercising the trusted-proxy walk."""
    from app.core import rate_limit as rl

    monkeypatch.setattr(rl.settings, "RATE_LIMIT_CLIENT_IP_SOURCE", "xff_trusted_walk")
    monkeypatch.setattr(rl.settings, "RATE_LIMIT_TRUSTED_PROXIES", 1)

    fake = _FakeRedis()
    monkeypatch.setattr(rl, "get_redis", lambda: fake)

    # Same CF edge, two different visitors.
    a_first = await _post_login(rl_client, ("X-Forwarded-For", "203.0.113.10, 198.51.100.7"))
    a_second = await _post_login(rl_client, ("X-Forwarded-For", "203.0.113.10, 198.51.100.7"))
    b_first = await _post_login(rl_client, ("X-Forwarded-For", "203.0.113.20, 198.51.100.7"))

    assert a_first != 429
    assert a_second == 429  # A's own bucket is exhausted
    assert b_first != 429  # B behind the same edge is untouched
    assert set(fake.counts) == {
        "rl:/api/v1/auth/login:203.0.113.10",
        "rl:/api/v1/auth/login:203.0.113.20",
    }


async def test_no_forwarded_header_falls_back_to_direct_peer(
    rl_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Direct access (dev, no proxy) still lands in the direct-peer bucket."""
    from app.core import rate_limit as rl

    monkeypatch.setattr(rl.settings, "RATE_LIMIT_CLIENT_IP_SOURCE", "xff_trusted_walk")
    monkeypatch.setattr(rl.settings, "RATE_LIMIT_TRUSTED_PROXIES", 1)

    fake = _FakeRedis()
    monkeypatch.setattr(rl, "get_redis", lambda: fake)

    await _post_login(rl_client)

    assert set(fake.counts) == {f"{DIRECT_PEER_BUCKET_PREFIX}127.0.0.1"}


async def test_heroku_rightmost_mode_ignores_a_forged_prefix(
    rl_client: AsyncClient, heroku_rightmost: _FakeRedis
) -> None:
    """Heroku appends the address it saw to the right of the header. Rotating
    the forged prefix must not mint a fresh bucket; only the appended value
    (the same real client) keys the bucket."""
    first = await _post_login(rl_client, ("X-Forwarded-For", "203.0.113.99, 198.51.100.7"))
    second = await _post_login(rl_client, ("X-Forwarded-For", "192.0.2.44, 198.51.100.7"))

    assert first != 429
    assert second == 429  # same rightmost client, forged prefixes changed
    assert set(heroku_rightmost.counts) == {"rl:/api/v1/auth/login:198.51.100.7"}


async def test_heroku_rightmost_mode_keeps_clients_isolated(
    rl_client: AsyncClient, heroku_rightmost: _FakeRedis
) -> None:
    a_first = await _post_login(rl_client, ("X-Forwarded-For", "198.51.100.7"))
    a_second = await _post_login(rl_client, ("X-Forwarded-For", "198.51.100.7"))
    b_first = await _post_login(rl_client, ("X-Forwarded-For", "198.51.100.8"))

    assert a_first != 429
    assert a_second == 429
    assert b_first != 429
    assert set(heroku_rightmost.counts) == {
        "rl:/api/v1/auth/login:198.51.100.7",
        "rl:/api/v1/auth/login:198.51.100.8",
    }


async def test_heroku_rightmost_mode_joins_duplicate_headers(
    rl_client: AsyncClient, heroku_rightmost: _FakeRedis
) -> None:
    """Router 2.0 combines duplicate fields (RFC 7230) and appends after
    them. The last entry of the joined list is the router's, not a
    client-forged header."""
    response = await rl_client.post(
        "/api/v1/auth/login",
        json={"email": "x@example.com", "password": "nope"},
        headers=[
            ("X-Forwarded-For", "203.0.113.99"),
            ("X-Forwarded-For", "192.0.2.44, 198.51.100.7"),
        ],
    )

    assert response.status_code != 429
    assert set(heroku_rightmost.counts) == {"rl:/api/v1/auth/login:198.51.100.7"}


async def test_heroku_rightmost_mode_falls_back_to_the_direct_peer(
    rl_client: AsyncClient, heroku_rightmost: _FakeRedis
) -> None:
    await _post_login(rl_client)

    assert set(heroku_rightmost.counts) == {f"{DIRECT_PEER_BUCKET_PREFIX}127.0.0.1"}
