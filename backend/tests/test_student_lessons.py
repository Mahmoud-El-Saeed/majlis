"""Ticket 06: student-safe lesson payloads — audio-only student view.

Contract:
- GET /courses/{id}/lessons returns summaries: no transcript_voice/book,
  no audio_key, with attachment_count. Non-writers see ready lessons only.
- GET /lessons/{id} for writers returns full transcripts + audio_key;
  for approved students transcripts are blanked and audio_key hidden
  (playback via /play, files via attachment /file).
"""

import pytest

from tests.helpers import create_user_in_db, login


class FakeStorage:
    def __init__(self) -> None:
        self.objects: set[str] = set()

    async def presign_put(self, key: str, content_type: str, expires_in: int) -> dict:
        return {
            "upload_url": f"https://fake-r2/{key}?sig=put",
            "object_key": key,
            "expires_in": expires_in,
        }

    async def object_exists(self, key: str) -> bool:
        return key in self.objects

    async def presign_get(
        self,
        key: str,
        expires_in: int,
        filename: str | None = None,
        disposition: str | None = None,
    ) -> dict:
        return {"playback_url": f"https://fake-r2/{key}?sig=get", "expires_in": expires_in}


@pytest.fixture
def fake_storage(client) -> FakeStorage:
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


async def test_lesson_list_is_summary_without_transcripts(client):
    from app.models.user import Role

    await create_user_in_db("sl1@x.com", "password123", role=Role.teacher)
    t = await _tokens(client, "sl1@x.com", "password123")
    th = {"Authorization": f"Bearer {t['access_token']}"}
    course = await _course(client, t["access_token"])
    created = await client.post(
        f"/api/v1/courses/{course['id']}/lessons",
        json={"title": "L", "transcript_voice": "v", "transcript_book": "b"},
        headers=th,
    )
    assert created.status_code == 201, created.text

    lst = await client.get(f"/api/v1/courses/{course['id']}/lessons", headers=th)
    assert lst.status_code == 200, lst.text
    row = lst.json()[0]
    assert "transcript_voice" not in row
    assert "transcript_book" not in row
    assert "audio_key" not in row
    assert row["attachment_count"] == 0
    assert row["status"] == "pending"


async def test_lesson_detail_student_audio_only(client):
    from app.models.user import Role

    await create_user_in_db("sl2@x.com", "password123", role=Role.teacher)
    await create_user_in_db("sl3@x.com", "password123", role=Role.student)
    t = await _tokens(client, "sl2@x.com", "password123")
    s = await _tokens(client, "sl3@x.com", "password123")
    th = {"Authorization": f"Bearer {t['access_token']}"}
    sh = {"Authorization": f"Bearer {s['access_token']}"}
    course = await _course(client, t["access_token"])
    created = await client.post(
        f"/api/v1/courses/{course['id']}/lessons",
        json={"title": "L", "transcript_voice": "secret-v", "transcript_book": "secret-b"},
        headers=th,
    )
    lid = created.json()["id"]

    # Writer sees full.
    full = await client.get(f"/api/v1/lessons/{lid}", headers=th)
    assert full.status_code == 200, full.text
    assert full.json()["transcript_voice"] == "secret-v"
    assert full.json()["can_manage"] is True

    # Approve student, then detail is audio-only.
    code = (await client.post(f"/api/v1/courses/{course['id']}/codes", json={}, headers=th)).json()
    join = (
        await client.post(
            "/api/v1/enrollments/join",
            json={"code": code["code"], "display_name": "S"},
            headers=sh,
        )
    ).json()
    assert (
        await client.post(f"/api/v1/enrollments/{join['id']}/approve", headers=th)
    ).status_code == 200

    one = await client.get(f"/api/v1/lessons/{lid}", headers=sh)
    assert one.status_code == 200, one.text
    body = one.json()
    assert body["transcript_voice"] == ""
    assert body["transcript_book"] == ""
    assert body["audio_key"] is None
    assert body["can_manage"] is False
    assert body["title"] == "L"


async def test_student_list_and_dashboard_show_ready_only(client, fake_storage):
    """Review fix: draft (non-ready) lessons are hidden from students in
    both the lesson list and the dashboard counts; writers see totals."""
    from app.models.user import Role

    fake = fake_storage
    await create_user_in_db("sl4@x.com", "password123", role=Role.teacher)
    await create_user_in_db("sl5@x.com", "password123", role=Role.student)
    t = await _tokens(client, "sl4@x.com", "password123")
    s = await _tokens(client, "sl5@x.com", "password123")
    th = {"Authorization": f"Bearer {t['access_token']}"}
    sh = {"Authorization": f"Bearer {s['access_token']}"}
    course = await _course(client, t["access_token"])

    for title in ("Ready", "Draft"):
        created = await client.post(
            f"/api/v1/courses/{course['id']}/lessons", json={"title": title}, headers=th
        )
        lid = created.json()["id"]
        if title == "Ready":
            up = (
                await client.post(
                    f"/api/v1/lessons/{lid}/upload-url",
                    json={"content_type": "audio/mpeg"},
                    headers=th,
                )
            ).json()
            fake.objects.add(up["object_key"])
            assert (
                await client.post(
                    f"/api/v1/lessons/{lid}/confirm",
                    json={"object_key": up["object_key"]},
                    headers=th,
                )
            ).status_code == 200

    code = (await client.post(f"/api/v1/courses/{course['id']}/codes", json={}, headers=th)).json()
    join = (
        await client.post(
            "/api/v1/enrollments/join",
            json={"code": code["code"], "display_name": "S"},
            headers=sh,
        )
    ).json()
    assert (
        await client.post(f"/api/v1/enrollments/{join['id']}/approve", headers=th)
    ).status_code == 200

    # Writer sees both; student sees only the ready one.
    mine = await client.get(f"/api/v1/courses/{course['id']}/lessons", headers=th)
    assert mine.status_code == 200, mine.text
    assert {lesson["title"] for lesson in mine.json()} == {"Ready", "Draft"}
    theirs = await client.get(f"/api/v1/courses/{course['id']}/lessons", headers=sh)
    assert theirs.status_code == 200, theirs.text
    assert [lesson["title"] for lesson in theirs.json()] == ["Ready"]

    teacher_dash = await client.get("/api/v1/dashboard", headers=th)
    assert teacher_dash.json()["items"][0]["lesson_count"] == 2
    student_dash = await client.get("/api/v1/dashboard", headers=sh)
    item = student_dash.json()["items"][0]
    assert item["lesson_count"] == 1
    assert item["ready_count"] == 1
