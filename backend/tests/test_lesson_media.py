"""Ticket 05 red phase: Seam 3 Storage — direct-to-R2 presigned audio upload.

Contract under test:
- POST /lessons/{id}/upload-url (admin/owner-teacher only) issues a fresh
  short-lived PUT URL, sets status=processing. Idempotent: re-issuing from
  `processing` (stuck/interrupted upload) returns a *fresh* URL, not an error.
- POST /lessons/{id}/confirm verifies object existence: missing -> 409 and
  stays `processing`; present -> audio_key set, status=ready.
- GET /lessons/{id}/play (can_view: admin/owner/approved) returns a short-lived
  signed GET URL. Pending students gated out; not-ready lessons -> 409.
- Audio-only V1; VPS proxies zero bytes (signed URLs only).

Storage I/O is faked at the seam boundary (no R2 network in tests).
"""

import pytest

from tests.helpers import create_user_in_db, login


class FakeStorage:
    """In-memory seam fake. Mirrors StorageClient protocol."""

    def __init__(self) -> None:
        self.objects: set[str] = set()
        self._counter = 0

    async def presign_put(self, key: str, content_type: str, expires_in: int) -> dict:
        self._counter += 1
        return {
            "upload_url": f"https://fake-r2/{key}?sig=put-{self._counter}",
            "object_key": key,
            "expires_in": expires_in,
        }

    async def object_exists(self, key: str) -> bool:
        return key in self.objects

    async def presign_get(self, key: str, expires_in: int) -> dict:
        return {
            "playback_url": f"https://fake-r2/{key}?sig=get",
            "expires_in": expires_in,
        }


@pytest.fixture
def fake_storage(client) -> FakeStorage:
    """Seam fake with per-test isolation: installed before the test, removed
    after, so overrides and stored objects never leak across tests."""
    from app.api import dependencies as deps

    fake = FakeStorage()

    async def override_storage():  # type: ignore[no-untyped-def]
        yield fake

    app = client._transport.app
    app.dependency_overrides[deps.get_storage_client] = override_storage
    try:
        yield fake
    finally:
        app.dependency_overrides.pop(deps.get_storage_client, None)


async def _tokens(client, email, password):
    return await login(client, email, password)


