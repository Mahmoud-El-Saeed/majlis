"""Ticket 03 red phase: Course (book) CRUD with owner-teacher model.

Contract under test:
- POST /courses: admin + teacher only (student 403, anon 401).
- Owner = creator; admin may pass owner_id to assign a teacher.
- PUT/DELETE: admin (any) or owner-teacher only; other teachers 403.
- GET list/detail: any authenticated user (permissive until ticket 04).
"""

from app.models.user import Role
from tests.helpers import create_user_in_db, login


async def _tokens(client, email, password):
    return await login(client, email, password)


async def test_teacher_can_create_course_and_owns_it(client):
    await create_user_in_db("t1@x.com", "password123", role=Role.teacher)
    toks = await _tokens(client, "t1@x.com", "password123")
    me = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {toks['access_token']}"}
    )
    teacher_id = me.json()["id"]

    r = await client.post(
        "/api/v1/courses",
        json={"title": "Sharh Kitab", "description": "d", "book_title": "Book"},
        headers={"Authorization": f"Bearer {toks['access_token']}"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["title"] == "Sharh Kitab"
    assert body["created_by"] == teacher_id
    assert body["organization_id"] is None


async def test_student_cannot_create_course(client):
    await create_user_in_db("s1@x.com", "password123")
    toks = await _tokens(client, "s1@x.com", "password123")
    r = await client.post(
        "/api/v1/courses",
        json={"title": "X"},
        headers={"Authorization": f"Bearer {toks['access_token']}"},
    )
    assert r.status_code == 403, r.text


async def test_anon_cannot_create_course(client):
    r = await client.post("/api/v1/courses", json={"title": "X"})
    assert r.status_code in (401, 403), r.text


async def test_course_read_gated_until_approved(client):
    from app.models.user import Role

    await create_user_in_db("tc@x.com", "password123", role=Role.teacher)
    await create_user_in_db("sc@x.com", "password123", role=Role.student)
    tt = await _tokens(client, "tc@x.com", "password123")
    st = await _tokens(client, "sc@x.com", "password123")
    h = {"Authorization": f"Bearer {tt['access_token']}"}
    created = await client.post("/api/v1/courses", json={"title": "Book A"}, headers=h)
    assert created.status_code == 201, created.text
    cid = created.json()["id"]

    sh = {"Authorization": f"Bearer {st['access_token']}"}
    # Ticket 04 gate: non-members see no courses and get 403 on detail.
    lst = await client.get("/api/v1/courses", headers=sh)
    assert lst.status_code == 200, lst.text
    assert all(c["id"] != cid for c in lst.json())
    one = await client.get(f"/api/v1/courses/{cid}", headers=sh)
    assert one.status_code == 403, one.text

    # After join + approve the course becomes visible.
    code = await client.post(f"/api/v1/courses/{cid}/codes", json={}, headers=h)
    assert code.status_code == 201, code.text
    join = await client.post(
        "/api/v1/enrollments/join",
        json={"code": code.json()["code"], "display_name": "S"},
        headers=sh,
    )
    assert join.status_code == 201, join.text
    eid = join.json()["id"]
    assert (await client.post(f"/api/v1/enrollments/{eid}/approve", headers=h)).status_code == 200
    lst2 = await client.get("/api/v1/courses", headers=sh)
    assert any(c["id"] == cid for c in lst2.json())
    one2 = await client.get(f"/api/v1/courses/{cid}", headers=sh)
    assert one2.status_code == 200, one2.text


async def test_owner_teacher_can_edit_own_but_other_teacher_forbidden(client):
    from app.models.user import Role

    await create_user_in_db("own@x.com", "password123", role=Role.teacher)
    await create_user_in_db("oth@x.com", "password123", role=Role.teacher)
    await create_user_in_db("adm@x.com", "password123", role=Role.admin)
    own = await _tokens(client, "own@x.com", "password123")
    oth = await _tokens(client, "oth@x.com", "password123")
    adm = await _tokens(client, "adm@x.com", "password123")

    created = await client.post(
        "/api/v1/courses",
        json={"title": "Owned"},
        headers={"Authorization": f"Bearer {own['access_token']}"},
    )
    assert created.status_code == 201, created.text
    cid = created.json()["id"]

    r_other = await client.put(
        f"/api/v1/courses/{cid}",
        json={"title": "Hijack"},
        headers={"Authorization": f"Bearer {oth['access_token']}"},
    )
    assert r_other.status_code == 403, r_other.text

    r_own = await client.put(
        f"/api/v1/courses/{cid}",
        json={"title": "Edited"},
        headers={"Authorization": f"Bearer {own['access_token']}"},
    )
    assert r_own.status_code == 200, r_own.text
    assert r_own.json()["title"] == "Edited"

    r_adm = await client.put(
        f"/api/v1/courses/{cid}",
        json={"description": "admin edit"},
        headers={"Authorization": f"Bearer {adm['access_token']}"},
    )
    assert r_adm.status_code == 200, r_adm.text


async def test_admin_can_assign_owner_on_create(client):
    from app.models.user import Role

    teacher_id = await create_user_in_db("asg@x.com", "password123", role=Role.teacher)
    await create_user_in_db("adm2@x.com", "password123", role=Role.admin)
    adm = await _tokens(client, "adm2@x.com", "password123")
    r = await client.post(
        "/api/v1/courses",
        json={"title": "Assigned", "owner_id": teacher_id},
        headers={"Authorization": f"Bearer {adm['access_token']}"},
    )
    assert r.status_code == 201, r.text
    assert r.json()["created_by"] == teacher_id


async def test_teacher_cannot_spoof_owner_on_create(client):
    from app.models.user import Role

    await create_user_in_db("sp1@x.com", "password123", role=Role.teacher)
    await create_user_in_db("sp2@x.com", "password123", role=Role.teacher)
    t1 = await _tokens(client, "sp1@x.com", "password123")
    me = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {t1['access_token']}"}
    )
    other_me_resp = await client.post(
        "/api/v1/auth/login", json={"email": "sp2@x.com", "password": "password123"}
    )
    other_id = (
        await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {other_me_resp.json()['access_token']}"},
        )
    ).json()["id"]

    r = await client.post(
        "/api/v1/courses",
        json={"title": "Spoof", "owner_id": other_id},
        headers={"Authorization": f"Bearer {t1['access_token']}"},
    )
    assert r.status_code == 201, r.text
    # Spoof ignored: owner stays the creator.
    assert r.json()["created_by"] == me.json()["id"]


