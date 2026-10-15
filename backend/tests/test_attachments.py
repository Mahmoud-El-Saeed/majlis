"""Ticket 06: lesson PDF attachments — teacher upload, student view/download.

Contract:
- POST /courses/{cid}/lessons/{lid}/attachments {title, description} (writer only)
- POST /lesson-attachments/{id}/upload-url {content_type, file_ext} PDF-only
- POST /lesson-attachments/{id}/confirm {object_key} verifies existence
- GET /lesson-attachments/{id}/file?disposition=inline|attachment (can_view)
- GET list, PUT rename, DELETE (writer vs viewer gates)
- Unready file -> 409; pending student -> 403; non-PDF -> 400.
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


async def _lesson(client, token, course_id, title="L1"):
    r = await client.post(
        f"/api/v1/courses/{course_id}/lessons",
        json={"title": title},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _setup_teacher_lesson(client):
    from app.models.user import Role

    await create_user_in_db("att@x.com", "password123", role=Role.teacher)
    t = await _tokens(client, "att@x.com", "password123")
    course = await _course(client, t["access_token"])
    lesson = await _lesson(client, t["access_token"], course["id"])
    return t, course, lesson


async def test_create_attachment_requires_title_and_writer(client, fake_storage):
    from app.models.user import Role

    _ = fake_storage
    t, course, lesson = await _setup_teacher_lesson(client)
    await create_user_in_db("atts@x.com", "password123", role=Role.student)
    s = await _tokens(client, "atts@x.com", "password123")
    th = {"Authorization": f"Bearer {t['access_token']}"}
    sh = {"Authorization": f"Bearer {s['access_token']}"}

    r = await client.post(
        f"/api/v1/courses/{course['id']}/lessons/{lesson['id']}/attachments",
        json={"title": "مذكرة الدرس", "description": "ملخص الصفحات"},
        headers=th,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["title"] == "مذكرة الدرس"
    assert body["description"] == "ملخص الصفحات"
    assert body["has_file"] is False
    assert body["file_key"] is None

    # Student cannot create.
    r2 = await client.post(
        f"/api/v1/courses/{course['id']}/lessons/{lesson['id']}/attachments",
        json={"title": "X"},
        headers=sh,
    )
    assert r2.status_code == 403, r2.text

    # Title required.
    r3 = await client.post(
        f"/api/v1/courses/{course['id']}/lessons/{lesson['id']}/attachments",
        json={"title": ""},
        headers=th,
    )
    assert r3.status_code == 422, r3.text


async def test_upload_url_pdf_only_and_confirm_flow(client, fake_storage):
    fake = fake_storage
    t, course, lesson = await _setup_teacher_lesson(client)
    th = {"Authorization": f"Bearer {t['access_token']}"}

    created = await client.post(
        f"/api/v1/courses/{course['id']}/lessons/{lesson['id']}/attachments",
        json={"title": "Handout"},
        headers=th,
    )
    aid = created.json()["id"]

    # Non-PDF rejected.
    r = await client.post(
        f"/api/v1/lesson-attachments/{aid}/upload-url",
        json={"content_type": "audio/mpeg", "file_ext": ".mp3"},
        headers=th,
    )
    assert r.status_code == 400, r.text

    up = await client.post(
        f"/api/v1/lesson-attachments/{aid}/upload-url",
        json={"content_type": "application/pdf", "file_ext": ".pdf"},
        headers=th,
    )
    assert up.status_code == 200, up.text
    key = up.json()["object_key"]
    assert key.startswith(f"courses/{course['id']}/lessons/{lesson['id']}/attachments/{aid}")
    assert key.endswith(".pdf")

    # Confirm without object -> 409.
    r2 = await client.post(
        f"/api/v1/lesson-attachments/{aid}/confirm",
        json={"object_key": key},
        headers=th,
    )
    assert r2.status_code == 409, r2.text

    # Simulate browser PUT then confirm.
    fake.objects.add(key)
    r3 = await client.post(
        f"/api/v1/lesson-attachments/{aid}/confirm",
        json={"object_key": key},
        headers=th,
    )
    assert r3.status_code == 200, r3.text
    assert r3.json()["has_file"] is True
    assert r3.json()["file_key"] == key


async def test_file_gated_and_disposition(client, fake_storage):
    from app.models.user import Role

    fake = fake_storage
    t, course, lesson = await _setup_teacher_lesson(client)
    await create_user_in_db("attst@x.com", "password123", role=Role.student)
    s = await _tokens(client, "attst@x.com", "password123")
    th = {"Authorization": f"Bearer {t['access_token']}"}
    sh = {"Authorization": f"Bearer {s['access_token']}"}

    created = await client.post(
        f"/api/v1/courses/{course['id']}/lessons/{lesson['id']}/attachments",
        json={"title": "Handout"},
        headers=th,
    )
    aid = created.json()["id"]
    up = (
        await client.post(
            f"/api/v1/lesson-attachments/{aid}/upload-url",
            json={"content_type": "application/pdf"},
            headers=th,
        )
    ).json()
    fake.objects.add(up["object_key"])
    assert (
        await client.post(
            f"/api/v1/lesson-attachments/{aid}/confirm",
            json={"object_key": up["object_key"]},
            headers=th,
        )
    ).status_code == 200

    # Unready file -> 409 (second attachment without confirm).
    created2 = await client.post(
        f"/api/v1/courses/{course['id']}/lessons/{lesson['id']}/attachments",
        json={"title": "Draft"},
        headers=th,
    )
    assert (
        await client.get(f"/api/v1/lesson-attachments/{created2.json()['id']}/file", headers=th)
    ).status_code == 409

    # Pending student gated out (not enrolled at all -> 403).
    assert (
        await client.get(f"/api/v1/lesson-attachments/{aid}/file", headers=sh)
    ).status_code == 403

    # Approve then both dispositions work.
    code = await client.post(f"/api/v1/courses/{course['id']}/codes", json={}, headers=th)
    join = await client.post(
        "/api/v1/enrollments/join",
        json={"code": code.json()["code"], "display_name": "S"},
        headers=sh,
    )
    assert (
        await client.post(f"/api/v1/enrollments/{join.json()['id']}/approve", headers=th)
    ).status_code == 200

    r = await client.get(f"/api/v1/lesson-attachments/{aid}/file", headers=sh)
    assert r.status_code == 200, r.text
    assert r.json()["file_url"].startswith("https://fake-r2/")
    assert "disp=inline" in r.json()["file_url"]
    assert "Handout" in r.json()["file_url"]
    assert fake.last_get is not None and fake.last_get["disposition"] == "inline"

    r2 = await client.get(
        f"/api/v1/lesson-attachments/{aid}/file?disposition=attachment", headers=sh
    )
    assert r2.status_code == 200, r2.text
    assert "disp=attachment" in r2.json()["file_url"]
    assert fake.last_get is not None and fake.last_get["disposition"] == "attachment"


async def test_rename_and_delete_and_list_gates(client, fake_storage):
    from app.models.user import Role

    _ = fake_storage
    t, course, lesson = await _setup_teacher_lesson(client)
    await create_user_in_db("attl@x.com", "password123", role=Role.student)
    s = await _tokens(client, "attl@x.com", "password123")
    th = {"Authorization": f"Bearer {t['access_token']}"}
    sh = {"Authorization": f"Bearer {s['access_token']}"}

    created = await client.post(
        f"/api/v1/courses/{course['id']}/lessons/{lesson['id']}/attachments",
        json={"title": "Old"},
        headers=th,
    )
    aid = created.json()["id"]

    # Student list gated out before approval.
    assert (
        await client.get(
            f"/api/v1/courses/{course['id']}/lessons/{lesson['id']}/attachments", headers=sh
        )
    ).status_code == 403

    # Rename.
    r = await client.put(
        f"/api/v1/lesson-attachments/{aid}",
        json={"title": "New", "description": "desc"},
        headers=th,
    )
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "New"

    # Student cannot rename/delete.
    assert (
        await client.put(f"/api/v1/lesson-attachments/{aid}", json={"title": "X"}, headers=sh)
    ).status_code == 403
    assert (await client.delete(f"/api/v1/lesson-attachments/{aid}", headers=sh)).status_code in (
        403,
        404,
    )

    # Teacher delete works.
    assert (await client.delete(f"/api/v1/lesson-attachments/{aid}", headers=th)).status_code == 204
    lst = await client.get(
        f"/api/v1/courses/{course['id']}/lessons/{lesson['id']}/attachments", headers=th
    )
    assert lst.status_code == 200 and lst.json() == []


async def test_course_lesson_mismatch_is_404(client, fake_storage):
    _ = fake_storage
    t, course, lesson = await _setup_teacher_lesson(client)
    other = await _course(client, t["access_token"], "Other")
    th = {"Authorization": f"Bearer {t['access_token']}"}

    r = await client.post(
        f"/api/v1/courses/{other['id']}/lessons/{lesson['id']}/attachments",
        json={"title": "X"},
        headers=th,
    )
    assert r.status_code == 404, r.text
    r2 = await client.get(
        f"/api/v1/courses/{other['id']}/lessons/{lesson['id']}/attachments", headers=th
    )
    assert r2.status_code == 404, r2.text


async def test_student_list_hides_unready_and_file_keys(client, fake_storage):
    """Review fix: approved students see only ready files and never the
    internal R2 file_key (files go via /file, like audio via /play)."""
    from app.models.user import Role

    fake = fake_storage
    t, course, lesson = await _setup_teacher_lesson(client)
    await create_user_in_db("attf@x.com", "password123", role=Role.student)
    s = await _tokens(client, "attf@x.com", "password123")
    th = {"Authorization": f"Bearer {t['access_token']}"}
    sh = {"Authorization": f"Bearer {s['access_token']}"}

    ready = (
        await client.post(
            f"/api/v1/courses/{course['id']}/lessons/{lesson['id']}/attachments",
            json={"title": "Ready"},
            headers=th,
        )
    ).json()
    await client.post(
        f"/api/v1/courses/{course['id']}/lessons/{lesson['id']}/attachments",
        json={"title": "Draft"},
        headers=th,
    )
    up = (
        await client.post(
            f"/api/v1/lesson-attachments/{ready['id']}/upload-url",
            json={"content_type": "application/pdf"},
            headers=th,
        )
    ).json()
    fake.objects.add(up["object_key"])
    assert (
        await client.post(
            f"/api/v1/lesson-attachments/{ready['id']}/confirm",
            json={"object_key": up["object_key"]},
            headers=th,
        )
    ).status_code == 200

    # Teacher sees both rows with keys.
    mine = await client.get(
        f"/api/v1/courses/{course['id']}/lessons/{lesson['id']}/attachments", headers=th
    )
    assert mine.status_code == 200, mine.text
    assert len(mine.json()) == 2
    assert all(r["file_key"] is not None or not r["has_file"] for r in mine.json())

    # Approve the student: one ready row, no file_key.
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

    theirs = await client.get(
        f"/api/v1/courses/{course['id']}/lessons/{lesson['id']}/attachments", headers=sh
    )
    assert theirs.status_code == 200, theirs.text
    rows = theirs.json()
    assert len(rows) == 1
    assert rows[0]["title"] == "Ready"
    assert rows[0]["has_file"] is True
    assert rows[0]["file_key"] is None


async def test_lesson_attachment_accepts_images(client, fake_storage):
    """Ticket 16: lesson handouts accept PDF or images (png/jpeg/webp)."""
    fake = fake_storage
    t, course, lesson = await _setup_teacher_lesson(client)
    th = {"Authorization": f"Bearer {t['access_token']}"}
    created = await client.post(
        f"/api/v1/courses/{course['id']}/lessons/{lesson['id']}/attachments",
        json={"title": "Board photo"},
        headers=th,
    )
    aid = created.json()["id"]

    up = await client.post(
        f"/api/v1/lesson-attachments/{aid}/upload-url",
        json={"content_type": "image/png", "file_ext": ".png"},
        headers=th,
    )
    assert up.status_code == 200, up.text
    key = up.json()["object_key"]
    assert key.endswith(".png")

    fake.put_object(key, size=1024)
    r = await client.post(
        f"/api/v1/lesson-attachments/{aid}/confirm",
        json={"object_key": key},
        headers=th,
    )
    assert r.status_code == 200, r.text
    assert r.json()["content_type"] == "image/png"

    # Mismatched type/ext still rejected.
    up2 = await client.post(
        f"/api/v1/lesson-attachments/{aid}/upload-url",
        json={"content_type": "image/png", "file_ext": ".pdf"},
        headers=th,
    )
    assert up2.status_code == 400, up2.text


async def test_confirm_rejects_oversize_file(client, fake_storage, monkeypatch):
    """Ticket 16: 100MB/file cap enforced at confirm via stored size."""
    fake = fake_storage
    monkeypatch.setenv("ATTACHMENT_MAX_FILE_BYTES", "100")
    t, course, lesson = await _setup_teacher_lesson(client)
    th = {"Authorization": f"Bearer {t['access_token']}"}
    created = await client.post(
        f"/api/v1/courses/{course['id']}/lessons/{lesson['id']}/attachments",
        json={"title": "Big"},
        headers=th,
    )
    aid = created.json()["id"]
    up = await client.post(
        f"/api/v1/lesson-attachments/{aid}/upload-url",
        json={"content_type": "application/pdf", "file_ext": ".pdf"},
        headers=th,
    )
    key = up.json()["object_key"]
    fake.put_object(key, size=101)
    r = await client.post(
        f"/api/v1/lesson-attachments/{aid}/confirm",
        json={"object_key": key},
        headers=th,
    )
    assert r.status_code == 400, r.text
    assert "compress" in r.text.lower()


async def test_lesson_confirm_rejects_oversize_and_wrong_ext(client, fake_storage, monkeypatch):
    """Ticket 16 review: size/format rejections covered for lessons too."""
    fake = fake_storage
    monkeypatch.setenv("ATTACHMENT_MAX_FILE_BYTES", "100")
    t, course, lesson = await _setup_teacher_lesson(client)
    th = {"Authorization": f"Bearer {t['access_token']}"}
    created = await client.post(
        f"/api/v1/courses/{course['id']}/lessons/{lesson['id']}/attachments",
        json={"title": "Big image"},
        headers=th,
    )
    aid = created.json()["id"]
    up = await client.post(
        f"/api/v1/lesson-attachments/{aid}/upload-url",
        json={"content_type": "image/jpeg", "file_ext": ".jpg"},
        headers=th,
    )
    assert up.status_code == 200, up.text
    key = up.json()["object_key"]

    fake.put_object(key, size=101)
    r = await client.post(
        f"/api/v1/lesson-attachments/{aid}/confirm",
        json={"object_key": key},
        headers=th,
    )
    assert r.status_code == 400, r.text

    fake.put_object(key, size=10)
    r = await client.post(
        f"/api/v1/lesson-attachments/{aid}/confirm",
        json={"object_key": key},
        headers=th,
    )
    assert r.status_code == 200, r.text
    assert r.json()["content_type"] == "image/jpeg"
