"""Ticket 02: invite-only teacher onboarding with role enforcement.

Seam under test: Identity & Enrollment (auth gates + invite transitions).
SMTP is faked at the seam boundary via the test outbox (see helpers).
"""

import pytest
from httpx import AsyncClient

from app.models.user import Role
from tests.helpers import (
    active_invite_token_hash,
    create_user_in_db,
    expire_invite_in_db,
    get_outbox,
    login,
)

ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "admin12345"


@pytest.fixture
async def admin_headers(client: AsyncClient) -> dict[str, str]:
    await create_user_in_db(ADMIN_EMAIL, ADMIN_PASSWORD, role=Role.admin)
    tokens = await login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def invite_link_for(outbox: list[dict[str, str]], to: str) -> str:
    bodies = [m["body"] for m in outbox if m["to"] == to]
    assert bodies, f"no invite email sent to {to}"
    assert "invite?token=" in bodies[-1]
    return bodies[-1].split("invite?token=")[1].split()[0].strip()


async def test_admin_invite_then_teacher_accept_and_login(
    client: AsyncClient, admin_headers: dict[str, str]
) -> None:
    outbox = get_outbox(client)

    r = await client.post(
        "/api/v1/invites", json={"email": "sheikh@example.com"}, headers=admin_headers
    )
    assert r.status_code == 201, r.text

    token = invite_link_for(outbox, "sheikh@example.com")

    r = await client.post(
        "/api/v1/invites/accept",
        json={"token": token, "password": "sheikh1234", "full_name": "الشيخ"},
    )
    assert r.status_code == 201, r.text

    tokens = await login(client, "sheikh@example.com", "sheikh1234")
    r = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )
    assert r.status_code == 200
    assert r.json()["role"] == "teacher"
    assert r.json()["is_verified"] is True


async def test_student_cannot_invite_and_anonymous_cannot_invite(
    client: AsyncClient, admin_headers: dict[str, str]
) -> None:
    await create_user_in_db("student@example.com", "secret1234", role=Role.student)
    tokens = await login(client, "student@example.com", "secret1234")
    student_headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    r = await client.post(
        "/api/v1/invites", json={"email": "x@example.com"}, headers=student_headers
    )
    assert r.status_code == 403

    r = await client.post("/api/v1/invites", json={"email": "x@example.com"})
    assert r.status_code == 401


async def test_teacher_cannot_invite(client: AsyncClient, admin_headers: dict[str, str]) -> None:
    await create_user_in_db("t@example.com", "secret1234", role=Role.teacher)
    tokens = await login(client, "t@example.com", "secret1234")
    r = await client.post(
        "/api/v1/invites",
        json={"email": "y@example.com"},
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    assert r.status_code == 403


async def test_no_public_teacher_self_registration(client: AsyncClient) -> None:
    # Even if a client smuggles a role field, signup stays student.
    r = await client.post(
        "/api/v1/auth/signup",
        json={"email": "sneaky@example.com", "password": "secret1234", "role": "teacher"},
    )
    assert r.status_code == 201, r.text

    outbox = get_outbox(client)
    token = outbox[-1]["body"].split("verify?token=")[1].split()[0].strip()
    await client.post("/api/v1/auth/verify", json={"token": token})

    tokens = await login(client, "sneaky@example.com", "secret1234")
    r = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )
    assert r.json()["role"] == "student"


async def test_invite_link_reuse_is_rejected(
    client: AsyncClient, admin_headers: dict[str, str]
) -> None:
    outbox = get_outbox(client)
    await client.post("/api/v1/invites", json={"email": "once@example.com"}, headers=admin_headers)
    token = invite_link_for(outbox, "once@example.com")

    r = await client.post("/api/v1/invites/accept", json={"token": token, "password": "secret1234"})
    assert r.status_code == 201, r.text

    r = await client.post("/api/v1/invites/accept", json={"token": token, "password": "secret1234"})
    assert r.status_code == 400
    assert "used" in r.json()["detail"].lower()


async def test_expired_invite_is_rejected(
    client: AsyncClient, admin_headers: dict[str, str]
) -> None:
    outbox = get_outbox(client)
    await client.post("/api/v1/invites", json={"email": "old@example.com"}, headers=admin_headers)
    token = invite_link_for(outbox, "old@example.com")
    await expire_invite_in_db("old@example.com")

    r = await client.post("/api/v1/invites/accept", json={"token": token, "password": "secret1234"})
    assert r.status_code == 400
    assert "expir" in r.json()["detail"].lower()


