"""Ticket 14: student-safe per-course exam list (Seam: HTTP API).

Contract:
- GET /courses/{id}/student-exams gated by can_view (approved/owner/admin).
  pending/blocked/outsider 403, anon 401.
- Writers keep existing preview path (/courses/{id}/exams stays can_write).
- Response never leaks correct_index/correct_answer.
- Returns attempts_left, attempts_used, window_status, has_in_progress,
  show_result passthrough for immediate vs after_publish display.
"""

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient

from app.models.user import Role
from tests.helpers import create_user_in_db, login


async def _tokens(client: AsyncClient, email: str, password: str = "password123"):
    return await login(client, email, password)


async def _teacher_with_course(client: AsyncClient, email: str = "disc_teacher@x.com"):
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


async def _enroll_approved(client, teacher_h, course_id, student_h, name="S"):
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


async def _add_mcq(client, teacher_h, exam_id, correct=2):
    r = await client.post(
        f"/api/v1/exams/{exam_id}/questions",
        json={
            "type": "mcq",
            "prompt": "What is 2+2?",
            "options": ["1", "2", "4", "5"],
            "correct_index": correct,
            "max_score": 4,
        },
        headers=teacher_h,
    )
    assert r.status_code == 201, r.text
    return r.json()


def _no_leak(body) -> None:
    blob = str(body)
    assert "correct_index" not in blob, f"leak in {blob[:500]}"
    assert "correct_answer" not in blob, f"leak in {blob[:500]}"


async def test_approved_student_lists_without_leak(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "d1t@x.com")
    _, sh = await _student(client, "d1s@x.com")
    await _enroll_approved(client, th, cid, sh)
    exam = await _make_exam(client, th, cid)
    await _add_mcq(client, th, exam["id"])

    r = await client.get(f"/api/v1/courses/{cid}/student-exams", headers=sh)
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body, list) and len(body) == 1
    row = body[0]
    assert row["id"] == exam["id"]
    assert row["attempts_limit"] == 2
    assert row["attempts_used"] == 0
    assert row["attempts_left"] == 2
    assert row["window_status"] == "open"
    assert row["has_in_progress"] is False
    assert row["show_result"] == "immediate"
    assert row["last_score"] is None
    _no_leak(body)


async def test_pending_blocked_outsider_403_anon_401(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "d2t@x.com")
    _, sh_pending = await _student(client, "d2p@x.com")
    _, sh_out = await _student(client, "d2o@x.com")
    _, sh_block = await _student(client, "d2b@x.com")
    await _make_exam(client, th, cid)

    # outsider 403
    r = await client.get(f"/api/v1/courses/{cid}/student-exams", headers=sh_out)
    assert r.status_code == 403, r.text

    # pending 403
    code_r = await client.post(f"/api/v1/courses/{cid}/codes", json={}, headers=th)
    raw = code_r.json()["code"]
    j = await client.post(
        "/api/v1/enrollments/join",
        json={"code": raw, "display_name": "P"},
        headers=sh_pending,
    )
    assert j.status_code == 201, j.text
    r = await client.get(f"/api/v1/courses/{cid}/student-exams", headers=sh_pending)
    assert r.status_code == 403, r.text

    # blocked 403
    eid = await _enroll_approved(client, th, cid, sh_block)
    b = await client.post(f"/api/v1/enrollments/{eid}/block", headers=th)
    assert b.status_code == 200, b.text
    r = await client.get(f"/api/v1/courses/{cid}/student-exams", headers=sh_block)
    assert r.status_code == 403, r.text

    # anon 401 (no bearer token; get_current_user rejects upstream)
    r = await client.get(f"/api/v1/courses/{cid}/student-exams")
    assert r.status_code == 401, r.text


async def test_owner_and_admin_can_view_list(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "d3t@x.com")
    await _make_exam(client, th, cid)
    r = await client.get(f"/api/v1/courses/{cid}/student-exams", headers=th)
    assert r.status_code == 200, r.text

    await create_user_in_db("d3admin@x.com", "password123", role=Role.admin)
    admin = await _tokens(client, "d3admin@x.com")
    ah = {"Authorization": f"Bearer {admin['access_token']}"}
    r = await client.get(f"/api/v1/courses/{cid}/student-exams", headers=ah)
    assert r.status_code == 200, r.text


