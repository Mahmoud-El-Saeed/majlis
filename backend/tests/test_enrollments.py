"""Ticket 04 red phase: Codes + approvals (private-circle gate).

Contract under test:
- Teacher generates per-course codes with defaults 8 chars, 7 days, 50 uses,
  max 5 active per course.
- Codes traceable (who created/used) and revocable; revoked/expired/overused
  codes rejected. Raw code returned once; listing shows prefix hint only.
- Student Join-with-code -> pending with name/phone/note visible in queue.
- Approve -> access (courses + lessons gated); reject soft (may re-apply
  with new code); block per-course ban (cannot rejoin); unblock restores
  the pre-block status instantly (legacy NULL -> approved).
- Enrollment checks membership, never role == student; teachers joining
  another teacher's course go through the same gate.
"""

from httpx import AsyncClient

from app.models.user import Role
from tests.helpers import create_user_in_db, login


async def _tokens(client: AsyncClient, email: str, password: str):
    return await login(client, email, password)


async def _teacher_with_course(client: AsyncClient, t_email="tc04@x.com"):
    await create_user_in_db(t_email, "password123", role=Role.teacher)
    t = await _tokens(client, t_email, "password123")
    h = {"Authorization": f"Bearer {t['access_token']}"}
    r = await client.post("/api/v1/courses", json={"title": "Fiqh Book"}, headers=h)
    assert r.status_code == 201, r.text
    return t, h, r.json()["id"]


async def _student(client: AsyncClient, email="st04@x.com"):
    await create_user_in_db(email, "password123", role=Role.student)
    toks = await _tokens(client, email, "password123")
    return toks, {"Authorization": f"Bearer {toks['access_token']}"}


