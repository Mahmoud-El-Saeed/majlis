"""Ticket 20: student-safe single-exam read (Seam: HTTP API).

Contract:
- GET /exams/{id}/student-exam gated by can_view (approved enrollment,
  owner-teacher, admin). pending/blocked/outsider 403, anon 401, unknown
  exam 404.
- Payload = StudentExamOut + questions_count: title, description,
  duration_minutes, attempts_used/attempts_limit, window_status and the
  personal progress numbers (has_in_progress, last_score).
- Never leaks questions or answers: only the COUNT of questions. No
  correct_index/correct_answer/prompt/options/questions key appears
  anywhere in the body.
"""

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient

from app.models.user import Role
from tests.helpers import (
    add_mcq,
    create_user_in_db,
    enroll_approved,
    login,
    make_exam,
    teacher_with_course,
)


async def _student(client: AsyncClient, email: str):
    await create_user_in_db(email, "password123", role=Role.student)
    toks = await login(client, email, "password123")
    return toks, {"Authorization": f"Bearer {toks['access_token']}"}


def _all_keys(node) -> set[str]:
    """Every key that appears anywhere in a JSON document."""
    keys: set[str] = set()
    if isinstance(node, dict):
        for key, value in node.items():
            keys.add(key)
            keys |= _all_keys(value)
    elif isinstance(node, list):
        for item in node:
            keys |= _all_keys(item)
    return keys


def _no_leak(raw: str, body) -> None:
    """No question body, no option list, no answer key in the payload."""
    keys = _all_keys(body)
    for banned in ("correct_index", "correct_answer", "prompt", "options", "questions"):
        assert banned not in keys, f"leaked key {banned} in {raw[:500]}"
    # Raw-body check as well. "questions_count" is the one allowed token that
    # contains "questions", so it is masked before the substring sweep.
    scrubbed = raw.replace('"questions_count"', '"__count__"')
    for banned in ("correct_index", "correct_answer", "prompt", "options", "questions"):
        assert banned not in scrubbed, f"leak {banned} in {scrubbed[:500]}"


async def test_approved_student_reads_single_exam(client: AsyncClient):
    _, th, cid = await teacher_with_course(client, "r1t@x.com")
    _, sh = await _student(client, "r1s@x.com")
    await enroll_approved(client, th, cid, sh)
    exam = await make_exam(
        client, th, cid, title="Midterm", description="Chapter review", attempts_limit=3
    )
    await add_mcq(client, th, exam["id"])
    await add_mcq(client, th, exam["id"], correct=1)

    r = await client.get(f"/api/v1/exams/{exam['id']}/student-exam", headers=sh)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"] == exam["id"]
    assert body["course_id"] == cid
    assert body["title"] == "Midterm"
    assert body["description"] == "Chapter review"
    assert body["duration_minutes"] == 30
    assert body["attempts_limit"] == 3
    assert body["attempts_used"] == 0
    assert body["attempts_left"] == 3
    assert body["window_status"] == "open"
    assert body["has_in_progress"] is False
    assert body["last_score"] is None
    assert body["questions_count"] == 2
    _no_leak(r.text, body)


async def test_questions_count_is_real_and_nothing_else_leaks(client: AsyncClient):
    _, th, cid = await teacher_with_course(client, "r2t@x.com")
    _, sh = await _student(client, "r2s@x.com")
    await enroll_approved(client, th, cid, sh)
    exam = await make_exam(client, th, cid)
    for _ in range(3):
        await add_mcq(client, th, exam["id"])

    r = await client.get(f"/api/v1/exams/{exam['id']}/student-exam", headers=sh)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["questions_count"] == 3
    _no_leak(r.text, body)


async def test_pending_blocked_outsider_403_anon_401_unknown_404(client: AsyncClient):
    _, th, cid = await teacher_with_course(client, "r3t@x.com")
    _, sh_pending = await _student(client, "r3p@x.com")
    _, sh_out = await _student(client, "r3o@x.com")
    _, sh_block = await _student(client, "r3b@x.com")
    exam = await make_exam(client, th, cid)
    url = f"/api/v1/exams/{exam['id']}/student-exam"

    # outsider (no enrollment) 403
    r = await client.get(url, headers=sh_out)
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
    r = await client.get(url, headers=sh_pending)
    assert r.status_code == 403, r.text

    # blocked 403
    eid = await enroll_approved(client, th, cid, sh_block)
    b = await client.post(f"/api/v1/enrollments/{eid}/block", headers=th)
    assert b.status_code == 200, b.text
    r = await client.get(url, headers=sh_block)
    assert r.status_code == 403, r.text

    # anon 401
    r = await client.get(url)
    assert r.status_code == 401, r.text

    # unknown exam 404
    r = await client.get(
        "/api/v1/exams/00000000-0000-0000-0000-000000000000/student-exam", headers=sh_out
    )
    assert r.status_code == 404, r.text


