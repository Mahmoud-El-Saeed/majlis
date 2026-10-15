"""Ticket 09 red phase: Grading + gradebook — teacher side (Seam 5).

Contract under test:
- Teacher (owner/admin) grades pending essays with score + feedback; total retallied.
- Essay-only: MCQ/TF rows rejected for manual grading.
- Publish gates: immediate reveals instantly; after_publish hides until
  POST /attempts/{id}/publish or POST /exams/{id}/publish (bulk).
- Gradebook: per-course JSON + CSV export, one entry per submitted attempt
  (in_progress excluded), with per-student totals and per-question breakdown.
- Authz: writer gate (owner-teacher/admin) via can_write; other teacher/student 403, anon 401.
"""

from httpx import AsyncClient

from app.models.user import Role
from tests.helpers import create_user_in_db, login


async def _tokens(client: AsyncClient, email: str, password: str = "password123"):
    return await login(client, email, password)


async def _teacher_with_course(client: AsyncClient, email: str = "grade_teacher@x.com"):
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
        "attempts_limit": 5,
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


async def _add_essay(client, teacher_h, exam_id, max_score=10):
    r = await client.post(
        f"/api/v1/exams/{exam_id}/questions",
        json={"type": "essay", "prompt": "Explain.", "max_score": max_score},
        headers=teacher_h,
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _submit(client, student_h, exam_id, answers: list[dict], expected: int = 200):
    a = await client.post(f"/api/v1/exams/{exam_id}/attempts", headers=student_h)
    assert a.status_code == 201, a.text
    aid = a.json()["id"]
    sub = await client.post(
        f"/api/v1/attempts/{aid}/submit", json={"answers": answers}, headers=student_h
    )
    assert sub.status_code == expected, sub.text
    return aid, sub.json() if expected == 200 else None


async def test_teacher_can_grade_essay_and_retotal(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "g1t@x.com")
    _, sh = await _student(client, "g1s@x.com")
    await _enroll_approved(client, th, cid, sh)
    exam = await _make_exam(client, th, cid, show_result="immediate")
    mcq = await _add_mcq(client, th, exam["id"], correct=2, max_score=4)
    essay = await _add_essay(client, th, exam["id"], max_score=10)

    aid, _ = await _submit(
        client,
        sh,
        exam["id"],
        [
            {"question_id": mcq["id"], "selected_index": 2},
            {"question_id": essay["id"], "text_answer": "شرح مفصل"},
        ],
    )

    g = await client.patch(
        f"/api/v1/attempts/{aid}/answers/{essay['id']}",
        json={"awarded_score": 7, "feedback": "أحسنت، ينقصك دليل."},
        headers=th,
    )
    assert g.status_code == 200, g.text
    body = g.json()
    assert body["question_id"] == essay["id"]
    assert body["awarded_score"] == 7
    assert body["needs_grading"] is False
    assert body["feedback"] == "أحسنت، ينقصك دليل."
    assert body["attempt_score"] == 11  # 4 auto + 7 manual

    # re-grade updates the total
    g2 = await client.patch(
        f"/api/v1/attempts/{aid}/answers/{essay['id']}",
        json={"awarded_score": 9, "feedback": "ممتاز بعد المراجعة."},
        headers=th,
    )
    assert g2.status_code == 200, g2.text
    assert g2.json()["awarded_score"] == 9
    assert g2.json()["attempt_score"] == 13


async def test_essay_grade_immediate_visible_to_student(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "g2t@x.com")
    _, sh = await _student(client, "g2s@x.com")
    await _enroll_approved(client, th, cid, sh)
    exam = await _make_exam(client, th, cid, show_result="immediate")
    essay = await _add_essay(client, th, exam["id"], max_score=10)

    aid, _ = await _submit(
        client, sh, exam["id"], [{"question_id": essay["id"], "text_answer": "شرح"}]
    )
    g = await client.patch(
        f"/api/v1/attempts/{aid}/answers/{essay['id']}",
        json={"awarded_score": 8, "feedback": "جيد."},
        headers=th,
    )
    assert g.status_code == 200, g.text

    view = await client.get(f"/api/v1/attempts/{aid}", headers=sh)
    assert view.status_code == 200, view.text
    body = view.json()
    assert body["score"] == 8
    assert body["answers"][0]["awarded_score"] == 8
    assert body["answers"][0]["feedback"] == "جيد."


async def test_after_publish_hidden_until_single_publish(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "g3t@x.com")
    _, sh = await _student(client, "g3s@x.com")
    await _enroll_approved(client, th, cid, sh)
    exam = await _make_exam(client, th, cid, show_result="after_publish")
    essay = await _add_essay(client, th, exam["id"], max_score=10)

    aid, _ = await _submit(
        client, sh, exam["id"], [{"question_id": essay["id"], "text_answer": "شرح"}]
    )
    g = await client.patch(
        f"/api/v1/attempts/{aid}/answers/{essay['id']}",
        json={"awarded_score": 6, "feedback": "مقبول."},
        headers=th,
    )
    assert g.status_code == 200, g.text

    hidden = await client.get(f"/api/v1/attempts/{aid}", headers=sh)
    assert hidden.status_code == 200, hidden.text
    assert hidden.json()["score"] is None
    assert hidden.json()["answers"][0]["awarded_score"] is None
    assert hidden.json()["answers"][0]["feedback"] is None

    pub = await client.post(f"/api/v1/attempts/{aid}/publish", headers=th)
    assert pub.status_code == 200, pub.text
    assert pub.json()["is_published"] is True

    shown = await client.get(f"/api/v1/attempts/{aid}", headers=sh)
    assert shown.json()["score"] == 6
    assert shown.json()["answers"][0]["awarded_score"] == 6
    assert shown.json()["answers"][0]["feedback"] == "مقبول."


async def test_bulk_publish_publishes_all_remaining(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "g4t@x.com")
    _, sh1 = await _student(client, "g4s1@x.com")
    _, sh2 = await _student(client, "g4s2@x.com")
    await _enroll_approved(client, th, cid, sh1, name="A")
    await _enroll_approved(client, th, cid, sh2, name="B")
    exam = await _make_exam(client, th, cid, show_result="after_publish")
    mcq = await _add_mcq(client, th, exam["id"], correct=2, max_score=4)

    aid1, _ = await _submit(
        client, sh1, exam["id"], [{"question_id": mcq["id"], "selected_index": 2}]
    )
    aid2, _ = await _submit(
        client, sh2, exam["id"], [{"question_id": mcq["id"], "selected_index": 0}]
    )

    pub = await client.post(f"/api/v1/exams/{exam['id']}/publish", headers=th)
    assert pub.status_code == 200, pub.text
    assert pub.json()["published"] == 2

    for sh, aid, expected in ((sh1, aid1, 4), (sh2, aid2, 0)):
        view = await client.get(f"/api/v1/attempts/{aid}", headers=sh)
        assert view.status_code == 200, view.text
        assert view.json()["score"] == expected, view.text

    # idempotent: second bulk publishes nothing new
    again = await client.post(f"/api/v1/exams/{exam['id']}/publish", headers=th)
    assert again.status_code == 200, again.text
    assert again.json()["published"] == 0


async def test_publish_immediate_exam_rejected(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "g5t@x.com")
    _, sh = await _student(client, "g5s@x.com")
    await _enroll_approved(client, th, cid, sh)
    exam = await _make_exam(client, th, cid, show_result="immediate")
    mcq = await _add_mcq(client, th, exam["id"])
    aid, _ = await _submit(
        client, sh, exam["id"], [{"question_id": mcq["id"], "selected_index": 2}]
    )

    r = await client.post(f"/api/v1/attempts/{aid}/publish", headers=th)
    assert r.status_code == 400, r.text
    r2 = await client.post(f"/api/v1/exams/{exam['id']}/publish", headers=th)
    assert r2.status_code == 400, r2.text


async def test_grading_validation_errors(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "g6t@x.com")
    _, sh = await _student(client, "g6s@x.com")
    await _enroll_approved(client, th, cid, sh)
    exam = await _make_exam(client, th, cid, show_result="immediate")
    mcq = await _add_mcq(client, th, exam["id"], correct=2, max_score=4)
    essay = await _add_essay(client, th, exam["id"], max_score=10)

    # in_progress attempt cannot be graded
    a = await client.post(f"/api/v1/exams/{exam['id']}/attempts", headers=sh)
    in_prog = a.json()["id"]
    r = await client.patch(
        f"/api/v1/attempts/{in_prog}/answers/{essay['id']}",
        json={"awarded_score": 5, "feedback": "مبكر."},
        headers=th,
    )
    assert r.status_code == 400, r.text

    # submit that same in_progress row, then keep grading it
    sub = await client.post(
        f"/api/v1/attempts/{in_prog}/submit",
        json={
            "answers": [
                {"question_id": mcq["id"], "selected_index": 2},
                {"question_id": essay["id"], "text_answer": "شرح"},
            ]
        },
        headers=sh,
    )
    assert sub.status_code == 200, sub.text
    aid = in_prog

    # MCQ rows are not manually gradeable (essay-only)
    r = await client.patch(
        f"/api/v1/attempts/{aid}/answers/{mcq['id']}",
        json={"awarded_score": 4, "feedback": "لا ينطبق."},
        headers=th,
    )
    assert r.status_code == 400, r.text

    # over max_score rejected
    r = await client.patch(
        f"/api/v1/attempts/{aid}/answers/{essay['id']}",
        json={"awarded_score": 99, "feedback": "كثير."},
        headers=th,
    )
    assert r.status_code in (400, 422), r.text

    # negative rejected
    r = await client.patch(
        f"/api/v1/attempts/{aid}/answers/{essay['id']}",
        json={"awarded_score": -1, "feedback": "سالب."},
        headers=th,
    )
    assert r.status_code in (400, 422), r.text

    # missing feedback rejected (ticket: score + feedback text)
    r = await client.patch(
        f"/api/v1/attempts/{aid}/answers/{essay['id']}",
        json={"awarded_score": 5},
        headers=th,
    )
    assert r.status_code in (400, 422), r.text

    # blank feedback rejected
    r = await client.patch(
        f"/api/v1/attempts/{aid}/answers/{essay['id']}",
        json={"awarded_score": 5, "feedback": "   "},
        headers=th,
    )
    assert r.status_code in (400, 422), r.text

    # unknown question → 404/400
    r = await client.patch(
        f"/api/v1/attempts/{aid}/answers/00000000-0000-0000-0000-000000000000",
        json={"awarded_score": 5, "feedback": "غامض."},
        headers=th,
    )
    assert r.status_code in (400, 404), r.text

    # unknown attempt → 404
    r = await client.patch(
        "/api/v1/attempts/00000000-0000-0000-0000-000000000000/answers/{}".format(essay["id"]),
        json={"awarded_score": 5, "feedback": "غامض."},
        headers=th,
    )
    assert r.status_code == 404, r.text


async def test_grading_and_gradebook_forbidden_for_outsiders(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "g7t@x.com")
    await create_user_in_db("g7other@x.com", "password123", role=Role.teacher)
    other = await _tokens(client, "g7other@x.com")
    oh = {"Authorization": f"Bearer {other['access_token']}"}
    _, sh = await _student(client, "g7s@x.com")
    await _enroll_approved(client, th, cid, sh)
    exam = await _make_exam(client, th, cid, show_result="immediate")
    essay = await _add_essay(client, th, exam["id"], max_score=10)
    aid, _ = await _submit(
        client, sh, exam["id"], [{"question_id": essay["id"], "text_answer": "شرح"}]
    )

    grade_url = f"/api/v1/attempts/{aid}/answers/{essay['id']}"
    for h in (oh, sh):
        assert (
            await client.patch(
                grade_url, json={"awarded_score": 5, "feedback": "محاولة."}, headers=h
            )
        ).status_code == 403
        assert (await client.post(f"/api/v1/attempts/{aid}/publish", headers=h)).status_code == 403
        assert (
            await client.post(f"/api/v1/exams/{exam['id']}/publish", headers=h)
        ).status_code == 403
        assert (await client.get(f"/api/v1/courses/{cid}/gradebook", headers=h)).status_code == 403
        assert (
            await client.get(f"/api/v1/courses/{cid}/gradebook/export", headers=h)
        ).status_code == 403

    # anon
    assert (
        await client.patch(grade_url, json={"awarded_score": 5, "feedback": "محاولة."})
    ).status_code in (401, 403)
    assert (await client.get(f"/api/v1/courses/{cid}/gradebook")).status_code in (401, 403)


async def test_gradebook_json_every_attempt_with_breakdown(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "g8t@x.com")
    _, sh1 = await _student(client, "g8s1@x.com")
    _, sh2 = await _student(client, "g8s2@x.com")
    await _enroll_approved(client, th, cid, sh1, name="A")
    await _enroll_approved(client, th, cid, sh2, name="B")
    exam = await _make_exam(client, th, cid, show_result="immediate")
    mcq = await _add_mcq(client, th, exam["id"], correct=2, max_score=4)
    essay = await _add_essay(client, th, exam["id"], max_score=10)

    aid1, _ = await _submit(
        client,
        sh1,
        exam["id"],
        [
            {"question_id": mcq["id"], "selected_index": 2},
            {"question_id": essay["id"], "text_answer": "شرح أول"},
        ],
    )
    aid2, _ = await _submit(
        client,
        sh2,
        exam["id"],
        [
            {"question_id": mcq["id"], "selected_index": 0},
            {"question_id": essay["id"], "text_answer": "شرح ثان"},
        ],
    )
    # in_progress attempt must NOT appear in the gradebook
    lingering = await client.post(f"/api/v1/exams/{exam['id']}/attempts", headers=sh1)
    assert lingering.status_code == 201, lingering.text

    await client.patch(
        f"/api/v1/attempts/{aid1}/answers/{essay['id']}",
        json={"awarded_score": 7, "feedback": "جيد."},
        headers=th,
    )

    gb = await client.get(f"/api/v1/courses/{cid}/gradebook", headers=th)
    assert gb.status_code == 200, gb.text
    rows = gb.json()
    assert isinstance(rows, list)
    by_id = {r["attempt_id"]: r for r in rows}
    assert set(by_id) == {aid1, aid2}
    assert lingering.json()["id"] not in by_id

    r1 = by_id[aid1]
    assert r1["exam_id"] == exam["id"]
    assert r1["score"] == 11
    assert r1["max_score"] == 14
    assert "student_email" in r1 and "g8s1" in r1["student_email"]
    per_q = {a["question_id"]: a for a in r1["answers"]}
    assert per_q[mcq["id"]]["awarded_score"] == 4
    assert per_q[essay["id"]]["awarded_score"] == 7
    assert per_q[essay["id"]]["feedback"] == "جيد."
    assert per_q[essay["id"]]["needs_grading"] is False

    r2 = by_id[aid2]
    assert r2["score"] == 0  # essay still pending
    per_q2 = {a["question_id"]: a for a in r2["answers"]}
    assert per_q2[essay["id"]]["needs_grading"] is True


async def test_gradebook_csv_shape(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "g9t@x.com")
    _, sh = await _student(client, "g9s@x.com")
    await _enroll_approved(client, th, cid, sh)
    exam = await _make_exam(client, th, cid, show_result="immediate")
    mcq = await _add_mcq(client, th, exam["id"], correct=2, max_score=4)
    essay = await _add_essay(client, th, exam["id"], max_score=10)

    aid, _ = await _submit(
        client,
        sh,
        exam["id"],
        [
            {"question_id": mcq["id"], "selected_index": 2},
            {"question_id": essay["id"], "text_answer": "شرح"},
        ],
    )
    await client.patch(
        f"/api/v1/attempts/{aid}/answers/{essay['id']}",
        json={"awarded_score": 5, "feedback": "ملاحظة."},
        headers=th,
    )

    r = await client.get(f"/api/v1/courses/{cid}/gradebook/export", headers=th)
    assert r.status_code == 200, r.text
    assert "text/csv" in r.headers.get("content-type", "")
    text = r.text
    lines = [ln for ln in text.strip().splitlines() if ln]
    assert len(lines) == 3  # header + 2 answer rows
    header = lines[0]
    for col in (
        "student_email",
        "exam_title",
        "attempt_id",
        "score",
        "max_score",
        "question_id",
        "awarded_score",
        "feedback",
    ):
        assert col in header, header
    # totals repeat on each row; breakdown differs per question
    assert "g9s@x.com" in text
    assert aid in text


async def test_gradebook_csv_keeps_attempt_without_answers(client: AsyncClient):
    """Regression: an attempt on a question-less exam has no answer rows;
    its totals must still appear once in the CSV export."""
    _, th, cid = await _teacher_with_course(client, "g11t@x.com")
    _, sh = await _student(client, "g11s@x.com")
    await _enroll_approved(client, th, cid, sh)
    exam = await _make_exam(client, th, cid, show_result="immediate")

    aid, _ = await _submit(client, sh, exam["id"], [])

    gb = await client.get(f"/api/v1/courses/{cid}/gradebook", headers=th)
    assert gb.status_code == 200, gb.text
    assert [r["attempt_id"] for r in gb.json()] == [aid]

    r = await client.get(f"/api/v1/courses/{cid}/gradebook/export", headers=th)
    assert r.status_code == 200, r.text
    lines = [ln for ln in r.text.strip().splitlines() if ln]
    assert len(lines) == 2  # header + 1 totals-only row
    assert aid in lines[1]


async def test_mode_flip_hides_then_publish_reveals(client: AsyncClient):
    _, th, cid = await _teacher_with_course(client, "g10t@x.com")
    _, sh = await _student(client, "g10s@x.com")
    await _enroll_approved(client, th, cid, sh)
    exam = await _make_exam(client, th, cid, show_result="immediate")
    mcq = await _add_mcq(client, th, exam["id"], correct=2, max_score=4)

    aid, _ = await _submit(
        client, sh, exam["id"], [{"question_id": mcq["id"], "selected_index": 2}]
    )
    assert (await client.get(f"/api/v1/attempts/{aid}", headers=sh)).json()["score"] == 4

    flip = await client.put(
        f"/api/v1/exams/{exam['id']}", json={"show_result": "after_publish"}, headers=th
    )
    assert flip.status_code == 200, flip.text
    assert (await client.get(f"/api/v1/attempts/{aid}", headers=sh)).json()["score"] is None

    pub = await client.post(f"/api/v1/attempts/{aid}/publish", headers=th)
    assert pub.status_code == 200, pub.text
    assert (await client.get(f"/api/v1/attempts/{aid}", headers=sh)).json()["score"] == 4


async def test_writer_can_read_attempt_with_essay_text(client: AsyncClient):
    """Ticket 16: course writers can open an attempt to read essay text for
    grading (previously 403). Students keep owner-only visibility, and the
    writer view never leaks correct answers."""
    _, th, cid = await _teacher_with_course(client, "grt@x.com")
    _, sh = await _student(client, "grs@x.com")
    await create_user_in_db("gro@x.com", "password123", role=Role.teacher)
    ot = await _tokens(client, "gro@x.com")
    oh = {"Authorization": f"Bearer {ot['access_token']}"}
    await _enroll_approved(client, th, cid, sh)
    exam = await _make_exam(client, th, cid, show_result="after_publish")
    mcq = await _add_mcq(client, th, exam["id"], correct=2, max_score=4)
    essay = await _add_essay(client, th, exam["id"], max_score=10)
    aid, _ = await _submit(
        client,
        sh,
        exam["id"],
        [
            {"question_id": mcq["id"], "selected_index": 2},
            {"question_id": essay["id"], "text_answer": "شرح مفصل"},
        ],
    )

    view = await client.get(f"/api/v1/attempts/{aid}", headers=th)
    assert view.status_code == 200, view.text
    body = view.json()
    texts = {a["question_id"]: a.get("text_answer") for a in body["answers"]}
    assert texts[essay["id"]] == "شرح مفصل"
    assert any(a.get("needs_grading") for a in body["answers"])
    # No correct-answer leak even in the writer view.
    assert "correct_index" not in view.text
    assert "correct_answer" not in view.text

    # Non-writer teacher and other students stay gated out.
    assert (await client.get(f"/api/v1/attempts/{aid}", headers=oh)).status_code == 403
    await create_user_in_db("grs2@x.com", "password123", role=Role.student)
    s2 = await _tokens(client, "grs2@x.com")
    s2h = {"Authorization": f"Bearer {s2['access_token']}"}
    assert (await client.get(f"/api/v1/attempts/{aid}", headers=s2h)).status_code == 403


async def test_writer_grades_after_read_and_student_sees_per_setting(client: AsyncClient):
    """Ticket 16 review: the writer read path completes the loop — grade with
    score + feedback, and the student sees it only per the publish setting."""
    _, th, cid = await _teacher_with_course(client, "gw2t@x.com")
    _, sh = await _student(client, "gw2s@x.com")
    await _enroll_approved(client, th, cid, sh)
    exam = await _make_exam(client, th, cid, show_result="after_publish")
    essay = await _add_essay(client, th, exam["id"], max_score=10)
    aid, _ = await _submit(
        client, sh, exam["id"], [{"question_id": essay["id"], "text_answer": "شرح"}]
    )

    view = await client.get(f"/api/v1/attempts/{aid}", headers=th)
    assert view.status_code == 200, view.text
    assert any(a.get("text_answer") == "شرح" for a in view.json()["answers"])

    g = await client.patch(
        f"/api/v1/attempts/{aid}/answers/{essay['id']}",
        json={"awarded_score": 8, "feedback": "جيد."},
        headers=th,
    )
    assert g.status_code == 200, g.text

    hidden = await client.get(f"/api/v1/attempts/{aid}", headers=sh)
    assert hidden.status_code == 200, hidden.text
    assert hidden.json()["score"] is None

    p = await client.post(f"/api/v1/attempts/{aid}/publish", headers=th)
    assert p.status_code == 200, p.text
    shown = await client.get(f"/api/v1/attempts/{aid}", headers=sh)
    assert shown.json()["score"] == 8
