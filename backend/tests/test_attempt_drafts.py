"""Ticket 20: attempt answer autosave (drafts) + upsert submit (Seam: HTTP API).

Contract:
- POST /attempts/{id}/answers stores the current selection of an in-progress
  attempt without grading it: a draft row never carries a verdict.
- Drafts survive a reload (recovery contract) so a student can leave the
  exam and come back to the same attempt with the same answers.
- Submit grades the attempt and keeps EXACTLY ONE answer row per question
  (upsert, never a duplicate) even when drafts already exist.
- Ownership and trust are re-checked on every save: a foreign attempt or a
  blocked student gets 403, a submitted attempt is frozen (400).
- A MCQ with more than 4 options must be answerable: selecting the highest
  index saves and submits without a database integrity error.
"""

import asyncio
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models.attempt import Attempt, AttemptAnswer
from app.models.user import Role
from tests.helpers import (
    add_essay,
    add_mcq,
    add_tf,
    create_user_in_db,
    enroll_approved,
    expire_attempt_in_db,
    login,
    make_exam,
    open_db_session,
    start_attempt,
    teacher_with_course,
)


async def _student(client: AsyncClient, email: str):
    await create_user_in_db(email, "password123", role=Role.student)
    toks = await login(client, email, "password123")
    return toks, {"Authorization": f"Bearer {toks['access_token']}"}


async def _answer_rows(attempt_id: str) -> list[AttemptAnswer]:
    async with open_db_session() as session:
        result = await session.execute(
            select(AttemptAnswer).where(AttemptAnswer.attempt_id == uuid.UUID(attempt_id))
        )
        return list(result.scalars().all())


def _no_leak(body) -> None:
    blob = str(body)
    assert "correct_index" not in blob, f"leak in {blob[:500]}"
    assert "correct_answer" not in blob, f"leak in {blob[:500]}"