async def _make_code(client: AsyncClient, headers: dict, course_id: str, body: dict | None = None):
    r = await client.post(f"/api/v1/courses/{course_id}/codes", json=body or {}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


async def test_code_defaults_and_active_cap(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client)
    first = await _make_code(client, th, cid, {})
    assert len(first["code"]) == 8
    assert first["max_uses"] == 50
    assert first["uses_count"] == 0

    codes = [first]
    for _ in range(4):
        codes.append(await _make_code(client, th, cid, {}))
    assert len({c["code"] for c in codes}) == 5

    r = await client.post(f"/api/v1/courses/{cid}/codes", json={}, headers=th)
    assert r.status_code == 400, r.text
    assert "5" in r.json()["detail"] or "active" in r.json()["detail"].lower()


async def test_code_list_traceable_without_raw(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "trace@x.com")
    made = await _make_code(client, th, cid, {})
    r = await client.get(f"/api/v1/courses/{cid}/codes", headers=th)
    assert r.status_code == 200, r.text
    rows = r.json()["codes"]
    assert len(rows) == 1
    row = rows[0]
    assert "code" not in row  # raw never leaks in listing
    assert row["code_prefix"] == made["code"][:4]
    assert row["created_by"] is not None
    assert row["max_uses"] == 50


async def test_student_cannot_create_code_and_other_teacher_forbidden(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "own04@x.com")
    await create_user_in_db("oth04@x.com", "password123", role=Role.teacher)
    oth = await _tokens(client, "oth04@x.com", "password123")
    oh = {"Authorization": f"Bearer {oth['access_token']}"}
    _, sh = await _student(client, "nostudent04@x.com")

    r = await client.post(f"/api/v1/courses/{cid}/codes", json={}, headers=sh)
    assert r.status_code == 403, r.text
    r = await client.post(f"/api/v1/courses/{cid}/codes", json={}, headers=oh)
    assert r.status_code == 403, r.text


async def test_join_creates_pending_visible_in_queue(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "q04@x.com")
    made = await _make_code(client, th, cid, {})
    _, sh = await _student(client, "queue04@x.com")

    r = await client.post(
        "/api/v1/enrollments/join",
        json={
            "code": made["code"],
            "display_name": "طالب جديد",
            "phone": "0551234567",
            "note": "أريد الحضور",
        },
        headers=sh,
    )
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "pending"

    q = await client.get(f"/api/v1/courses/{cid}/enrollments?status=pending", headers=th)
    assert q.status_code == 200, q.text
    rows = q.json()["enrollments"]
    assert len(rows) == 1
    assert rows[0]["display_name"] == "طالب جديد"
    assert rows[0]["phone"] == "0551234567"
    assert rows[0]["note"] == "أريد الحضور"


async def test_approve_grants_access_to_courses_and_lessons(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "ap04@x.com")
    made = await _make_code(client, th, cid, {})
    st, sh = await _student(client, "approve04@x.com")

    # Lesson exists before approval.
    lr = await client.post(
        f"/api/v1/courses/{cid}/lessons",
        json={"title": "Lesson 1"},
        headers=th,
    )
    assert lr.status_code == 201, lr.text
    lid = lr.json()["id"]

    # Before joining: gated out of both.
    assert (await client.get("/api/v1/courses", headers=sh)).json() == []
    assert (await client.get(f"/api/v1/courses/{cid}", headers=sh)).status_code == 403
    assert (await client.get(f"/api/v1/lessons/{lid}", headers=sh)).status_code == 403

    jr = await client.post(
        "/api/v1/enrollments/join",
        json={"code": made["code"], "display_name": "S"},
        headers=sh,
    )
    assert jr.status_code == 201, jr.text
    eid = jr.json()["id"]

    # Still pending: still gated.
    assert (await client.get(f"/api/v1/courses/{cid}", headers=sh)).status_code == 403

    ar = await client.post(f"/api/v1/enrollments/{eid}/approve", headers=th)
    assert ar.status_code == 200, ar.text
    assert ar.json()["status"] == "approved"

    lst = await client.get("/api/v1/courses", headers=sh)
    assert any(c["id"] == cid for c in lst.json())
    assert (await client.get(f"/api/v1/courses/{cid}", headers=sh)).status_code == 200
    assert (await client.get(f"/api/v1/lessons/{lid}", headers=sh)).status_code == 200
    # Teacher-as-student uses the same gate: owner bypasses without enrollment.
    assert (await client.get(f"/api/v1/courses/{cid}", headers=th)).status_code == 200


async def test_reject_is_soft_reapply_with_new_code(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "rj04@x.com")
    c1 = await _make_code(client, th, cid, {})
    _, sh = await _student(client, "reject04@x.com")

    j1 = await client.post(
        "/api/v1/enrollments/join",
        json={"code": c1["code"], "display_name": "S"},
        headers=sh,
    )
    eid = j1.json()["id"]
    r = await client.post(f"/api/v1/enrollments/{eid}/reject", headers=th)
    assert r.status_code == 200, r.text

    # Rejected stays gated.
    assert (await client.get(f"/api/v1/courses/{cid}", headers=sh)).status_code == 403

    c2 = await _make_code(client, th, cid, {})
    j2 = await client.post(
        "/api/v1/enrollments/join",
        json={"code": c2["code"], "display_name": "S again"},
        headers=sh,
    )
    assert j2.status_code == 201, j2.text
    assert j2.json()["status"] == "pending"
    assert j2.json()["id"] == eid  # same per-course row, back to pending


async def test_block_is_per_course_ban_and_unblock_lifts(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "bl04@x.com")
    # Second course to prove ban scope is per-course.
    tr = await client.post("/api/v1/courses", json={"title": "Second book"}, headers=th)
    cid2 = tr.json()["id"]
    c1 = await _make_code(client, th, cid, {})
    c2 = await _make_code(client, th, cid2, {})
    _, sh = await _student(client, "block04@x.com")

    j1 = await client.post(
        "/api/v1/enrollments/join", json={"code": c1["code"], "display_name": "S"}, headers=sh
    )
    eid = j1.json()["id"]
    b = await client.post(f"/api/v1/enrollments/{eid}/block", headers=th)
    assert b.status_code == 200, b.text

    c3 = await _make_code(client, th, cid, {})
    r = await client.post(
        "/api/v1/enrollments/join", json={"code": c3["code"], "display_name": "S"}, headers=sh
    )
    assert r.status_code == 403, r.text
    assert "block" in r.json()["detail"].lower() or "ban" in r.json()["detail"].lower()

    # Other course unaffected: can still join there.
    r2 = await client.post(
        "/api/v1/enrollments/join", json={"code": c2["code"], "display_name": "S"}, headers=sh
    )
    assert r2.status_code == 201, r2.text

    u = await client.post(f"/api/v1/enrollments/{eid}/unblock", headers=th)
    assert u.status_code == 200, u.text
    assert u.json()["status"] == "pending"
    # Restored to the pre-block queue spot: still gated, back in the queue,
    # no re-apply with a new code needed.
    q = await client.get(f"/api/v1/courses/{cid}/enrollments?status=pending", headers=th)
    assert q.status_code == 200, q.text
    assert any(e["id"] == eid for e in q.json()["enrollments"])
    assert (await client.get(f"/api/v1/courses/{cid}", headers=sh)).status_code == 403


async def test_unblock_restores_approved_access_instantly(client: AsyncClient):
    # Block-approved -> unblock -> approved with instant course access:
    # no new code, no re-apply, no re-approval.
    _, th, cid = await _teacher_with_course(client, "ubap04@x.com")
    made = await _make_code(client, th, cid, {})
    _, sh = await _student(client, "unblockap04@x.com")
    j = await client.post(
        "/api/v1/enrollments/join", json={"code": made["code"], "display_name": "S"}, headers=sh
    )
    eid = j.json()["id"]
    assert (await client.post(f"/api/v1/enrollments/{eid}/approve", headers=th)).status_code == 200
    assert (await client.get(f"/api/v1/courses/{cid}", headers=sh)).status_code == 200

    assert (await client.post(f"/api/v1/enrollments/{eid}/block", headers=th)).status_code == 200
    assert (await client.get(f"/api/v1/courses/{cid}", headers=sh)).status_code == 403

    u = await client.post(f"/api/v1/enrollments/{eid}/unblock", headers=th)
    assert u.status_code == 200, u.text
    assert u.json()["status"] == "approved"
    assert (await client.get(f"/api/v1/courses/{cid}", headers=sh)).status_code == 200


async def test_unblock_restores_pending_queue_spot(client: AsyncClient):
    # Block-pending -> unblock -> pending, back in the teacher queue.
    _, th, cid = await _teacher_with_course(client, "ubpe04@x.com")
    made = await _make_code(client, th, cid, {})
    _, sh = await _student(client, "unblockpe04@x.com")
    j = await client.post(
        "/api/v1/enrollments/join", json={"code": made["code"], "display_name": "S"}, headers=sh
    )
    eid = j.json()["id"]

    assert (await client.post(f"/api/v1/enrollments/{eid}/block", headers=th)).status_code == 200
    u = await client.post(f"/api/v1/enrollments/{eid}/unblock", headers=th)
    assert u.status_code == 200, u.text
    assert u.json()["status"] == "pending"
    q = await client.get(f"/api/v1/courses/{cid}/enrollments?status=pending", headers=th)
    assert any(e["id"] == eid for e in q.json()["enrollments"])


async def test_unblock_legacy_null_restores_approved(client: AsyncClient):
    # Rows blocked before status_before_block existed carry NULL and
    # restore to approved on unblock.
    import uuid

    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.models.enrollment import Enrollment
    from tests.conftest import TEST_DATABASE_URL

    _, th, cid = await _teacher_with_course(client, "ublg04@x.com")
    made = await _make_code(client, th, cid, {})
    _, sh = await _student(client, "unblocklg04@x.com")
    j = await client.post(
        "/api/v1/enrollments/join", json={"code": made["code"], "display_name": "S"}, headers=sh
    )
    eid = j.json()["id"]
    assert (await client.post(f"/api/v1/enrollments/{eid}/approve", headers=th)).status_code == 200
    assert (await client.post(f"/api/v1/enrollments/{eid}/block", headers=th)).status_code == 200

    # Simulate a legacy row: wipe the column the block just captured.
    engine = create_async_engine(TEST_DATABASE_URL, future=True)
    try:
        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        async with session_factory() as session:
            row = await session.get(Enrollment, uuid.UUID(eid))
            assert row is not None
            row.status_before_block = None
            await session.commit()
    finally:
        await engine.dispose()

    u = await client.post(f"/api/v1/enrollments/{eid}/unblock", headers=th)
    assert u.status_code == 200, u.text
    assert u.json()["status"] == "approved"
    assert (await client.get(f"/api/v1/courses/{cid}", headers=sh)).status_code == 200


async def test_revoked_expired_overused_codes_rejected(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "rx04@x.com")
    made = await _make_code(client, th, cid, {})
    _, sh = await _student(client, "rxstu04@x.com")

    # Revoke.
    rv = await client.post(f"/api/v1/courses/{cid}/codes/{made['id']}/revoke", headers=th)
    assert rv.status_code == 200, rv.text
    r = await client.post(
        "/api/v1/enrollments/join",
        json={"code": made["code"], "display_name": "S"},
        headers=sh,
    )
    assert r.status_code == 400, r.text

    # Expired (zero-day code is already expired).
    exp = await _make_code(client, th, cid, {"expires_days": 0})
    r = await client.post(
        "/api/v1/enrollments/join",
        json={"code": exp["code"], "display_name": "S"},
        headers=sh,
    )
    assert r.status_code == 400, r.text

    # Overused: max_uses=1 consumed once, second join fails.
    one = await _make_code(client, th, cid, {"max_uses": 1})
    _, sh2 = await _student(client, "rxstu2_04@x.com")
    _, sh3 = await _student(client, "rxstu3_04@x.com")
    ok = await client.post(
        "/api/v1/enrollments/join", json={"code": one["code"], "display_name": "A"}, headers=sh2
    )
    assert ok.status_code == 201, ok.text
    over = await client.post(
        "/api/v1/enrollments/join", json={"code": one["code"], "display_name": "B"}, headers=sh3
    )
    assert over.status_code == 400, over.text


async def test_decision_transitions_guarded(client: AsyncClient):
    # approve/reject act on pending; rejected must re-apply; approved is
    # removed via block, not reject.
    _, th, cid = await _teacher_with_course(client, "gd04@x.com")
    made = await _make_code(client, th, cid)
    _, sh = await _student(client, "guard04@x.com")
    j = await client.post(
        "/api/v1/enrollments/join", json={"code": made["code"], "display_name": "S"}, headers=sh
    )
    eid = j.json()["id"]

    # Approve twice: idempotent.
    assert (await client.post(f"/api/v1/enrollments/{eid}/approve", headers=th)).status_code == 200
    assert (await client.post(f"/api/v1/enrollments/{eid}/approve", headers=th)).status_code == 200
    # Rejecting an approved enrollment is rejected: block instead.
    r = await client.post(f"/api/v1/enrollments/{eid}/reject", headers=th)
    assert r.status_code == 400, r.text

    # Fresh pending → reject → direct approve must fail (re-apply required).
    _, sh2 = await _student(client, "guard2_04@x.com")
    c2 = await _make_code(client, th, cid)
    j2 = await client.post(
        "/api/v1/enrollments/join", json={"code": c2["code"], "display_name": "S2"}, headers=sh2
    )
    eid2 = j2.json()["id"]
    assert (await client.post(f"/api/v1/enrollments/{eid2}/reject", headers=th)).status_code == 200
    bad = await client.post(f"/api/v1/enrollments/{eid2}/approve", headers=th)
    assert bad.status_code == 400, bad.text
    assert "re-apply" in bad.json()["detail"].lower()

    # Unblock of a non-blocked enrollment fails.
    u = await client.post(f"/api/v1/enrollments/{eid2}/unblock", headers=th)
    assert u.status_code == 400, u.text


async def test_join_rate_limited(client: AsyncClient, monkeypatch):
    # Spam gate on the public join seam (spec story 28).
    import app.core.rate_limit as rl

    monkeypatch.setitem(rl.LIMITED_ENDPOINTS, "/api/v1/enrollments/join", 2)
    _, th, cid = await _teacher_with_course(client, "rl04@x.com")
    made = await _make_code(client, th, cid)

    statuses = []
    for i in range(3):
        await create_user_in_db(f"rlstu{i}@x.com", "password123")
        toks = await login(client, f"rlstu{i}@x.com", "password123")
        h = {"Authorization": f"Bearer {toks['access_token']}"}
        r = await client.post(
            "/api/v1/enrollments/join",
            json={"code": made["code"], "display_name": f"S{i}"},
            headers=h,
        )
        statuses.append(r.status_code)
    assert statuses[0] == 201, statuses
    assert statuses[1] == 201, statuses
    assert statuses[2] == 429, statuses


async def test_code_uses_audit_survives_reapply(client: AsyncClient):
    # Who-used history per code; re-applying with a new code appends instead
    # of overwriting.
    _, th, cid = await _teacher_with_course(client, "au04@x.com")
    c1 = await _make_code(client, th, cid, {})
    c2 = await _make_code(client, th, cid, {})
    _, sh = await _student(client, "audit04@x.com")

    j1 = await client.post(
        "/api/v1/enrollments/join", json={"code": c1["code"], "display_name": "S"}, headers=sh
    )
    eid = j1.json()["id"]
    assert j1.json()["code_id"] == c1["id"]

    u1 = await client.get(f"/api/v1/courses/{cid}/codes/{c1['id']}/uses", headers=th)
    assert u1.status_code == 200, u1.text
    assert len(u1.json()["uses"]) == 1
    assert u1.json()["uses"][0]["display_name"] == "S"

    assert (await client.post(f"/api/v1/enrollments/{eid}/reject", headers=th)).status_code == 200
    j2 = await client.post(
        "/api/v1/enrollments/join", json={"code": c2["code"], "display_name": "S2"}, headers=sh
    )
    assert j2.json()["code_id"] == c2["id"]

    # Old code still shows its use; new code shows the re-apply.
    u1b = await client.get(f"/api/v1/courses/{cid}/codes/{c1['id']}/uses", headers=th)
    assert len(u1b.json()["uses"]) == 1
    u2 = await client.get(f"/api/v1/courses/{cid}/codes/{c2['id']}/uses", headers=th)
    assert len(u2.json()["uses"]) == 1
    assert u2.json()["uses"][0]["display_name"] == "S2"

    # Students cannot read the audit.
    r = await client.get(f"/api/v1/courses/{cid}/codes/{c1['id']}/uses", headers=sh)
    assert r.status_code == 403, r.text


async def test_same_state_decisions_preserve_audit(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "id04@x.com")
    made = await _make_code(client, th, cid, {})
    _, sh = await _student(client, "idem04@x.com")
    j = await client.post(
        "/api/v1/enrollments/join", json={"code": made["code"], "display_name": "S"}, headers=sh
    )
    eid = j.json()["id"]

    first = await client.post(f"/api/v1/enrollments/{eid}/approve", headers=th)
    second = await client.post(f"/api/v1/enrollments/{eid}/approve", headers=th)
    assert second.status_code == 200, second.text
    assert second.json()["decided_at"] == first.json()["decided_at"]
    assert second.json()["decided_by"] == first.json()["decided_by"]

    b1 = await client.post(f"/api/v1/enrollments/{eid}/block", headers=th)
    b2 = await client.post(f"/api/v1/enrollments/{eid}/block", headers=th)
    assert b2.json()["decided_at"] == b1.json()["decided_at"]

    # The idempotent second block must not clobber the captured pre-block
    # status: unblock still restores approved.
    u = await client.post(f"/api/v1/enrollments/{eid}/unblock", headers=th)
    assert u.status_code == 200, u.text
    assert u.json()["status"] == "approved"


async def test_exhausted_code_frees_active_slot(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "ex04@x.com")
    one = await _make_code(client, th, cid, {"max_uses": 1})
    _, sh = await _student(client, "exstu04@x.com")
    ok = await client.post(
        "/api/v1/enrollments/join", json={"code": one["code"], "display_name": "A"}, headers=sh
    )
    assert ok.status_code == 201, ok.text

    # 4 more codes (5 total with the exhausted one), then the exhausted slot
    # frees: a 6th creation still succeeds.
    for _ in range(4):
        await _make_code(client, th, cid, {})
    extra = await client.post(f"/api/v1/courses/{cid}/codes", json={}, headers=th)
    assert extra.status_code == 201, extra.text


async def test_mine_lists_all_my_enrollments_with_titles(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "mn04@x.com")
    tr = await client.post("/api/v1/courses", json={"title": "Second book"}, headers=th)
    cid2 = tr.json()["id"]
    c1 = await _make_code(client, th, cid, {})
    c2 = await _make_code(client, th, cid2, {})
    _, sh = await _student(client, "mine04@x.com")

    j1 = await client.post(
        "/api/v1/enrollments/join", json={"code": c1["code"], "display_name": "S"}, headers=sh
    )
    await client.post(
        "/api/v1/enrollments/join", json={"code": c2["code"], "display_name": "S"}, headers=sh
    )
    approve_url = f"/api/v1/enrollments/{j1.json()['id']}/approve"
    assert (await client.post(approve_url, headers=th)).status_code == 200

    mine = await client.get("/api/v1/enrollments/mine", headers=sh)
    assert mine.status_code == 200, mine.text
    rows = {r["course_id"]: r for r in mine.json()["enrollments"]}
    assert set(rows) == {cid, cid2}
    assert rows[cid]["status"] == "approved"
    assert rows[cid]["course_title"] == "Fiqh Book"
    assert rows[cid2]["status"] == "pending"


async def test_teacher_joining_other_course_uses_same_gate(client: AsyncClient):
    # A teacher gains no automatic access to another teacher's course.
    _, th1, cid = await _teacher_with_course(client, "tA04@x.com")
    await create_user_in_db("tB04@x.com", "password123", role=Role.teacher)
    tb = await _tokens(client, "tB04@x.com", "password123")
    tbh = {"Authorization": f"Bearer {tb['access_token']}"}

    assert (await client.get(f"/api/v1/courses/{cid}", headers=tbh)).status_code == 403

    made = await _make_code(client, th1, cid, {})
    j = await client.post(
        "/api/v1/enrollments/join",
        json={"code": made["code"], "display_name": "Teacher B"},
        headers=tbh,
    )
    assert j.status_code == 201, j.text
    eid = j.json()["id"]
    assert (await client.post(f"/api/v1/enrollments/{eid}/approve", headers=th1)).status_code == 200
    assert (await client.get(f"/api/v1/courses/{cid}", headers=tbh)).status_code == 200
