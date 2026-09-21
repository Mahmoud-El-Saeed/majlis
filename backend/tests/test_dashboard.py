"""Ticket 06: GET /dashboard — one call for my courses + waiting state.

Contract:
- Auth required; returns items [{course, enrollment_status, enrollment,
  lesson_count, ready_count}].
- Approved/owned rows carry real lesson counts; pending rows carry 0/0.
- Teacher sees owned courses as owner; student sees approved + pending;
  admin sees all.
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


async def test_dashboard_requires_auth(client):
    r = await client.get("/api/v1/dashboard")
    assert r.status_code in (401, 403), r.text


async def test_student_dashboard_approved_and_pending(client):
    from app.models.user import Role

    await create_user_in_db("dbt@x.com", "password123", role=Role.teacher)
    await create_user_in_db("dbs@x.com", "password123", role=Role.student)
    t = await _tokens(client, "dbt@x.com", "password123")
    s = await _tokens(client, "dbs@x.com", "password123")
    th = {"Authorization": f"Bearer {t['access_token']}"}
    sh = {"Authorization": f"Bearer {s['access_token']}"}

    c1 = await _course(client, t["access_token"], "Book 1")
    c2 = await _course(client, t["access_token"], "Book 2")
    await _lesson(client, t["access_token"], c1["id"], "L1")
    await _lesson(client, t["access_token"], c1["id"], "L2")

    # Join both; teacher approves only the first.
    code1 = (await client.post(f"/api/v1/courses/{c1['id']}/codes", json={}, headers=th)).json()
    code2 = (await client.post(f"/api/v1/courses/{c2['id']}/codes", json={}, headers=th)).json()
    j1 = (
        await client.post(
            "/api/v1/enrollments/join",
            json={"code": code1["code"], "display_name": "S"},
            headers=sh,
        )
    ).json()
    await client.post(
        "/api/v1/enrollments/join",
        json={"code": code2["code"], "display_name": "S"},
        headers=sh,
    )
    assert (
        await client.post(f"/api/v1/enrollments/{j1['id']}/approve", headers=th)
    ).status_code == 200

    r = await client.get("/api/v1/dashboard", headers=sh)
    assert r.status_code == 200, r.text
    items = {i["course"]["id"]: i for i in r.json()["items"]}
    assert items[c1["id"]]["enrollment_status"] == "approved"
    # Both lessons are still pending (no audio confirmed): drafts stay
    # hidden, so the approved row reports ready-only counts.
    assert items[c1["id"]]["lesson_count"] == 0
    assert items[c1["id"]]["ready_count"] == 0
    assert items[c2["id"]]["enrollment_status"] == "pending"
    assert items[c2["id"]]["lesson_count"] == 0
    assert items[c2["id"]]["enrollment"] is not None


async def test_teacher_dashboard_owner_and_admin_sees_all(client):
    from app.models.user import Role

    await create_user_in_db("dbt2@x.com", "password123", role=Role.teacher)
    await create_user_in_db("dba@x.com", "password123", role=Role.admin)
    t = await _tokens(client, "dbt2@x.com", "password123")
    a = await _tokens(client, "dba@x.com", "password123")
    th = {"Authorization": f"Bearer {t['access_token']}"}
    ah = {"Authorization": f"Bearer {a['access_token']}"}

    c = await _course(client, t["access_token"], "Owned")
    await _lesson(client, t["access_token"], c["id"])

    r = await client.get("/api/v1/dashboard", headers=th)
    assert r.status_code == 200, r.text
    mine = {i["course"]["id"]: i for i in r.json()["items"]}
    assert mine[c["id"]]["enrollment_status"] == "owner"
    assert mine[c["id"]]["lesson_count"] == 1

    r2 = await client.get("/api/v1/dashboard", headers=ah)
    assert r2.status_code == 200, r2.text
    all_items = {i["course"]["id"]: i for i in r2.json()["items"]}
    assert c["id"] in all_items
