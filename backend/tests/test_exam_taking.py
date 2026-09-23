"""Ticket 08 red phase: Exam taking flow — student side (Seam 5).

Contract under test:
- Only approved-enrolled students (role==student) can start/list/submit.
  Teachers/admins 403 even if owner; pending/rejected/blocked/outsider 403; anon 401.
- Start blocked outside open window; attempts_limit enforced (all statuses count);
  partial unique (exam, student) WHERE in_progress blocks simultaneous attempts.
- expires_at = started_at + duration_minutes at start (None when untimed).
- Submit auto-scores MCQ/TF; essay left pending (needs_grading, 0 points).
- Late submit (past expires_at or close_at) is ACCEPTED + auto-finalized (is_late).
- Visibility: immediate (or published) shows score/awarded/is_correct;
  after_publish-unpublished shows receipt only (score/awarded None).
  Never leak correct_index/correct_answer in any student response.
"""

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient

from app.models.user import Role
from tests.helpers import create_user_in_db, login, open_db_session


async def _tokens(client: AsyncClient, email: str, password: str = "password123"):
    return await login(client, email, password)


async def _teacher_with_course(client: AsyncClient, email: str = "take_teacher@x.com"):
    await create_user_in_db(email, "password123", role=Role.teacher)
    t = await _tokens(client, email)
    h = {"Authorization": f"Bearer {t['access_token']}"}
    r = await client.post("/api/v1/courses", json={"title": "Book"}, headers=h)
    assert r.status_code == 201, r.text
    return t, h, r.json()["id"]


async def _student(client: AsyncClient, email: str):
    await create_user_in_db(email, "password123", role=Role.student)
    toks = await _tokens(client, email)
    return toks, {"Authorization": f"Bearer {toks['access_token']}"}


async def _enroll_approved(
    client: AsyncClient, teacher_h: dict, course_id: str, student_h: dict, name: str = "S"
):
    code_r = await client.post(f"/api/v1/courses/{course_id}/codes", json={}, headers=teacher_h)
    assert code_r.status_code == 201, code_r.text
    raw = code_r.json()["code"]
    j = await client.post(
        "/api/v1/enrollments/join",
        json={"code": raw, "display_name": name},
        headers=student_h,
    )
    assert j.status_code == 201, j.text
    eid = j.json()["id"]
    a = await client.post(f"/api/v1/enrollments/{eid}/approve", headers=teacher_h)
    assert a.status_code == 200, a.text
    assert a.json()["status"] == "approved"
    return eid


def _exam_payload(**over):
    base = {
        "title": "Exam",
        "attempts_limit": 2,
        "duration_minutes": 30,
        "pass_score": 50,
        "show_result": "immediate",
    }
    base.update(over)
    return base