async def test_save_answers_persists_selection_without_verdict(client: AsyncClient):
    _, th, cid = await teacher_with_course(client, "a1t@x.com")
    _, sh = await _student(client, "a1s@x.com")
    await enroll_approved(client, th, cid, sh)
    exam = await make_exam(client, th, cid)
    mcq = await add_mcq(client, th, exam["id"])
    tf = await add_tf(client, th, exam["id"])
    essay = await add_essay(client, th, exam["id"])
    aid = await start_attempt(client, sh, exam["id"])

    r = await client.post(
        f"/api/v1/attempts/{aid}/answers",
        json={
            "answers": [
                {"question_id": mcq["id"], "selected_index": 2},
                {"question_id": tf["id"], "selected_bool": True},
                {"question_id": essay["id"], "text_answer":  "  شرح  "},
            ]
        },
        headers=sh,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"] == aid
    assert body["status"] == "in_progress"
    assert body["score"] is None
    by_q = {x["question_id"]: x for x in body["answers"]}
    assert by_q[mcq["id"]]["selected_index"] == 2
    assert by_q[tf["id"]]["selected_bool"] is True
    assert by_q[essay["id"]]["text_answer"] == "شرح"
    # a draft never carries a verdict
    for row in by_q.values():
        assert row["awarded_score"] is None
        assert row["is_correct"] is None
        assert row["needs_grading"] is False
    _no_leak(body)

    # A fresh API read still shows the draft and no verdict: the "no grade
    # before submit" contract is observable, not a storage detail.
    got = await client.get(f"/api/v1/attempts/{aid}", headers=sh)
    assert got.status_code == 200, got.text
    read = got.json()
    assert read["score"] is None
    assert all(row["needs_grading"] is False for row in read["answers"])


async def test_recovery_contract_reload_returns_same_attempt_and_answers(client: AsyncClient):
    _, th, cid = await teacher_with_course(client, "a2t@x.com")
    _, sh = await _student(client, "a2s@x.com")
    await enroll_approved(client, th, cid, sh)
    exam = await make_exam(client, th, cid)
    mcq = await add_mcq(client, th, exam["id"])
    aid = await start_attempt(client, sh, exam["id"])

    saved = await client.post(
        f"/api/v1/attempts/{aid}/answers",
        json={"answers": [{"question_id": mcq["id"], "selected_index": 3}]},
        headers=sh,
    )
    assert saved.status_code == 200, saved.text

    # fresh read of the same attempt: same id, same saved answers
    got = await client.get(f"/api/v1/attempts/{aid}", headers=sh)
    assert got.status_code == 200, got.text
    body = got.json()
    assert body["id"] == aid
    assert body["status"] == "in_progress"
    row = next(x for x in body["answers"] if x["question_id"] == mcq["id"])
    assert row["selected_index"] == 3
    assert row["awarded_score"] is None
    assert row["is_correct"] is None

    # the history list agrees
    lst = await client.get(f"/api/v1/exams/{exam['id']}/attempts/me", headers=sh)
    assert lst.status_code == 200, lst.text
    attempt_row = next(x for x in lst.json() if x["id"] == aid)
    assert attempt_row["status"] == "in_progress"
    row = next(x for x in attempt_row["answers"] if x["question_id"] == mcq["id"])
    assert row["selected_index"] == 3
    assert row["awarded_score"] is None


async def test_submit_after_drafts_grades_once_without_duplicates(client: AsyncClient):
    _, th, cid = await teacher_with_course(client, "a3t@x.com")
    _, sh = await _student(client, "a3s@x.com")
    await enroll_approved(client, th, cid, sh)
    exam = await make_exam(client, th, cid)
    mcq = await add_mcq(client, th, exam["id"], correct=2, max_score=4)
    tf = await add_tf(client, th, exam["id"], correct=True, max_score=2)
    essay = await add_essay(client, th, exam["id"], max_score=10)
    aid = await start_attempt(client, sh, exam["id"])

    draft = await client.post(
        f"/api/v1/attempts/{aid}/answers",
        json={
            "answers": [
                {"question_id": mcq["id"], "selected_index": 2},
                {"question_id": tf["id"], "selected_bool": True},
                {"question_id": essay["id"], "text_answer": "شرح"},
            ]
        },
        headers=sh,
    )
    assert draft.status_code == 200, draft.text

    sub = await client.post(
        f"/api/v1/attempts/{aid}/submit",
        json={
            "answers": [
                {"question_id": mcq["id"], "selected_index": 2},
                {"question_id": tf["id"], "selected_bool": True},
                {"question_id": essay["id"], "text_answer": "شرح"},
            ]
        },
        headers=sh,
    )
    assert sub.status_code == 200, sub.text
    body = sub.json()
    assert body["status"] == "submitted"
    assert body["score"] == 6  # mcq 4 + tf 2, essay pending
    assert body["max_score"] == 16
    by_q = {x["question_id"]: x for x in body["answers"]}
    assert by_q[mcq["id"]]["selected_index"] == 2
    assert by_q[mcq["id"]]["awarded_score"] == 4
    assert by_q[mcq["id"]]["is_correct"] is True
    assert by_q[tf["id"]]["selected_bool"] is True
    assert by_q[tf["id"]]["awarded_score"] == 2
    assert by_q[essay["id"]]["awarded_score"] == 0
    assert by_q[essay["id"]]["needs_grading"] is True
    _no_leak(body)

    # exactly one row per question — no duplicates from the draft rows
    rows = await _answer_rows(aid)
    assert len(rows) == 3
    assert len({row.question_id for row in rows}) == 3
    stored = {str(row.question_id): row for row in rows}
    assert stored[mcq["id"]].selected_index == 2
    assert stored[mcq["id"]].awarded_score == 4
    assert stored[tf["id"]].selected_bool is True
    assert stored[essay["id"]].needs_grading is True


async def test_submit_payload_is_authoritative_but_keeps_one_row_per_question(
    client: AsyncClient,
):
    """A draft for a question the submit omits is still one row — stored
    unanswered and scoring 0. The upsert never leaves a question without a
    row and never leaves two rows for the same question."""
    _, th, cid = await teacher_with_course(client, "a8t@x.com")
    _, sh = await _student(client, "a8s@x.com")
    await enroll_approved(client, th, cid, sh)
    exam = await make_exam(client, th, cid)
    q1 = await add_mcq(client, th, exam["id"], correct=2, max_score=4)
    q2 = await add_mcq(client, th, exam["id"], correct=1, max_score=6)
    aid = await start_attempt(client, sh, exam["id"])

    draft = await client.post(
        f"/api/v1/attempts/{aid}/answers",
        json={"answers": [{"question_id": q1["id"], "selected_index": 2}]},
        headers=sh,
    )
    assert draft.status_code == 200, draft.text

    sub = await client.post(
        f"/api/v1/attempts/{aid}/submit",
        json={"answers": [{"question_id": q2["id"], "selected_index": 1}]},
        headers=sh,
    )
    assert sub.status_code == 200, sub.text
    assert sub.json()["score"] == 6

    rows = await _answer_rows(aid)
    assert len(rows) == 2
    assert len({row.question_id for row in rows}) == 2
    stored = {str(row.question_id): row for row in rows}
    assert stored[q1["id"]].selected_index is None
    assert stored[q1["id"]].awarded_score == 0
    assert stored[q2["id"]].selected_index == 1
    assert stored[q2["id"]].awarded_score == 6


async def test_save_to_submitted_attempt_rejected(client: AsyncClient):
    _, th, cid = await teacher_with_course(client, "a4t@x.com")
    _, sh = await _student(client, "a4s@x.com")
    await enroll_approved(client, th, cid, sh)
    exam = await make_exam(client, th, cid)
    mcq = await add_mcq(client, th, exam["id"])
    aid = await start_attempt(client, sh, exam["id"])

    sub = await client.post(
        f"/api/v1/attempts/{aid}/submit",
        json={"answers": [{"question_id": mcq["id"], "selected_index": 2}]},
        headers=sh,
    )
    assert sub.status_code == 200, sub.text

    r = await client.post(
        f"/api/v1/attempts/{aid}/answers",
        json={"answers": [{"question_id": mcq["id"], "selected_index": 1}]},
        headers=sh,
    )
    assert r.status_code == 400, r.text


async def test_foreign_and_blocked_students_cannot_save(client: AsyncClient):
    _, th, cid = await teacher_with_course(client, "a5t@x.com")
    _, sh1 = await _student(client, "a5s1@x.com")
    _, sh2 = await _student(client, "a5s2@x.com")
    eid = await enroll_approved(client, th, cid, sh1)
    await enroll_approved(client, th, cid, sh2)
    exam = await make_exam(client, th, cid)
    mcq = await add_mcq(client, th, exam["id"])
    aid = await start_attempt(client, sh1, exam["id"])

    # another student cannot write into someone else's attempt
    r = await client.post(
        f"/api/v1/attempts/{aid}/answers",
        json={"answers": [{"question_id": mcq["id"], "selected_index": 2}]},
        headers=sh2,
    )
    assert r.status_code == 403, r.text

    # a student blocked after starting loses the right to save
    b = await client.post(f"/api/v1/enrollments/{eid}/block", headers=th)
    assert b.status_code == 200, b.text
    r = await client.post(
        f"/api/v1/attempts/{aid}/answers",
        json={"answers": [{"question_id": mcq["id"], "selected_index": 2}]},
        headers=sh1,
    )
    assert r.status_code == 403, r.text

    # unknown attempt 404
    r = await client.post(
        "/api/v1/attempts/00000000-0000-0000-0000-000000000000/answers",
        json={"answers": [{"question_id": mcq["id"], "selected_index": 2}]},
        headers=sh1,
    )
    assert r.status_code == 404, r.text


async def test_unknown_and_duplicate_questions_rejected(client: AsyncClient):
    _, th, cid = await teacher_with_course(client, "a6t@x.com")
    _, sh = await _student(client, "a6s@x.com")
    await enroll_approved(client, th, cid, sh)
    exam = await make_exam(client, th, cid)
    mcq = await add_mcq(client, th, exam["id"])
    aid = await start_attempt(client, sh, exam["id"])

    # unknown question id
    r = await client.post(
        f"/api/v1/attempts/{aid}/answers",
        json={"answers": [{"question_id": "00000000-0000-0000-0000-000000000000"}]},
        headers=sh,
    )
    assert r.status_code == 400, r.text

    # duplicate question id in one payload
    r = await client.post(
        f"/api/v1/attempts/{aid}/answers",
        json={
            "answers": [
                {"question_id": mcq["id"], "selected_index": 2},
                {"question_id": mcq["id"], "selected_index": 1},
            ]
        },
        headers=sh,
    )
    assert r.status_code == 400, r.text

    # nothing was written by the rejected payloads
    rows = await _answer_rows(aid)
    assert rows == []


async def test_high_option_index_saves_and_submits(client: AsyncClient):
    """Regression: the answer row used to cap selected_index at 3, so a MCQ
    with 6 options blew up with an IntegrityError on submit."""
    _, th, cid = await teacher_with_course(client, "a7t@x.com")
    _, sh = await _student(client, "a7s@x.com")
    await enroll_approved(client, th, cid, sh)
    exam = await make_exam(client, th, cid)
    options = ["1", "2", "3", "4", "5", "6"]
    mcq = await add_mcq(client, th, exam["id"], correct=5, max_score=3, options=options)
    aid = await start_attempt(client, sh, exam["id"])

    r = await client.post(
        f"/api/v1/attempts/{aid}/answers",
        json={"answers": [{"question_id": mcq["id"], "selected_index": 5}]},
        headers=sh,
    )
    assert r.status_code == 200, r.text
    row = next(x for x in r.json()["answers"] if x["question_id"] == mcq["id"])
    assert row["selected_index"] == 5

    sub = await client.post(
        f"/api/v1/attempts/{aid}/submit",
        json={"answers": [{"question_id": mcq["id"], "selected_index": 5}]},
        headers=sh,
    )
    assert sub.status_code == 200, sub.text
    assert sub.json()["score"] == 3
    assert sub.json()["answers"][0]["selected_index"] == 5
    _no_leak(sub.json())

    rows = await _answer_rows(aid)
    assert len(rows) == 1
    assert rows[0].selected_index == 5


async def test_draft_after_submit_is_refused_and_grades_survive(client: AsyncClient):
    """A late autosave may never rewrite a graded attempt.

    The draft path resets verdicts on the rows it touches, so a save that
    lands after submit would silently zero the grades. The attempt row is
    locked and the status re-checked under that lock.
    """
    _, th, cid = await teacher_with_course(client, "a8t@x.com")
    _, sh = await _student(client, "a8s@x.com")
    await enroll_approved(client, th, cid, sh)
    exam = await make_exam(client, th, cid)
    mcq = await add_mcq(client, th, exam["id"], correct=2, max_score=4)
    aid = await start_attempt(client, sh, exam["id"])

    sub = await client.post(
        f"/api/v1/attempts/{aid}/submit",
        json={"answers": [{"question_id": mcq["id"], "selected_index": 2}]},
        headers=sh,
    )
    assert sub.status_code == 200, sub.text
    assert sub.json()["score"] == 4

    late = await client.post(
        f"/api/v1/attempts/{aid}/answers",
        json={"answers": [{"question_id": mcq["id"], "selected_index": 0}]},
        headers=sh,
    )
    assert late.status_code == 400, late.text

    after = await client.get(f"/api/v1/attempts/{aid}", headers=sh)
    assert after.status_code == 200, after.text
    body = after.json()
    assert body["score"] == 4
    row = next(x for x in body["answers"] if x["question_id"] == mcq["id"])
    assert row["selected_index"] == 2
    assert row["awarded_score"] == 4
    assert row["is_correct"] is True


async def test_draft_save_waits_for_the_attempt_row_lock(client: AsyncClient):
    """Draft writes serialize on the attempt row: while another transaction
    holds it (as a submit does), the save cannot proceed and therefore cannot
    interleave with grading."""
    _, th, cid = await teacher_with_course(client, "a9t@x.com")
    _, sh = await _student(client, "a9s@x.com")
    await enroll_approved(client, th, cid, sh)
    exam = await make_exam(client, th, cid)
    mcq = await add_mcq(client, th, exam["id"])
    aid = await start_attempt(client, sh, exam["id"])

    async with open_db_session() as holder:
        await holder.execute(
            select(Attempt).where(Attempt.id == uuid.UUID(aid)).with_for_update()
        )
        save = asyncio.create_task(
            client.post(
                f"/api/v1/attempts/{aid}/answers",
                json={"answers": [{"question_id": mcq["id"], "selected_index": 1}]},
                headers=sh,
            )
        )
        with pytest.raises(TimeoutError):
            await asyncio.wait_for(asyncio.shield(save), 0.5)
        await holder.rollback()

    r = await asyncio.wait_for(save, 10)
    assert r.status_code == 200, r.text
    row = next(x for x in r.json()["answers"] if x["question_id"] == mcq["id"])
    assert row["selected_index"] == 1


async def test_expired_attempt_keeps_the_saved_selection_and_scores_zero(
    client: AsyncClient,
):
    """Expiry closes the attempt at 0 but does not erase the draft: the
    receipt still shows what the student had chosen."""
    _, th, cid = await teacher_with_course(client, "a10t@x.com")
    _, sh = await _student(client, "a10s@x.com")
    await enroll_approved(client, th, cid, sh)
    exam = await make_exam(client, th, cid, attempts_limit=2)
    mcq = await add_mcq(client, th, exam["id"], correct=2, max_score=4)
    aid = await start_attempt(client, sh, exam["id"])

    saved = await client.post(
        f"/api/v1/attempts/{aid}/answers",
        json={"answers": [{"question_id": mcq["id"], "selected_index": 2}]},
        headers=sh,
    )
    assert saved.status_code == 200, saved.text
    await expire_attempt_in_db(aid)

    # The student-safe read settles attempts the clock already closed.
    read = await client.get(f"/api/v1/exams/{exam['id']}/student-exam", headers=sh)
    assert read.status_code == 200, read.text
    assert read.json()["has_in_progress"] is False
    assert read.json()["attempts_used"] == 1
    assert read.json()["attempts_left"] == 1

    got = await client.get(f"/api/v1/attempts/{aid}", headers=sh)
    assert got.status_code == 200, got.text
    body = got.json()
    assert body["status"] == "submitted"
    assert body["score"] == 0
    assert body["is_late"] is True
    row = next(x for x in body["answers"] if x["question_id"] == mcq["id"])
    assert row["selected_index"] == 2
    assert row["awarded_score"] == 0
    assert row["needs_grading"] is False
