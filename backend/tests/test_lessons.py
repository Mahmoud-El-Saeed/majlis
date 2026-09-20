"""Ticket 03 red phase: Lesson (recording session) CRUD with ownership via parent course.

Contract under test:
- Writes: admin (any course) or owner-teacher of the parent course only.
- Reads: any authenticated user (permissive until ticket 04).
- pages_from <= pages_to validated; media_type V1 audio-only.
- transcript_voice/book TEXT round-trip; status defaults pending (client cannot escalate).
"""

from tests.helpers import create_user_in_db, login


async def _tokens(client, email, password):
    return await login(client, email, password)


async def _course(client, token, title="Book"):
    r = await client.post(
        "/api/v1/courses", json={"title": title}, headers={"Authorization": f"Bearer {token}"}
    )
    assert r.status_code == 201, r.text
    return r.json()


async def test_owner_teacher_and_admin_can_create_lesson(client):
    from app.models.user import Role

    await create_user_in_db("lt1@x.com", "password123", role=Role.teacher)
    await create_user_in_db("lad@x.com", "password123", role=Role.admin)
    t = await _tokens(client, "lt1@x.com", "password123")
    a = await _tokens(client, "lad@x.com", "password123")
    course = await _course(client, t["access_token"])

    payload = {
        "title": "Lesson 1",
        "pages_from": 1,
        "pages_to": 10,
        "transcript_voice": "قال الشيخ ...",
        "transcript_book": "نص الكتاب ...",
    }
    r = await client.post(
        f"/api/v1/courses/{course['id']}/lessons",
        json=payload,
        headers={"Authorization": f"Bearer {t['access_token']}"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["transcript_voice"] == "قال الشيخ ..."
    assert body["status"] == "pending"
    assert body["media_type"] == "audio"

    r2 = await client.post(
        f"/api/v1/courses/{course['id']}/lessons",
        json={"title": "Lesson 2"},
        headers={"Authorization": f"Bearer {a['access_token']}"},
    )
    assert r2.status_code == 201, r2.text


async def test_other_teacher_and_student_cannot_create_lesson(client):
    from app.models.user import Role

    await create_user_in_db("lo@x.com", "password123", role=Role.teacher)
    await create_user_in_db("lx@x.com", "password123", role=Role.teacher)
    await create_user_in_db("ls@x.com", "password123", role=Role.student)
    to = await _tokens(client, "lo@x.com", "password123")
    tx = await _tokens(client, "lx@x.com", "password123")
    st = await _tokens(client, "ls@x.com", "password123")
    course = await _course(client, to["access_token"])

    r = await client.post(
        f"/api/v1/courses/{course['id']}/lessons",
        json={"title": "Hijack"},
        headers={"Authorization": f"Bearer {tx['access_token']}"},
    )
    assert r.status_code == 403, r.text

    r2 = await client.post(
        f"/api/v1/courses/{course['id']}/lessons",
        json={"title": "Student"},
        headers={"Authorization": f"Bearer {st['access_token']}"},
    )
    assert r2.status_code == 403, r2.text


async def test_pages_range_validated(client):
    from app.models.user import Role

    await create_user_in_db("lp@x.com", "password123", role=Role.teacher)
    t = await _tokens(client, "lp@x.com", "password123")
    course = await _course(client, t["access_token"])
    r = await client.post(
        f"/api/v1/courses/{course['id']}/lessons",
        json={"title": "Bad range", "pages_from": 20, "pages_to": 5},
        headers={"Authorization": f"Bearer {t['access_token']}"},
    )
    assert r.status_code in (400, 422), r.text


async def test_media_type_audio_only(client):
    from app.models.user import Role

    await create_user_in_db("lm@x.com", "password123", role=Role.teacher)
    t = await _tokens(client, "lm@x.com", "password123")
    course = await _course(client, t["access_token"])
    r = await client.post(
        f"/api/v1/courses/{course['id']}/lessons",
        json={"title": "Video?", "media_type": "video"},
        headers={"Authorization": f"Bearer {t['access_token']}"},
    )
    assert r.status_code in (400, 422), r.text


async def test_transcript_edit_round_trip_and_status_locked(client):
    from app.models.user import Role

    await create_user_in_db("le@x.com", "password123", role=Role.teacher)
    t = await _tokens(client, "le@x.com", "password123")
    course = await _course(client, t["access_token"])
    h = {"Authorization": f"Bearer {t['access_token']}"}
    created = await client.post(
        f"/api/v1/courses/{course['id']}/lessons", json={"title": "T"}, headers=h
    )
    lid = created.json()["id"]
    assert created.json()["status"] == "pending"

    upd = await client.put(
        f"/api/v1/lessons/{lid}",
        json={"transcript_voice": "v2", "transcript_book": "b2", "status": "ready"},
        headers=h,
    )
    assert upd.status_code == 200, upd.text
    assert upd.json()["transcript_voice"] == "v2"
    assert upd.json()["transcript_book"] == "b2"
    # Client escalation ignored: storage ticket owns processing -> ready.
    assert upd.json()["status"] == "pending"


async def test_student_lesson_reads_gated_until_approved(client):
    from app.models.user import Role

    await create_user_in_db("lr1@x.com", "password123", role=Role.teacher)
    await create_user_in_db("lr2@x.com", "password123", role=Role.student)
    t = await _tokens(client, "lr1@x.com", "password123")
    s = await _tokens(client, "lr2@x.com", "password123")
    course = await _course(client, t["access_token"])
    created = await client.post(
        f"/api/v1/courses/{course['id']}/lessons",
        json={"title": "Readable"},
        headers={"Authorization": f"Bearer {t['access_token']}"},
    )
    lid = created.json()["id"]
    sh = {"Authorization": f"Bearer {s['access_token']}"}
    th = {"Authorization": f"Bearer {t['access_token']}"}
    # Ticket 04 gate: lessons stay private until approval.
    assert (
        await client.get(f"/api/v1/courses/{course['id']}/lessons", headers=sh)
    ).status_code == 403
    assert (await client.get(f"/api/v1/lessons/{lid}", headers=sh)).status_code == 403

    code = await client.post(f"/api/v1/courses/{course['id']}/codes", json={}, headers=th)
    join = await client.post(
        "/api/v1/enrollments/join",
        json={"code": code.json()["code"], "display_name": "S"},
        headers=sh,
    )
    assert (
        await client.post(f"/api/v1/enrollments/{join.json()['id']}/approve", headers=th)
    ).status_code == 200
    lst = await client.get(f"/api/v1/courses/{course['id']}/lessons", headers=sh)
    assert lst.status_code == 200, lst.text
    one = await client.get(f"/api/v1/lessons/{lid}", headers=sh)
    assert one.status_code == 200, one.text


async def test_lesson_update_delete_ownership(client):
    from app.models.user import Role

    await create_user_in_db("lu1@x.com", "password123", role=Role.teacher)
    await create_user_in_db("lu2@x.com", "password123", role=Role.teacher)
    t1 = await _tokens(client, "lu1@x.com", "password123")
    t2 = await _tokens(client, "lu2@x.com", "password123")
    course = await _course(client, t1["access_token"])
    created = await client.post(
        f"/api/v1/courses/{course['id']}/lessons",
        json={"title": "Own"},
        headers={"Authorization": f"Bearer {t1['access_token']}"},
    )
    lid = created.json()["id"]
    h2 = {"Authorization": f"Bearer {t2['access_token']}"}
    assert (
        await client.put(f"/api/v1/lessons/{lid}", json={"title": "X"}, headers=h2)
    ).status_code == 403
    assert (await client.delete(f"/api/v1/lessons/{lid}", headers=h2)).status_code == 403
    h1 = {"Authorization": f"Bearer {t1['access_token']}"}
    assert (
        await client.put(f"/api/v1/lessons/{lid}", json={"title": "Y"}, headers=h1)
    ).status_code == 200
    assert (await client.delete(f"/api/v1/lessons/{lid}", headers=h1)).status_code == 204


async def test_lesson_missing_course_404(client):
    from app.models.user import Role

    await create_user_in_db("ln@x.com", "password123", role=Role.admin)
    a = await _tokens(client, "ln@x.com", "password123")
    r = await client.post(
        "/api/v1/courses/00000000-0000-0000-0000-000000000000/lessons",
        json={"title": "Ghost"},
        headers={"Authorization": f"Bearer {a['access_token']}"},
    )
    assert r.status_code == 404, r.text