async def _make_exam(client, teacher_h, course_id, **over):
    r = await client.post(
        f"/api/v1/courses/{course_id}/exams", json=_exam_payload(**over), headers=teacher_h
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _add_mcq(client, teacher_h, exam_id, correct=2, max_score=4):
    r = await client.post(
        f"/api/v1/exams/{exam_id}/questions",
        json={
            "type": "mcq",
            "prompt": "What is 2+2?",
            "options": ["1", "2", "4", "5"],
            "correct_index": correct,
            "max_score": max_score,
        },
        headers=teacher_h,
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _add_tf(client, teacher_h, exam_id, correct=True, max_score=2):
    r = await client.post(
        f"/api/v1/exams/{exam_id}/questions",
        json={"type": "tf", "prompt": "Sky is blue.", "correct_answer": correct},
        headers=teacher_h,
    )
    # fix max_score via update (create defaults 1 for tf)
    assert r.status_code == 201, r.text
    q = r.json()
    if max_score != 1:
        u = await client.put(
            f"/api/v1/questions/{q['id']}", json={"max_score": max_score}, headers=teacher_h
        )
        assert u.status_code == 200, u.text
        return u.json()
    return q


async def _add_essay(client, teacher_h, exam_id, max_score=10):
    r = await client.post(
        f"/api/v1/exams/{exam_id}/questions",
        json={"type": "essay", "prompt": "Explain.", "max_score": max_score},
        headers=teacher_h,
    )
    assert r.status_code == 201, r.text
    return r.json()


def _no_leak(body: dict) -> None:
    blob = str(body)
    assert "correct_index" not in blob, f"leak in {blob[:500]}"
    assert "correct_answer" not in blob, f"leak in {blob[:500]}"


async def test_approved_student_can_start_with_expiry_set(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "st1t@x.com")
    _, sh = await _student(client, "st1s@x.com")
    await _enroll_approved(client, th, cid, sh)
    exam = await _make_exam(client, th, cid)
    q = await _add_mcq(client, th, exam["id"])

    r = await client.post(f"/api/v1/exams/{exam['id']}/attempts", headers=sh)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["exam_id"] == exam["id"]
    assert body["status"] == "in_progress"
    assert body["expires_at"] is not None
    assert body["submitted_at"] is None
    # student-safe questions, no correct keys
    assert len(body["questions"]) == 1
    assert body["questions"][0]["id"] == q["id"]
    assert "options" in body["questions"][0]
    _no_leak(body)


async def test_unapproved_and_anon_cannot_start(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "st2t@x.com")
    _, sh_pending = await _student(client, "st2p@x.com")
    _, sh_out = await _student(client, "st2o@x.com")
    exam = await _make_exam(client, th, cid)

    # outsider (no enrollment) 403
    r = await client.post(f"/api/v1/exams/{exam['id']}/attempts", headers=sh_out)
    assert r.status_code == 403, r.text

    # pending (joined, not approved) 403
    code_r = await client.post(f"/api/v1/courses/{cid}/codes", json={}, headers=th)
    raw = code_r.json()["code"]
    j = await client.post(
        "/api/v1/enrollments/join",
        json={"code": raw, "display_name": "P"},
        headers=sh_pending,
    )
    assert j.status_code == 201, j.text
    r = await client.post(f"/api/v1/exams/{exam['id']}/attempts", headers=sh_pending)
    assert r.status_code == 403, r.text

    # anon 401
    r = await client.post(f"/api/v1/exams/{exam['id']}/attempts")
    assert r.status_code in (401, 403), r.text


async def test_blocked_student_cannot_start(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "stbt@x.com")
    _, sh = await _student(client, "stbs@x.com")
    eid = await _enroll_approved(client, th, cid, sh)
    exam = await _make_exam(client, th, cid)
    b = await client.post(f"/api/v1/enrollments/{eid}/block", headers=th)
    assert b.status_code == 200, b.text
    r = await client.post(f"/api/v1/exams/{exam['id']}/attempts", headers=sh)
    assert r.status_code == 403, r.text


async def test_teacher_and_admin_cannot_start(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "st3t@x.com")
    await create_user_in_db("st3admin@x.com", "password123", role=Role.admin)
    admin = await _tokens(client, "st3admin@x.com")
    ah = {"Authorization": f"Bearer {admin['access_token']}"}
    exam = await _make_exam(client, th, cid)

    for h in (th, ah):
        r = await client.post(f"/api/v1/exams/{exam['id']}/attempts", headers=h)
        assert r.status_code == 403, r.text


async def test_start_outside_window_rejected(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "stwint@x.com")
    _, sh = await _student(client, "stwins@x.com")
    await _enroll_approved(client, th, cid, sh)
    now = datetime.now(UTC)
    future_open = (now + timedelta(days=1)).isoformat()
    future_close = (now + timedelta(days=2)).isoformat()
    exam = await _make_exam(client, th, cid, open_at=future_open, close_at=future_close)
    r = await client.post(f"/api/v1/exams/{exam['id']}/attempts", headers=sh)
    assert r.status_code == 400, r.text

    past_open = (now - timedelta(days=2)).isoformat()
    past_close = (now - timedelta(days=1)).isoformat()
    exam2 = await _make_exam(client, th, cid, open_at=past_open, close_at=past_close)
    r = await client.post(f"/api/v1/exams/{exam2['id']}/attempts", headers=sh)
    assert r.status_code == 400, r.text


async def test_attempts_limit_counts_all_statuses(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "stlimt@x.com")
    _, sh = await _student(client, "stlims@x.com")
    await _enroll_approved(client, th, cid, sh)
    exam = await _make_exam(client, th, cid, attempts_limit=1)
    q = await _add_mcq(client, th, exam["id"])

    a1 = await client.post(f"/api/v1/exams/{exam['id']}/attempts", headers=sh)
    assert a1.status_code == 201, a1.text
    aid = a1.json()["id"]
    sub = await client.post(
        f"/api/v1/attempts/{aid}/submit",
        json={"answers": [{"question_id": q["id"], "selected_index": 2}]},
        headers=sh,
    )
    assert sub.status_code == 200, sub.text

    # submitted counts: second start rejected
    r = await client.post(f"/api/v1/exams/{exam['id']}/attempts", headers=sh)
    assert r.status_code == 400, r.text


async def test_simultaneous_in_progress_blocked(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "stlockt@x.com")
    _, sh = await _student(client, "stlocks@x.com")
    await _enroll_approved(client, th, cid, sh)
    exam = await _make_exam(client, th, cid, attempts_limit=5)

    a1 = await client.post(f"/api/v1/exams/{exam['id']}/attempts", headers=sh)
    assert a1.status_code == 201, a1.text
    a2 = await client.post(f"/api/v1/exams/{exam['id']}/attempts", headers=sh)
    assert a2.status_code == 400, a2.text


async def test_submit_autogrades_mcq_tf_essay_pending_immediate(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "stgintrat@x.com")
    _, sh = await _student(client, "stgs@x.com")
    await _enroll_approved(client, th, cid, sh)
    exam = await _make_exam(client, th, cid, show_result="immediate")
    mcq = await _add_mcq(client, th, exam["id"], correct=2, max_score=4)
    tf = await _add_tf(client, th, exam["id"], correct=True, max_score=2)
    essay = await _add_essay(client, th, exam["id"], max_score=10)

    a = await client.post(f"/api/v1/exams/{exam['id']}/attempts", headers=sh)
    aid = a.json()["id"]
    sub = await client.post(
        f"/api/v1/attempts/{aid}/submit",
        json={
            "answers": [
                {"question_id": mcq["id"], "selected_index": 2},  # correct 4 pts
                {"question_id": tf["id"], "selected_bool": False},  # wrong 0 pts
                {"question_id": essay["id"], "text_answer": "شرح مفصل"},
            ]
        },
        headers=sh,
    )
    assert sub.status_code == 200, sub.text
    body = sub.json()
    assert body["status"] == "submitted"
    assert body["submitted_at"] is not None
    assert body["score"] == 4
    assert body["max_score"] == 16
    by_q = {x["question_id"]: x for x in body["answers"]}
    assert by_q[mcq["id"]]["awarded_score"] == 4
    assert by_q[mcq["id"]]["is_correct"] is True
    assert by_q[tf["id"]]["awarded_score"] == 0
    assert by_q[tf["id"]]["is_correct"] is False
    assert by_q[essay["id"]]["awarded_score"] == 0
    assert by_q[essay["id"]]["needs_grading"] is True
    _no_leak(body)


async def test_after_publish_hides_scores_until_publish(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "sthidt@x.com")
    _, sh = await _student(client, "sthids@x.com")
    await _enroll_approved(client, th, cid, sh)
    exam = await _make_exam(client, th, cid, show_result="after_publish")
    mcq = await _add_mcq(client, th, exam["id"], correct=2, max_score=4)

    a = await client.post(f"/api/v1/exams/{exam['id']}/attempts", headers=sh)
    aid = a.json()["id"]
    sub = await client.post(
        f"/api/v1/attempts/{aid}/submit",
        json={"answers": [{"question_id": mcq["id"], "selected_index": 2}]},
        headers=sh,
    )
    assert sub.status_code == 200, sub.text
    body = sub.json()
    assert body["score"] is None
    assert body["is_published"] is False
    assert body["answers"][0]["awarded_score"] is None
    assert body["answers"][0].get("is_correct") is None
    # receipt still echoes the answer
    assert body["answers"][0]["selected_index"] == 2
    _no_leak(body)

    # GET view also hidden
    g = await client.get(f"/api/v1/attempts/{aid}", headers=sh)
    assert g.status_code == 200, g.text
    assert g.json()["score"] is None
    _no_leak(g.json())


async def test_late_submit_after_expiry_accepted_and_marked(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "stlatet@x.com")
    _, sh = await _student(client, "stlates@x.com")
    await _enroll_approved(client, th, cid, sh)
    exam = await _make_exam(client, th, cid, duration_minutes=30)
    mcq = await _add_mcq(client, th, exam["id"], correct=0, max_score=3)

    a = await client.post(f"/api/v1/exams/{exam['id']}/attempts", headers=sh)
    aid = a.json()["id"]

    # force expiry to the past at the DB seam (no sleeping)
    from sqlalchemy import update

    from app.models.attempt import Attempt

    async with open_db_session() as session:
        await session.execute(
            update(Attempt)
            .where(Attempt.id == aid)
            .values(expires_at=datetime.now(UTC) - timedelta(seconds=5))
        )
        await session.commit()

    sub = await client.post(
        f"/api/v1/attempts/{aid}/submit",
        json={"answers": [{"question_id": mcq["id"], "selected_index": 0}]},
        headers=sh,
    )
    assert sub.status_code == 200, sub.text
    body = sub.json()
    assert body["status"] == "submitted"
    assert body["is_late"] is True
    assert body["score"] == 3  # graded what was submitted


async def test_late_submit_after_close_accepted(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "stcloset@x.com")
    _, sh = await _student(client, "stcloses@x.com")
    await _enroll_approved(client, th, cid, sh)
    now = datetime.now(UTC)
    exam = await _make_exam(
        client,
        th,
        cid,
        open_at=(now - timedelta(hours=1)).isoformat(),
        close_at=(now + timedelta(hours=1)).isoformat(),
    )
    mcq = await _add_mcq(client, th, exam["id"], correct=1, max_score=2)
    a = await client.post(f"/api/v1/exams/{exam['id']}/attempts", headers=sh)
    aid = a.json()["id"]

    # move close_at to the past (still after open_at) then submit late
    upd = await client.put(
        f"/api/v1/exams/{exam['id']}",
        json={"close_at": (now - timedelta(minutes=1)).isoformat()},
        headers=th,
    )
    assert upd.status_code == 200, upd.text
    sub = await client.post(
        f"/api/v1/attempts/{aid}/submit",
        json={"answers": [{"question_id": mcq["id"], "selected_index": 1}]},
        headers=sh,
    )
    assert sub.status_code == 200, sub.text
    assert sub.json()["is_late"] is True
    assert sub.json()["score"] == 2


async def test_double_submit_rejected_and_foreign_attempt_forbidden(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "stdblt@x.com")
    _, sh1 = await _student(client, "stdbls1@x.com")
    _, sh2 = await _student(client, "stdbls2@x.com")
    await _enroll_approved(client, th, cid, sh1)
    await _enroll_approved(client, th, cid, sh2)
    exam = await _make_exam(client, th, cid)
    mcq = await _add_mcq(client, th, exam["id"])

    a = await client.post(f"/api/v1/exams/{exam['id']}/attempts", headers=sh1)
    aid = a.json()["id"]
    ok = await client.post(
        f"/api/v1/attempts/{aid}/submit",
        json={"answers": [{"question_id": mcq["id"], "selected_index": 2}]},
        headers=sh1,
    )
    assert ok.status_code == 200, ok.text
    again = await client.post(
        f"/api/v1/attempts/{aid}/submit",
        json={"answers": [{"question_id": mcq["id"], "selected_index": 2}]},
        headers=sh1,
    )
    assert again.status_code == 400, again.text

    # other student cannot read/submit
    assert (await client.get(f"/api/v1/attempts/{aid}", headers=sh2)).status_code in (
        403,
        404,
    )
    assert (
        await client.post(
            f"/api/v1/attempts/{aid}/submit",
            json={"answers": [{"question_id": mcq["id"], "selected_index": 2}]},
            headers=sh2,
        )
    ).status_code in (403, 404)


async def test_my_attempts_lists_own_only(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "stmlt@x.com")
    _, sh = await _student(client, "stmls@x.com")
    await _enroll_approved(client, th, cid, sh)
    exam = await _make_exam(client, th, cid)
    a = await client.post(f"/api/v1/exams/{exam['id']}/attempts", headers=sh)
    assert a.status_code == 201, a.text
    lst = await client.get(f"/api/v1/exams/{exam['id']}/attempts/me", headers=sh)
    assert lst.status_code == 200, lst.text
    assert any(x["id"] == a.json()["id"] for x in lst.json())


async def test_blocked_after_start_cannot_submit_or_read(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "stmidbt@x.com")
    _, sh = await _student(client, "stmidbs@x.com")
    eid = await _enroll_approved(client, th, cid, sh)
    exam = await _make_exam(client, th, cid)
    mcq = await _add_mcq(client, th, exam["id"])
    a = await client.post(f"/api/v1/exams/{exam['id']}/attempts", headers=sh)
    aid = a.json()["id"]

    b = await client.post(f"/api/v1/enrollments/{eid}/block", headers=th)
    assert b.status_code == 200, b.text

    sub = await client.post(
        f"/api/v1/attempts/{aid}/submit",
        json={"answers": [{"question_id": mcq["id"], "selected_index": 2}]},
        headers=sh,
    )
    assert sub.status_code == 403, sub.text
    assert (await client.get(f"/api/v1/attempts/{aid}", headers=sh)).status_code == 403
    assert (
        await client.get(f"/api/v1/exams/{exam['id']}/attempts/me", headers=sh)
    ).status_code == 403


async def test_expired_in_progress_auto_finalized_on_next_start(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "stautot@x.com")
    _, sh = await _student(client, "stautos@x.com")
    await _enroll_approved(client, th, cid, sh)
    exam = await _make_exam(client, th, cid, attempts_limit=2)
    await _add_mcq(client, th, exam["id"])

    a1 = await client.post(f"/api/v1/exams/{exam['id']}/attempts", headers=sh)
    assert a1.status_code == 201, a1.text
    first_id = a1.json()["id"]

    from sqlalchemy import update

    from app.models.attempt import Attempt

    async with open_db_session() as session:
        await session.execute(
            update(Attempt)
            .where(Attempt.id == first_id)
            .values(expires_at=datetime.now(UTC) - timedelta(seconds=5))
        )
        await session.commit()

    # Next start auto-finalizes the stale row instead of deadlocking on the
    # one-in-progress guard, and the stale row counts toward the limit.
    a2 = await client.post(f"/api/v1/exams/{exam['id']}/attempts", headers=sh)
    assert a2.status_code == 201, a2.text

    lst = await client.get(f"/api/v1/exams/{exam['id']}/attempts/me", headers=sh)
    assert lst.status_code == 200, lst.text
    by_id = {x["id"]: x for x in lst.json()}
    assert by_id[first_id]["status"] == "submitted"
    assert by_id[first_id]["is_late"] is True
    assert by_id[a2.json()["id"]]["status"] == "in_progress"


async def test_list_carries_receipt_answers(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "strcpt@x.com")
    _, sh = await _student(client, "strcps@x.com")
    await _enroll_approved(client, th, cid, sh)
    exam = await _make_exam(client, th, cid, show_result="after_publish")
    mcq = await _add_mcq(client, th, exam["id"], correct=2, max_score=4)

    a = await client.post(f"/api/v1/exams/{exam['id']}/attempts", headers=sh)
    aid = a.json()["id"]
    sub = await client.post(
        f"/api/v1/attempts/{aid}/submit",
        json={"answers": [{"question_id": mcq["id"], "selected_index": 2}]},
        headers=sh,
    )
    assert sub.status_code == 200, sub.text

    lst = await client.get(f"/api/v1/exams/{exam['id']}/attempts/me", headers=sh)
    assert lst.status_code == 200, lst.text
    row = next(x for x in lst.json() if x["id"] == aid)
    assert row["score"] is None
    assert len(row["questions"]) == 1
    assert row["answers"][0]["selected_index"] == 2
    assert row["answers"][0]["awarded_score"] is None
    _no_leak(row)


async def test_mode_flip_to_after_publish_hides_scores(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "stflipt@x.com")
    _, sh = await _student(client, "stflips@x.com")
    await _enroll_approved(client, th, cid, sh)
    exam = await _make_exam(client, th, cid, show_result="immediate")
    mcq = await _add_mcq(client, th, exam["id"], correct=2, max_score=4)

    a = await client.post(f"/api/v1/exams/{exam['id']}/attempts", headers=sh)
    aid = a.json()["id"]
    sub = await client.post(
        f"/api/v1/attempts/{aid}/submit",
        json={"answers": [{"question_id": mcq["id"], "selected_index": 2}]},
        headers=sh,
    )
    assert sub.json()["score"] == 4

    flip = await client.put(
        f"/api/v1/exams/{exam['id']}", json={"show_result": "after_publish"}, headers=th
    )
    assert flip.status_code == 200, flip.text

    g = await client.get(f"/api/v1/attempts/{aid}", headers=sh)
    assert g.status_code == 200, g.text
    body = g.json()
    assert body["score"] is None
    assert body["is_published"] is False
    assert body["answers"][0]["awarded_score"] is None
    assert body["answers"][0]["selected_index"] == 2
    _no_leak(body)


async def test_feedback_slot_exists_but_empty_until_grading(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "stfbt@x.com")
    _, sh = await _student(client, "stfbs@x.com")
    await _enroll_approved(client, th, cid, sh)
    exam = await _make_exam(client, th, cid, show_result="immediate")
    essay = await _add_essay(client, th, exam["id"], max_score=10)

    a = await client.post(f"/api/v1/exams/{exam['id']}/attempts", headers=sh)
    sub = await client.post(
        f"/api/v1/attempts/{a.json()['id']}/submit",
        json={"answers": [{"question_id": essay["id"], "text_answer": "شرح"}]},
        headers=sh,
    )
    assert sub.status_code == 200, sub.text
    assert sub.json()["answers"][0]["feedback"] is None


async def test_untimed_exam_has_no_expiry(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "stnotimet@x.com")
    _, sh = await _student(client, "stnotimes@x.com")
    await _enroll_approved(client, th, cid, sh)
    now = datetime.now(UTC)
    exam = await _make_exam(
        client,
        th,
        cid,
        duration_minutes=None,
        open_at=(now - timedelta(hours=1)).isoformat(),
        close_at=(now + timedelta(hours=1)).isoformat(),
    )
    # clear duration via update (create default may set it)
    upd = await client.put(
        f"/api/v1/exams/{exam['id']}", json={"clear_duration_minutes": True}, headers=th
    )
    assert upd.status_code == 200, upd.text
    a = await client.post(f"/api/v1/exams/{exam['id']}/attempts", headers=sh)
    assert a.status_code == 201, a.text
    assert a.json()["expires_at"] is None
