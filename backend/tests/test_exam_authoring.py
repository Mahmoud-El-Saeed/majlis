"""Ticket 07 red phase: Exam authoring — teacher-side construction only.

Contract under test (Seam 4, no students/enrollment needed):
- Exam CRUD linked to course with optional lesson_id (null = general/book-wide).
- Question bank: MCQ (4 options, 1 correct), TF, essay with max_score.
- Config knobs persist + validate: attempts, duration, open/close, pass score,
  show-result immediate vs after_publish.
- Writes: admin (any) or owner-teacher only; other teacher/student 403, anon 401.
- Preview (detail with questions) works for writer without any enrollment.
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


async def _lesson(client, token, course_id, title="Lesson"):
    r = await client.post(
        f"/api/v1/courses/{course_id}/lessons",
        json={"title": title},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201, r.text
    return r.json()


def _exam_payload(**over):
    base = {
        "title": "Exam 1",
        "description": "covers chapter",
        "attempts_limit": 2,
        "duration_minutes": 30,
        "pass_score": 60,
        "show_result": "immediate",
    }
    base.update(over)
    return base


async def test_teacher_can_create_general_exam_with_knobs(client):
    from app.models.user import Role

    await create_user_in_db("ex1@x.com", "password123", role=Role.teacher)
    t = await _tokens(client, "ex1@x.com", "password123")
    course = await _course(client, t["access_token"])
    h = {"Authorization": f"Bearer {t['access_token']}"}

    r = await client.post(f"/api/v1/courses/{course['id']}/exams", json=_exam_payload(), headers=h)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["course_id"] == course["id"]
    assert body["lesson_id"] is None
    assert body["attempts_limit"] == 2
    assert body["duration_minutes"] == 30
    assert body["pass_score"] == 60
    assert body["show_result"] == "immediate"


async def test_exam_with_same_course_lesson_ok_cross_course_rejected(client):
    from app.models.user import Role

    await create_user_in_db("ex2@x.com", "password123", role=Role.teacher)
    t = await _tokens(client, "ex2@x.com", "password123")
    c1 = await _course(client, t["access_token"], title="B1")
    c2 = await _course(client, t["access_token"], title="B2")
    les1 = await _lesson(client, t["access_token"], c1["id"])
    les2 = await _lesson(client, t["access_token"], c2["id"])
    h = {"Authorization": f"Bearer {t['access_token']}"}

    ok = await client.post(
        f"/api/v1/courses/{c1['id']}/exams",
        json=_exam_payload(lesson_id=les1["id"]),
        headers=h,
    )
    assert ok.status_code == 201, ok.text
    assert ok.json()["lesson_id"] == les1["id"]

    bad = await client.post(
        f"/api/v1/courses/{c1['id']}/exams",
        json=_exam_payload(lesson_id=les2["id"]),
        headers=h,
    )
    assert bad.status_code == 400, bad.text


async def test_other_teacher_student_cannot_author_exam(client):
    from app.models.user import Role

    await create_user_in_db("exo@x.com", "password123", role=Role.teacher)
    await create_user_in_db("exx@x.com", "password123", role=Role.teacher)
    await create_user_in_db("exs@x.com", "password123", role=Role.student)
    own = await _tokens(client, "exo@x.com", "password123")
    oth = await _tokens(client, "exx@x.com", "password123")
    stu = await _tokens(client, "exs@x.com", "password123")
    course = await _course(client, own["access_token"])
    exam = (
        await client.post(
            f"/api/v1/courses/{course['id']}/exams",
            json=_exam_payload(),
            headers={"Authorization": f"Bearer {own['access_token']}"},
        )
    ).json()

    for tok in (oth["access_token"], stu["access_token"]):
        h = {"Authorization": f"Bearer {tok}"}
        assert (
            await client.post(
                f"/api/v1/courses/{course['id']}/exams", json=_exam_payload(), headers=h
            )
        ).status_code == 403
        assert (
            await client.get(f"/api/v1/courses/{course['id']}/exams", headers=h)
        ).status_code == 403
        assert (await client.get(f"/api/v1/exams/{exam['id']}", headers=h)).status_code == 403


async def test_anon_cannot_author_or_preview(client):
    from app.models.user import Role

    await create_user_in_db("exa@x.com", "password123", role=Role.teacher)
    t = await _tokens(client, "exa@x.com", "password123")
    course = await _course(client, t["access_token"])
    h = {"Authorization": f"Bearer {t['access_token']}"}
    exam = (
        await client.post(f"/api/v1/courses/{course['id']}/exams", json=_exam_payload(), headers=h)
    ).json()
    assert (
        await client.post(f"/api/v1/courses/{course['id']}/exams", json=_exam_payload())
    ).status_code in (401, 403)
    assert (await client.get(f"/api/v1/exams/{exam['id']}")).status_code in (401, 403)


async def test_exam_config_knobs_validated(client):
    from app.models.user import Role

    await create_user_in_db("exv@x.com", "password123", role=Role.teacher)
    t = await _tokens(client, "exv@x.com", "password123")
    course = await _course(client, t["access_token"])
    h = {"Authorization": f"Bearer {t['access_token']}"}
    url = f"/api/v1/courses/{course['id']}/exams"

    assert (
        await client.post(url, json=_exam_payload(attempts_limit=0), headers=h)
    ).status_code in (400, 422)
    assert (
        await client.post(url, json=_exam_payload(duration_minutes=-5), headers=h)
    ).status_code in (400, 422)
    assert (await client.post(url, json=_exam_payload(pass_score=101), headers=h)).status_code in (
        400,
        422,
    )
    assert (
        await client.post(
            url,
            json=_exam_payload(open_at="2026-05-02T10:00:00Z", close_at="2026-05-01T10:00:00Z"),
            headers=h,
        )
    ).status_code in (400, 422)
    assert (
        await client.post(url, json=_exam_payload(show_result="someday"), headers=h)
    ).status_code in (400, 422)


async def test_mcq_requires_4_options_1_correct(client):
    from app.models.user import Role

    await create_user_in_db("exm@x.com", "password123", role=Role.teacher)
    t = await _tokens(client, "exm@x.com", "password123")
    course = await _course(client, t["access_token"])
    h = {"Authorization": f"Bearer {t['access_token']}"}
    exam = (
        await client.post(f"/api/v1/courses/{course['id']}/exams", json=_exam_payload(), headers=h)
    ).json()
    qurl = f"/api/v1/exams/{exam['id']}/questions"

    good = await client.post(
        qurl,
        json={
            "type": "mcq",
            "prompt": "What is 2+2?",
            "options": ["1", "2", "4", "5"],
            "correct_index": 2,
        },
        headers=h,
    )
    assert good.status_code == 201, good.text
    assert good.json()["correct_index"] == 2

    bad_options = await client.post(
        qurl,
        json={"type": "mcq", "prompt": "Bad", "options": ["a", "b"], "correct_index": 0},
        headers=h,
    )
    assert bad_options.status_code in (400, 422), bad_options.text

    bad_correct = await client.post(
        qurl,
        json={
            "type": "mcq",
            "prompt": "Bad",
            "options": ["a", "b", "c", "d"],
            "correct_index": 7,
        },
        headers=h,
    )
    assert bad_correct.status_code in (400, 422), bad_correct.text

    missing_correct = await client.post(
        qurl,
        json={"type": "mcq", "prompt": "Bad", "options": ["a", "b", "c", "d"]},
        headers=h,
    )
    assert missing_correct.status_code in (400, 422), missing_correct.text


async def test_tf_and_essay_shapes(client):
    from app.models.user import Role

    await create_user_in_db("ext@x.com", "password123", role=Role.teacher)
    t = await _tokens(client, "ext@x.com", "password123")
    course = await _course(client, t["access_token"])
    h = {"Authorization": f"Bearer {t['access_token']}"}
    exam = (
        await client.post(f"/api/v1/courses/{course['id']}/exams", json=_exam_payload(), headers=h)
    ).json()
    qurl = f"/api/v1/exams/{exam['id']}/questions"

    tf = await client.post(
        qurl,
        json={"type": "tf", "prompt": "The sky is blue.", "correct_answer": True},
        headers=h,
    )
    assert tf.status_code == 201, tf.text
    assert tf.json()["correct_answer"] is True

    tf_bad = await client.post(qurl, json={"type": "tf", "prompt": "Missing answer"}, headers=h)
    assert tf_bad.status_code in (400, 422), tf_bad.text

    essay = await client.post(
        qurl,
        json={"type": "essay", "prompt": "Explain...", "max_score": 10},
        headers=h,
    )
    assert essay.status_code == 201, essay.text
    assert essay.json()["max_score"] == 10

    essay_bad = await client.post(qurl, json={"type": "essay", "prompt": "No score"}, headers=h)
    assert essay_bad.status_code in (400, 422), essay_bad.text


async def test_preview_lists_questions_without_enrollment(client):
    from app.models.user import Role

    await create_user_in_db("exp@x.com", "password123", role=Role.teacher)
    t = await _tokens(client, "exp@x.com", "password123")
    course = await _course(client, t["access_token"])
    h = {"Authorization": f"Bearer {t['access_token']}"}
    exam = (
        await client.post(f"/api/v1/courses/{course['id']}/exams", json=_exam_payload(), headers=h)
    ).json()
    qurl = f"/api/v1/exams/{exam['id']}/questions"
    for payload in (
        {
            "type": "mcq",
            "prompt": "Q1",
            "options": ["a", "b", "c", "d"],
            "correct_index": 0,
        },
        {"type": "tf", "prompt": "Q2", "correct_answer": False},
    ):
        r = await client.post(qurl, json=payload, headers=h)
        assert r.status_code == 201, r.text

    preview = await client.get(f"/api/v1/exams/{exam['id']}", headers=h)
    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert body["id"] == exam["id"]
    assert len(body["questions"]) == 2

    listed = await client.get(f"/api/v1/courses/{course['id']}/exams", headers=h)
    assert listed.status_code == 200, listed.text
    assert any(e["id"] == exam["id"] for e in listed.json())


async def test_exam_update_delete_ownership_and_404s(client):
    from app.models.user import Role

    await create_user_in_db("exu1@x.com", "password123", role=Role.teacher)
    await create_user_in_db("exu2@x.com", "password123", role=Role.teacher)
    t1 = await _tokens(client, "exu1@x.com", "password123")
    t2 = await _tokens(client, "exu2@x.com", "password123")
    course = await _course(client, t1["access_token"])
    h1 = {"Authorization": f"Bearer {t1['access_token']}"}
    h2 = {"Authorization": f"Bearer {t2['access_token']}"}
    exam = (
        await client.post(f"/api/v1/courses/{course['id']}/exams", json=_exam_payload(), headers=h1)
    ).json()
    eid = exam["id"]

    assert (
        await client.put(f"/api/v1/exams/{eid}", json={"title": "Hijack"}, headers=h2)
    ).status_code == 403
    assert (await client.delete(f"/api/v1/exams/{eid}", headers=h2)).status_code == 403

    upd = await client.put(
        f"/api/v1/exams/{eid}",
        json={"title": "Edited", "show_result": "after_publish"},
        headers=h1,
    )
    assert upd.status_code == 200, upd.text
    assert upd.json()["title"] == "Edited"
    assert upd.json()["show_result"] == "after_publish"

    q = await client.post(
        f"/api/v1/exams/{eid}/questions",
        json={"type": "tf", "prompt": "Q?", "correct_answer": True},
        headers=h1,
    )
    qid = q.json()["id"]
    assert (
        await client.put(f"/api/v1/questions/{qid}", json={"prompt": "Q edited"}, headers=h2)
    ).status_code == 403
    q_upd = await client.put(f"/api/v1/questions/{qid}", json={"prompt": "Q edited"}, headers=h1)
    assert q_upd.status_code == 200, q_upd.text
    assert q_upd.json()["prompt"] == "Q edited"
    assert (await client.delete(f"/api/v1/questions/{qid}", headers=h1)).status_code == 204

    assert (await client.delete(f"/api/v1/exams/{eid}", headers=h1)).status_code == 204
    assert (await client.get(f"/api/v1/exams/{eid}", headers=h1)).status_code == 404
    assert (
        await client.get("/api/v1/exams/00000000-0000-0000-0000-000000000000", headers=h1)
    ).status_code == 404


async def test_exam_optional_knobs_can_be_cleared(client):
    from app.models.user import Role

    await create_user_in_db("exc@x.com", "password123", role=Role.teacher)
    t = await _tokens(client, "exc@x.com", "password123")
    course = await _course(client, t["access_token"])
    h = {"Authorization": f"Bearer {t['access_token']}"}
    exam = (
        await client.post(
            f"/api/v1/courses/{course['id']}/exams",
            json=_exam_payload(
                description="to clear",
                duration_minutes=45,
                open_at="2026-05-01T10:00:00Z",
                close_at="2026-05-02T10:00:00Z",
            ),
            headers=h,
        )
    ).json()
    eid = exam["id"]

    cleared = await client.put(
        f"/api/v1/exams/{eid}",
        json={
            "clear_description": True,
            "clear_duration_minutes": True,
            "clear_open_at": True,
            "clear_close_at": True,
            "clear_lesson": True,
        },
        headers=h,
    )
    assert cleared.status_code == 200, cleared.text
    body = cleared.json()
    assert body["description"] is None
    assert body["duration_minutes"] is None
    assert body["open_at"] is None
    assert body["close_at"] is None
    assert body["lesson_id"] is None