async def test_delete_ownership(client):
    from app.models.user import Role

    await create_user_in_db("d1@x.com", "password123", role=Role.teacher)
    await create_user_in_db("d2@x.com", "password123", role=Role.teacher)
    t1 = await _tokens(client, "d1@x.com", "password123")
    t2 = await _tokens(client, "d2@x.com", "password123")
    created = await client.post(
        "/api/v1/courses",
        json={"title": "Del"},
        headers={"Authorization": f"Bearer {t1['access_token']}"},
    )
    cid = created.json()["id"]
    r_other = await client.delete(
        f"/api/v1/courses/{cid}", headers={"Authorization": f"Bearer {t2['access_token']}"}
    )
    assert r_other.status_code == 403, r_other.text
    r_own = await client.delete(
        f"/api/v1/courses/{cid}", headers={"Authorization": f"Bearer {t1['access_token']}"}
    )
    assert r_own.status_code == 204, r_own.text


async def test_course_not_found(client):
    from app.models.user import Role

    await create_user_in_db("nf@x.com", "password123", role=Role.teacher)
    t = await _tokens(client, "nf@x.com", "password123")
    r = await client.get(
        "/api/v1/courses/00000000-0000-0000-0000-000000000000",
        headers={"Authorization": f"Bearer {t['access_token']}"},
    )
    assert r.status_code == 404, r.text