async def test_attempts_left_counts_and_window_status(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "d4t@x.com")
    _, sh = await _student(client, "d4s@x.com")
    await _enroll_approved(client, th, cid, sh)
    exam = await _make_exam(client, th, cid, attempts_limit=2)
    q = await _add_mcq(client, th, exam["id"])

    # one submitted attempt -> used=1 left=1
    a1 = await client.post(f"/api/v1/exams/{exam['id']}/attempts", headers=sh)
    assert a1.status_code == 201, a1.text
    aid = a1.json()["id"]
    sub = await client.post(
        f"/api/v1/attempts/{aid}/submit",
        json={"answers": [{"question_id": q["id"], "selected_index": 2}]},
        headers=sh,
    )
    assert sub.status_code == 200, sub.text

    r = await client.get(f"/api/v1/courses/{cid}/student-exams", headers=sh)
    assert r.status_code == 200, r.text
    row = r.json()[0]
    assert row["attempts_used"] == 1
    assert row["attempts_left"] == 1
    assert row["has_in_progress"] is False
    # immediate mode reveals the auto-graded score (correct MCQ, max 4)
    assert row["last_score"] == 4
    _no_leak(r.json())

    # after_publish hides the score until the teacher publishes
    hidden = await _make_exam(client, th, cid, title="Hidden", show_result="after_publish")
    hq = await _add_mcq(client, th, hidden["id"])
    ha = await client.post(f"/api/v1/exams/{hidden['id']}/attempts", headers=sh)
    assert ha.status_code == 201, ha.text
    sub2 = await client.post(
        f"/api/v1/attempts/{ha.json()['id']}/submit",
        json={"answers": [{"question_id": hq["id"], "selected_index": 2}]},
        headers=sh,
    )
    assert sub2.status_code == 200, sub2.text
    assert sub2.json()["score"] is None
    r = await client.get(f"/api/v1/courses/{cid}/student-exams", headers=sh)
    by_id = {e["id"]: e for e in r.json()}
    assert by_id[hidden["id"]]["attempts_used"] == 1
    assert by_id[hidden["id"]]["last_score"] is None
    _no_leak(r.json())

    # upcoming window
    now = datetime.now(UTC)
    exam2 = await _make_exam(
        client,
        th,
        cid,
        title="Future",
        open_at=(now + timedelta(days=1)).isoformat(),
        close_at=(now + timedelta(days=2)).isoformat(),
    )
    r = await client.get(f"/api/v1/courses/{cid}/student-exams", headers=sh)
    assert r.status_code == 200, r.text
    by_id = {e["id"]: e for e in r.json()}
    assert by_id[exam2["id"]]["window_status"] == "upcoming"

    # closed window
    exam3 = await _make_exam(
        client,
        th,
        cid,
        title="Past",
        open_at=(now - timedelta(days=2)).isoformat(),
        close_at=(now - timedelta(days=1)).isoformat(),
    )
    r = await client.get(f"/api/v1/courses/{cid}/student-exams", headers=sh)
    by_id = {e["id"]: e for e in r.json()}
    assert by_id[exam3["id"]]["window_status"] == "closed"


async def test_join_discover_start_smoke(client: AsyncClient):
    """Full student arc in one test: join with code → approved → discover → start."""
    _, th, cid = await _teacher_with_course(client, "d6t@x.com")
    _, sh = await _student(client, "d6s@x.com")
    exam = await _make_exam(client, th, cid, title="Smoke exam")
    await _add_mcq(client, th, exam["id"])

    code_r = await client.post(f"/api/v1/courses/{cid}/codes", json={}, headers=th)
    raw = code_r.json()["code"]
    j = await client.post(
        "/api/v1/enrollments/join",
        json={"code": raw, "display_name": "Smoke"},
        headers=sh,
    )
    assert j.status_code == 201, j.text

    # pending: discovery gated out
    r = await client.get(f"/api/v1/courses/{cid}/student-exams", headers=sh)
    assert r.status_code == 403, r.text

    a = await client.post(f"/api/v1/enrollments/{j.json()['id']}/approve", headers=th)
    assert a.status_code == 200, a.text

    r = await client.get(f"/api/v1/courses/{cid}/student-exams", headers=sh)
    assert r.status_code == 200, r.text
    assert [e["id"] for e in r.json()] == [exam["id"]]
    _no_leak(r.json())

    s = await client.post(f"/api/v1/exams/{exam['id']}/attempts", headers=sh)
    assert s.status_code == 201, s.text
    assert s.json()["status"] == "in_progress"
    _no_leak(s.json())

    r = await client.get(f"/api/v1/courses/{cid}/student-exams", headers=sh)
    row = r.json()[0]
    assert row["attempts_used"] == 1
    assert row["attempts_left"] == 1
    assert row["has_in_progress"] is True


async def test_writer_preview_path_unchanged(client: AsyncClient):
    """Writers keep existing preview path; students still 403 there."""
    _, th, cid = await _teacher_with_course(client, "d5t@x.com")
    _, sh = await _student(client, "d5s@x.com")
    await _enroll_approved(client, th, cid, sh)
    await _make_exam(client, th, cid)

    r = await client.get(f"/api/v1/courses/{cid}/exams", headers=th)
    assert r.status_code == 200, r.text

    r = await client.get(f"/api/v1/courses/{cid}/exams", headers=sh)
    assert r.status_code == 403, r.text