async def test_forged_invite_is_rejected(
    client: AsyncClient, admin_headers: dict[str, str]
) -> None:
    r = await client.post(
        "/api/v1/invites/accept", json={"token": "forged-token", "password": "secret1234"}
    )
    assert r.status_code == 400
    assert "invalid" in r.json()["detail"].lower()


async def test_inviting_existing_student_promotes_on_accept(
    client: AsyncClient, admin_headers: dict[str, str]
) -> None:
    # A teacher can also study with another teacher: inviting a student
    # email upgrades that account to teacher instead of failing.
    r = await client.post(
        "/api/v1/auth/signup",
        json={"email": "both@example.com", "password": "secret1234"},
    )
    assert r.status_code == 201, r.text
    outbox = get_outbox(client)
    verify_token = outbox[-1]["body"].split("verify?token=")[1].split()[0].strip()
    await client.post("/api/v1/auth/verify", json={"token": verify_token})

    r = await client.post(
        "/api/v1/invites", json={"email": "both@example.com"}, headers=admin_headers
    )
    assert r.status_code == 201, r.text
    invite_token = invite_link_for(outbox, "both@example.com")

    r = await client.post(
        "/api/v1/invites/accept", json={"token": invite_token, "password": "newsecret123"}
    )
    assert r.status_code == 201, r.text

    tokens = await login(client, "both@example.com", "newsecret123")
    r = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )
    assert r.json()["role"] == "teacher"


async def test_inviting_existing_teacher_is_rejected(
    client: AsyncClient, admin_headers: dict[str, str]
) -> None:
    await create_user_in_db("already@example.com", "secret1234", role=Role.teacher)
    r = await client.post(
        "/api/v1/invites", json={"email": "already@example.com"}, headers=admin_headers
    )
    assert r.status_code == 400


async def test_invite_token_hash_never_leaks_raw_token(
    client: AsyncClient, admin_headers: dict[str, str]
) -> None:
    outbox = get_outbox(client)
    await client.post(
        "/api/v1/invites", json={"email": "opaque@example.com"}, headers=admin_headers
    )
    token = invite_link_for(outbox, "opaque@example.com")
    stored = await active_invite_token_hash("opaque@example.com")
    assert stored is not None
    assert stored != token
    assert len(stored) == 64  # sha256 hex


async def test_reinvite_revokes_old_link_but_keeps_history(
    client: AsyncClient, admin_headers: dict[str, str]
) -> None:
    outbox = get_outbox(client)
    await client.post("/api/v1/invites", json={"email": "again@example.com"}, headers=admin_headers)
    first_token = invite_link_for(outbox, "again@example.com")

    r = await client.post(
        "/api/v1/invites", json={"email": "again@example.com"}, headers=admin_headers
    )
    assert r.status_code == 201, r.text
    second_token = invite_link_for(outbox, "again@example.com")
    assert second_token != first_token

    r = await client.post(
        "/api/v1/invites/accept", json={"token": first_token, "password": "secret1234"}
    )
    assert r.status_code == 400
    assert "revoked" in r.json()["detail"].lower()

    r = await client.post(
        "/api/v1/invites/accept", json={"token": second_token, "password": "secret1234"}
    )
    assert r.status_code == 201, r.text

    # History survives: admin list shows both invites.
    r = await client.get("/api/v1/invites", headers=admin_headers)
    assert r.status_code == 200
    rows = [i for i in r.json()["invites"] if i["email"] == "again@example.com"]
    assert len(rows) == 2
    assert sum(1 for i in rows if i["revoked_at"] is not None) == 1
    assert sum(1 for i in rows if i["used_at"] is not None) == 1


async def test_invite_mail_failure_returns_502_and_leaves_no_invite(
    client: AsyncClient,
    admin_headers: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.core.mail as mail_module

    def failing_send(to: str, subject: str, body: str) -> None:
        raise ConnectionError("smtp down")

    monkeypatch.setattr(mail_module, "send_email", failing_send)

    r = await client.post(
        "/api/v1/invites", json={"email": "retry@example.com"}, headers=admin_headers
    )
    assert r.status_code == 502
    assert "invite email" in r.json()["detail"].lower()

    # Nothing was persisted: listing shows no trace of the failed invite.
    r = await client.get("/api/v1/invites", headers=admin_headers)
    assert r.status_code == 200
    assert all(i["email"] != "retry@example.com" for i in r.json()["invites"])
