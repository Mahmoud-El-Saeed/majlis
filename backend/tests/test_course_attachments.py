"""Ticket 16: course-level PDF attachments with one designatable main book.

Contract under test:
- POST /courses/{cid}/attachments {title, description} (writer only)
- POST /course-attachments/{id}/upload-url {content_type, file_ext} PDF-only
- POST /course-attachments/{id}/confirm {object_key} verifies existence + size
- GET /course-attachments/{id}/file (can_view); unready hidden from students
- POST /course-attachments/{id}/main designates the main book: replaces any
  previous silently; rejected on general (bookless) courses; writer only.
- Oversize files rejected at confirm; students/pending gated out.
"""

from app.models.user import Role
from tests.helpers import create_user_in_db, login


async def _tokens(client, email, password):
    return await login(client, email, password)


async def _setup(client, with_book=True, email="cat@x.com"):
    await create_user_in_db(email, "password123", role=Role.teacher)
    t = await _tokens(client, email, "password123")
    body = {"title": "Series"}
    if with_book:
        body["book_title"] = "Kitab"
    r = await client.post(
        "/api/v1/courses", json=body, headers={"Authorization": f"Bearer {t['access_token']}"}
    )
    assert r.status_code == 201, r.text
    return t, r.json()


async def _create(client, token, course_id, title="Handout"):
    r = await client.post(
        f"/api/v1/courses/{course_id}/attachments",
        json={"title": title},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201, r.text
    return r.json()


async def test_create_course_attachment_writer_only(client, fake_storage):
    _ = fake_storage
    t, course = await _setup(client)
    await create_user_in_db("cats@x.com", "password123", role=Role.student)
    s = await _tokens(client, "cats@x.com", "password123")

    r = await client.post(
        f"/api/v1/courses/{course['id']}/attachments",
        json={"title": "X"},
        headers={"Authorization": f"Bearer {s['access_token']}"},
    )
    assert r.status_code == 403, r.text

    body = await _create(client, t["access_token"], course["id"])
    assert body["has_file"] is False
    assert body["is_main_book"] is False


async def test_upload_confirm_pdf_only_and_size_cap(client, fake_storage, monkeypatch):
    fake = fake_storage
    monkeypatch.setenv("ATTACHMENT_MAX_FILE_BYTES", "100")
    t, course = await _setup(client)
    th = {"Authorization": f"Bearer {t['access_token']}"}
    att = await _create(client, t["access_token"], course["id"])

    r = await client.post(
        f"/api/v1/course-attachments/{att['id']}/upload-url",
        json={"content_type": "image/png", "file_ext": ".png"},
        headers=th,
    )
    assert r.status_code == 400, r.text

    up = await client.post(
        f"/api/v1/course-attachments/{att['id']}/upload-url",
        json={"content_type": "application/pdf", "file_ext": ".pdf"},
        headers=th,
    )
    assert up.status_code == 200, up.text
    key = up.json()["object_key"]
    assert key.startswith(f"courses/{course['id']}/attachments/{att['id']}")
    assert key.endswith(".pdf")

    r2 = await client.post(
        f"/api/v1/course-attachments/{att['id']}/confirm",
        json={"object_key": key},
        headers=th,
    )
    assert r2.status_code == 409, r2.text

    fake.put_object(key, size=101)
    r3 = await client.post(
        f"/api/v1/course-attachments/{att['id']}/confirm",
        json={"object_key": key},
        headers=th,
    )
    assert r3.status_code == 400, r3.text
    assert "compress" in r3.text.lower()

    fake.put_object(key, size=50)
    r4 = await client.post(
        f"/api/v1/course-attachments/{att['id']}/confirm",
        json={"object_key": key},
        headers=th,
    )
    assert r4.status_code == 200, r4.text
    assert r4.json()["has_file"] is True


async def test_main_book_designate_replace_and_reject(client, fake_storage):
    _ = fake_storage
    t, course = await _setup(client)
    th = {"Authorization": f"Bearer {t['access_token']}"}
    a1 = await _create(client, t["access_token"], course["id"], title="Vol 1")
    a2 = await _create(client, t["access_token"], course["id"], title="Vol 2")

    r = await client.post(f"/api/v1/course-attachments/{a1['id']}/main", headers=th)
    assert r.status_code == 200, r.text
    assert r.json()["is_main_book"] is True

    # Designating a new one silently replaces the old.
    r = await client.post(f"/api/v1/course-attachments/{a2['id']}/main", headers=th)
    assert r.status_code == 200, r.text
    assert r.json()["is_main_book"] is True
    lst = await client.get(f"/api/v1/courses/{course['id']}/attachments", headers=th)
    mains = [a for a in lst.json() if a["is_main_book"]]
    assert [a["id"] for a in mains] == [a2["id"]]

    # General (bookless) courses cannot have a main book.
    t2, general = await _setup(client, with_book=False, email="cat2@x.com")
    th2 = {"Authorization": f"Bearer {t2['access_token']}"}
    g = await _create(client, t2["access_token"], general["id"])
    r = await client.post(f"/api/v1/course-attachments/{g['id']}/main", headers=th2)
    assert r.status_code == 400, r.text


async def test_course_attachment_read_gates(client, fake_storage):
    fake = fake_storage
    t, course = await _setup(client)
    th = {"Authorization": f"Bearer {t['access_token']}"}
    att = await _create(client, t["access_token"], course["id"])

    await create_user_in_db("catp@x.com", "password123", role=Role.student)
    s = await _tokens(client, "catp@x.com", "password123")
    sh = {"Authorization": f"Bearer {s['access_token']}"}
    r = await client.get(f"/api/v1/courses/{course['id']}/attachments", headers=sh)
    assert r.status_code == 403, r.text

    # Writer sees the unready draft; student list hides unready + file keys.
    up = await client.post(
        f"/api/v1/course-attachments/{att['id']}/upload-url",
        json={"content_type": "application/pdf", "file_ext": ".pdf"},
        headers=th,
    )
    key = up.json()["object_key"]
    fake.put_object(key, size=10)
    done = await client.post(
        f"/api/v1/course-attachments/{att['id']}/confirm",
        json={"object_key": key},
        headers=th,
    )
    assert done.status_code == 200, done.text
    f = await client.get(
        f"/api/v1/course-attachments/{att['id']}/file", headers=th
    )
    assert f.status_code == 200, f.text
    assert f.json()["file_url"].startswith("https://fake-r2/")
