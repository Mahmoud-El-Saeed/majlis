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
    course = await _book_course(client, t["access_token"])

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
    course = await _book_course(client, t["access_token"])
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


async def _book_course(client, token, title="Book", book="Kitab"):
    r = await client.post(
        "/api/v1/courses",
        json={"title": title, "book_title": book},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201, r.text
    return r.json()


async def test_pages_rejected_on_general_course(client):
    """Ticket 16: pages range is meaningless without a book — rejected on
    general courses at create and on update, in both directions."""
    from app.models.user import Role

    await create_user_in_db("pg@x.com", "password123", role=Role.teacher)
    t = await _tokens(client, "pg@x.com", "password123")
    h = {"Authorization": f"Bearer {t['access_token']}"}
    general = await _course(client, t["access_token"], title="Topic")

    r = await client.post(
        f"/api/v1/courses/{general['id']}/lessons",
        json={"title": "L1", "pages_from": 1, "pages_to": 5},
        headers=h,
    )
    assert r.status_code == 400, r.text

    ok = await client.post(
        f"/api/v1/courses/{general['id']}/lessons",
        json={"title": "L1"},
        headers=h,
    )
    assert ok.status_code == 201, ok.text
    r = await client.put(
        f"/api/v1/lessons/{ok.json()['id']}", json={"pages_from": 1}, headers=h
    )
    assert r.status_code == 400, r.text


async def test_lesson_description_round_trip(client):
    """Ticket 16: optional lesson description saved at create and edited."""
    from app.models.user import Role

    await create_user_in_db("ld@x.com", "password123", role=Role.teacher)
    t = await _tokens(client, "ld@x.com", "password123")
    h = {"Authorization": f"Bearer {t['access_token']}"}
    course = await _book_course(client, t["access_token"])

    r = await client.post(
        f"/api/v1/courses/{course['id']}/lessons",
        json={"title": "L1", "description": "Intro night"},
        headers=h,
    )
    assert r.status_code == 201, r.text
    assert r.json()["description"] == "Intro night"

    r = await client.put(
        f"/api/v1/lessons/{r.json()['id']}", json={"description": "Revised"}, headers=h
    )
    assert r.status_code == 200, r.text
    assert r.json()["description"] == "Revised"


async def test_legacy_general_lesson_with_pages_stays_editable(client):
    """Ticket 16 review: pre-16 general lessons holding stored pages are
    'kept but hidden' — edits leaving pages untouched stay allowed."""
    import uuid

    from app.models.lesson import Lesson
    from app.models.user import Role
    from tests.helpers import open_db_session

    await create_user_in_db("lg@x.com", "password123", role=Role.teacher)
    t = await _tokens(client, "lg@x.com", "password123")
    h = {"Authorization": f"Bearer {t['access_token']}"}
    general = await _course(client, t["access_token"], title="Topic")
    async with open_db_session() as session:
        session.add(
            Lesson(
                course_id=uuid.UUID(general["id"]),
                title="Legacy",
                pages_from=3,
                pages_to=9,
            )
        )
        await session.commit()
    lst = await client.get(f"/api/v1/courses/{general['id']}/lessons", headers=h)
    lid = lst.json()[0]["id"]

    r = await client.put(f"/api/v1/lessons/{lid}", json={"title": "Legacy v2"}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "Legacy v2"
    assert r.json()["pages_from"] == 3

    r = await client.put(f"/api/v1/lessons/{lid}", json={"pages_from": 4}, headers=h)
    assert r.status_code == 400, r.text


async def test_lesson_list_returns_oldest_first_and_stays_ordered_after_delete(client):
    """Ordering contract: lesson list is created_at ascending (old->new display index)."""
    import uuid
    from datetime import UTC, datetime

    from sqlalchemy import update

    from app.models.lesson import Lesson
    from app.models.user import Role
    from tests.helpers import open_db_session

    await create_user_in_db("ord_t@x.com", "password123", role=Role.teacher)
    t = await _tokens(client, "ord_t@x.com", "password123")
    h = {"Authorization": f"Bearer {t['access_token']}"}
    course = await _course(client, t["access_token"], title="Ordered")
    ids: list[str] = []
    for title in ("L1", "L2", "L3"):
        r = await client.post(
            f"/api/v1/courses/{course['id']}/lessons", json={"title": title}, headers=h
        )
        assert r.status_code == 201, r.text
        ids.append(r.json()["id"])
    stamps = [
        datetime(2024, 1, 1, tzinfo=UTC),
        datetime(2024, 1, 2, tzinfo=UTC),
        datetime(2024, 1, 3, tzinfo=UTC),
    ]
    async with open_db_session() as session:
        for lid, ts in zip(ids, stamps, strict=True):
            await session.execute(
                update(Lesson).where(Lesson.id == uuid.UUID(lid)).values(created_at=ts)
            )
        await session.commit()

    lst = await client.get(f"/api/v1/courses/{course['id']}/lessons", headers=h)
    assert lst.status_code == 200, lst.text
    assert [lesson["title"] for lesson in lst.json()] == ["L1", "L2", "L3"]

    mid = next(lesson for lesson in lst.json() if lesson["title"] == "L2")
    assert (await client.delete(f"/api/v1/lessons/{mid['id']}", headers=h)).status_code == 204
    lst2 = await client.get(f"/api/v1/courses/{course['id']}/lessons", headers=h)
    assert lst2.status_code == 200, lst2.text
    assert [lesson["title"] for lesson in lst2.json()] == ["L1", "L3"]