async def _course(client, token, title="Book"):
    r = await client.post(
        "/api/v1/courses", json={"title": title}, headers={"Authorization": f"Bearer {token}"}
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _lesson(client, token, course_id, title="L1"):
    r = await client.post(
        f"/api/v1/courses/{course_id}/lessons",
        json={"title": title},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201, r.text
    return r.json()


async def test_owner_and_admin_get_upload_url_and_processing(client, fake_storage):
    from app.models.user import Role

    await create_user_in_db("m5o@x.com", "password123", role=Role.teacher)
    await create_user_in_db("m5a@x.com", "password123", role=Role.admin)
    t = await _tokens(client, "m5o@x.com", "password123")
    a = await _tokens(client, "m5a@x.com", "password123")
    fake = fake_storage
    course = await _course(client, t["access_token"])
    lesson = await _lesson(client, t["access_token"], course["id"])
    assert lesson["status"] == "pending"

    r = await client.post(
        f"/api/v1/lessons/{lesson['id']}/upload-url",
        json={"content_type": "audio/mpeg", "file_ext": ".mp3"},
        headers={"Authorization": f"Bearer {t['access_token']}"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["upload_url"].startswith("https://fake-r2/")
    assert body["object_key"].startswith(f"courses/{course['id']}/lessons/{lesson['id']}/")
    assert body["expires_in"] == 900
    assert len(fake.objects) == 0  # presign creates no object

    got = await client.get(
        f"/api/v1/lessons/{lesson['id']}",
        headers={"Authorization": f"Bearer {t['access_token']}"},
    )
    assert got.json()["status"] == "processing"

    # Admin can also issue for the same lesson (overwrite path).
    r2 = await client.post(
        f"/api/v1/lessons/{lesson['id']}/upload-url",
        json={"content_type": "audio/mpeg"},
        headers={"Authorization": f"Bearer {a['access_token']}"},
    )
    assert r2.status_code == 200, r2.text


async def test_upload_url_retry_from_processing_returns_fresh_url(client, fake_storage):
    """Stuck-state recovery: a second upload-url from `processing` must succeed
    with a fresh URL instead of 4xx."""
    from app.models.user import Role

    await create_user_in_db("m5r@x.com", "password123", role=Role.teacher)
    t = await _tokens(client, "m5r@x.com", "password123")
    _ = fake_storage
    course = await _course(client, t["access_token"])
    lesson = await _lesson(client, t["access_token"], course["id"])
    h = {"Authorization": f"Bearer {t['access_token']}"}

    first = (
        await client.post(
            f"/api/v1/lessons/{lesson['id']}/upload-url",
            json={"content_type": "audio/mpeg"},
            headers=h,
        )
    ).json()
    second_r = await client.post(
        f"/api/v1/lessons/{lesson['id']}/upload-url",
        json={"content_type": "audio/mpeg"},
        headers=h,
    )
    assert second_r.status_code == 200, second_r.text
    second = second_r.json()
    assert second["upload_url"] != first["upload_url"]
    got = await client.get(f"/api/v1/lessons/{lesson['id']}", headers=h)
    assert got.json()["status"] == "processing"


async def test_upload_url_forbidden_and_unauth(client, fake_storage):
    from app.models.user import Role

    await create_user_in_db("m5ow@x.com", "password123", role=Role.teacher)
    await create_user_in_db("m5xx@x.com", "password123", role=Role.teacher)
    await create_user_in_db("m5ss@x.com", "password123", role=Role.student)
    to = await _tokens(client, "m5ow@x.com", "password123")
    tx = await _tokens(client, "m5xx@x.com", "password123")
    st = await _tokens(client, "m5ss@x.com", "password123")
    _ = fake_storage
    course = await _course(client, to["access_token"])
    lesson = await _lesson(client, to["access_token"], course["id"])

    for token in (tx["access_token"], st["access_token"]):
        r = await client.post(
            f"/api/v1/lessons/{lesson['id']}/upload-url",
            json={"content_type": "audio/mpeg"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 403, r.text
    r = await client.post(
        f"/api/v1/lessons/{lesson['id']}/upload-url",
        json={"content_type": "audio/mpeg"},
    )
    assert r.status_code in (401, 403), r.text


async def test_upload_url_rejects_non_audio_and_404(client, fake_storage):
    from app.models.user import Role

    await create_user_in_db("m5au@x.com", "password123", role=Role.teacher)
    t = await _tokens(client, "m5au@x.com", "password123")
    _ = fake_storage
    course = await _course(client, t["access_token"])
    lesson = await _lesson(client, t["access_token"], course["id"])
    h = {"Authorization": f"Bearer {t['access_token']}"}

    r = await client.post(
        f"/api/v1/lessons/{lesson['id']}/upload-url",
        json={"content_type": "video/mp4", "file_ext": ".mp4"},
        headers=h,
    )
    assert r.status_code in (400, 422), r.text

    r = await client.post(
        "/api/v1/lessons/00000000-0000-0000-0000-000000000000/upload-url",
        json={"content_type": "audio/mpeg"},
        headers=h,
    )
    assert r.status_code == 404, r.text


async def test_confirm_without_object_stays_processing(client, fake_storage):
    from app.models.user import Role

    await create_user_in_db("m5c1@x.com", "password123", role=Role.teacher)
    t = await _tokens(client, "m5c1@x.com", "password123")
    _ = fake_storage
    course = await _course(client, t["access_token"])
    lesson = await _lesson(client, t["access_token"], course["id"])
    h = {"Authorization": f"Bearer {t['access_token']}"}

    up = (
        await client.post(
            f"/api/v1/lessons/{lesson['id']}/upload-url",
            json={"content_type": "audio/mpeg"},
            headers=h,
        )
    ).json()
    r = await client.post(
        f"/api/v1/lessons/{lesson['id']}/confirm",
        json={"object_key": up["object_key"]},
        headers=h,
    )
    assert r.status_code == 409, r.text
    got = await client.get(f"/api/v1/lessons/{lesson['id']}", headers=h)
    assert got.json()["status"] == "processing"
    assert got.json()["audio_key"] is None


async def test_confirm_with_object_marks_ready(client, fake_storage):
    from app.models.user import Role

    await create_user_in_db("m5c2@x.com", "password123", role=Role.teacher)
    t = await _tokens(client, "m5c2@x.com", "password123")
    fake = fake_storage
    course = await _course(client, t["access_token"])
    lesson = await _lesson(client, t["access_token"], course["id"])
    h = {"Authorization": f"Bearer {t['access_token']}"}

    up = (
        await client.post(
            f"/api/v1/lessons/{lesson['id']}/upload-url",
            json={"content_type": "audio/mpeg", "file_ext": ".mp3"},
            headers=h,
        )
    ).json()
    # Simulate browser PUT direct to object storage.
    fake.objects.add(up["object_key"])

    r = await client.post(
        f"/api/v1/lessons/{lesson['id']}/confirm",
        json={"object_key": up["object_key"]},
        headers=h,
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "ready"
    assert r.json()["audio_key"] == up["object_key"]


async def test_confirm_forbidden_and_key_mismatch(client, fake_storage):
    from app.models.user import Role

    await create_user_in_db("m5c3@x.com", "password123", role=Role.teacher)
    await create_user_in_db("m5c4@x.com", "password123", role=Role.student)
    t = await _tokens(client, "m5c3@x.com", "password123")
    s = await _tokens(client, "m5c4@x.com", "password123")
    _ = fake_storage
    course = await _course(client, t["access_token"])
    lesson = await _lesson(client, t["access_token"], course["id"])
    h = {"Authorization": f"Bearer {t['access_token']}"}
    up = (
        await client.post(
            f"/api/v1/lessons/{lesson['id']}/upload-url",
            json={"content_type": "audio/mpeg"},
            headers=h,
        )
    ).json()

    r = await client.post(
        f"/api/v1/lessons/{lesson['id']}/confirm",
        json={"object_key": up["object_key"]},
        headers={"Authorization": f"Bearer {s['access_token']}"},
    )
    assert r.status_code == 403, r.text

    r = await client.post(
        f"/api/v1/lessons/{lesson['id']}/confirm",
        json={"object_key": "courses/other/lessons/other/audio.mp3"},
        headers=h,
    )
    assert r.status_code in (400, 409), r.text


async def test_play_gated_and_requires_ready(client, fake_storage):
    from app.models.user import Role

    await create_user_in_db("m5p1@x.com", "password123", role=Role.teacher)
    await create_user_in_db("m5p2@x.com", "password123", role=Role.student)
    t = await _tokens(client, "m5p1@x.com", "password123")
    s = await _tokens(client, "m5p2@x.com", "password123")
    fake = fake_storage
    course = await _course(client, t["access_token"])
    lesson = await _lesson(client, t["access_token"], course["id"])
    th = {"Authorization": f"Bearer {t['access_token']}"}
    sh = {"Authorization": f"Bearer {s['access_token']}"}

    # Not ready yet -> 409 even for the owner.
    assert (await client.get(f"/api/v1/lessons/{lesson['id']}/play", headers=th)).status_code == 409

    up = (
        await client.post(
            f"/api/v1/lessons/{lesson['id']}/upload-url",
            json={"content_type": "audio/mpeg"},
            headers=th,
        )
    ).json()
    fake.objects.add(up["object_key"])
    assert (
        await client.post(
            f"/api/v1/lessons/{lesson['id']}/confirm",
            json={"object_key": up["object_key"]},
            headers=th,
        )
    ).status_code == 200

    # Pending student gated out.
    assert (await client.get(f"/api/v1/lessons/{lesson['id']}/play", headers=sh)).status_code in (
        403,
        404,
    )

    code = await client.post(f"/api/v1/courses/{course['id']}/codes", json={}, headers=th)
    join = await client.post(
        "/api/v1/enrollments/join",
        json={"code": code.json()["code"], "display_name": "S"},
        headers=sh,
    )
    assert (
        await client.post(f"/api/v1/enrollments/{join.json()['id']}/approve", headers=th)
    ).status_code == 200

    r = await client.get(f"/api/v1/lessons/{lesson['id']}/play", headers=sh)
    assert r.status_code == 200, r.text
    assert r.json()["playback_url"].startswith("https://fake-r2/")
    assert r.json()["expires_in"] == 3600

    # Owner-teacher play also works; unauth rejected.
    assert (await client.get(f"/api/v1/lessons/{lesson['id']}/play", headers=th)).status_code == 200
    assert (await client.get(f"/api/v1/lessons/{lesson['id']}/play")).status_code in (401, 403)


async def test_confirm_rejects_non_audio_key_ext(client, fake_storage):
    """Review fix: the upload-url audio gate can be bypassed with a spoofed
    content type, so confirm re-checks the key extension."""
    from app.models.user import Role

    await create_user_in_db("m5x1@x.com", "password123", role=Role.teacher)
    t = await _tokens(client, "m5x1@x.com", "password123")
    fake = fake_storage
    course = await _course(client, t["access_token"])
    lesson = await _lesson(client, t["access_token"], course["id"])
    h = {"Authorization": f"Bearer {t['access_token']}"}

    evil = f"courses/{course['id']}/lessons/{lesson['id']}/audio.mp4"
    fake.objects.add(evil)
    r = await client.post(
        f"/api/v1/lessons/{lesson['id']}/confirm",
        json={"object_key": evil},
        headers=h,
    )
    assert r.status_code in (400, 422), r.text
    got = await client.get(f"/api/v1/lessons/{lesson['id']}", headers=h)
    assert got.json()["status"] != "ready"


async def test_upload_url_from_ready_keeps_ready(client, fake_storage):
    """Review fix: re-issuing upload-url for a ready lesson must not demote it
    to processing; the lesson stays playable until the new confirm lands."""
    from app.models.user import Role

    await create_user_in_db("m5x2@x.com", "password123", role=Role.teacher)
    t = await _tokens(client, "m5x2@x.com", "password123")
    fake = fake_storage
    course = await _course(client, t["access_token"])
    lesson = await _lesson(client, t["access_token"], course["id"])
    h = {"Authorization": f"Bearer {t['access_token']}"}

    up = (
        await client.post(
            f"/api/v1/lessons/{lesson['id']}/upload-url",
            json={"content_type": "audio/mpeg"},
            headers=h,
        )
    ).json()
    fake.objects.add(up["object_key"])
    assert (
        await client.post(
            f"/api/v1/lessons/{lesson['id']}/confirm",
            json={"object_key": up["object_key"]},
            headers=h,
        )
    ).status_code == 200

    second = await client.post(
        f"/api/v1/lessons/{lesson['id']}/upload-url",
        json={"content_type": "audio/mpeg"},
        headers=h,
    )
    assert second.status_code == 200, second.text
    got = await client.get(f"/api/v1/lessons/{lesson['id']}", headers=h)
    assert got.json()["status"] == "ready"
    assert (await client.get(f"/api/v1/lessons/{lesson['id']}/play", headers=h)).status_code == 200