async def test_owner_teacher_and_admin_can_read(client: AsyncClient):
    _, th, cid = await teacher_with_course(client, "r4t@x.com")
    exam = await make_exam(client, th, cid)
    await add_mcq(client, th, exam["id"])

    r = await client.get(f"/api/v1/exams/{exam['id']}/student-exam", headers=th)
    assert r.status_code == 200, r.text
    assert r.json()["questions_count"] == 1
    _no_leak(r.text, r.json())

    await create_user_in_db("r4admin@x.com", "password123", role=Role.admin)
    admin = await login(client, "r4admin@x.com", "password123")
    ah = {"Authorization": f"Bearer {admin['access_token']}"}
    r = await client.get(f"/api/v1/exams/{exam['id']}/student-exam", headers=ah)
    assert r.status_code == 200, r.text
    assert r.json()["questions_count"] == 1
    _no_leak(r.text, r.json())


async def test_progress_numbers_match_the_list_projection(client: AsyncClient):
    _, th, cid = await teacher_with_course(client, "r5t@x.com")
    _, sh = await _student(client, "r5s@x.com")
    await enroll_approved(client, th, cid, sh)
    exam = await make_exam(client, th, cid, attempts_limit=3)
    q = await add_mcq(client, th, exam["id"])
    url = f"/api/v1/exams/{exam['id']}/student-exam"

    # an open attempt counts as used and flags has_in_progress
    a = await client.post(f"/api/v1/exams/{exam['id']}/attempts", headers=sh)
    assert a.status_code == 201, a.text
    aid = a.json()["id"]

    body = (await client.get(url, headers=sh)).json()
    assert body["has_in_progress"] is True
    assert body["attempts_used"] == 1
    assert body["attempts_left"] == 2
    assert body["last_score"] is None

    # submitted attempt: still used, no longer in progress, score visible
    sub = await client.post(
        f"/api/v1/attempts/{aid}/submit",
        json={"answers": [{"question_id": q["id"], "selected_index": 2}]},
        headers=sh,
    )
    assert sub.status_code == 200, sub.text

    body = (await client.get(url, headers=sh)).json()
    assert body["has_in_progress"] is False
    assert body["attempts_used"] == 1
    assert body["attempts_left"] == 2
    assert body["last_score"] == 4

    # the detail read agrees with the list read (same helper, same numbers)
    listed = (await client.get(f"/api/v1/courses/{cid}/student-exams", headers=sh)).json()
    row = next(e for e in listed if e["id"] == exam["id"])
    assert row["attempts_used"] == body["attempts_used"]
    assert row["attempts_left"] == body["attempts_left"]
    assert row["has_in_progress"] == body["has_in_progress"]
    assert row["last_score"] == body["last_score"]


async def test_window_status_reflects_upcoming_and_closed(client: AsyncClient):
    _, th, cid = await teacher_with_course(client, "r6t@x.com")
    _, sh = await _student(client, "r6s@x.com")
    await enroll_approved(client, th, cid, sh)
    now = datetime.now(UTC)

    upcoming = await make_exam(
        client,
        th,
        cid,
        title="Future",
        open_at=(now + timedelta(days=1)).isoformat(),
        close_at=(now + timedelta(days=2)).isoformat(),
    )
    closed = await make_exam(
        client,
        th,
        cid,
        title="Past",
        open_at=(now - timedelta(days=2)).isoformat(),
        close_at=(now - timedelta(days=1)).isoformat(),
    )

    r = await client.get(f"/api/v1/exams/{upcoming['id']}/student-exam", headers=sh)
    assert r.status_code == 200, r.text
    assert r.json()["window_status"] == "upcoming"

    r = await client.get(f"/api/v1/exams/{closed['id']}/student-exam", headers=sh)
    assert r.status_code == 200, r.text
    assert r.json()["window_status"] == "closed"
