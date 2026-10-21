"""Direct-DB helpers for tests (admin/invite setup that has no public API by design)."""

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import Any

from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models.user import Role
from tests.conftest import TEST_DATABASE_URL


@asynccontextmanager
async def open_db_session() -> AsyncIterator[AsyncSession]:
    """Throwaway session on the Postgres test DB (tables reset per client fixture)."""
    engine = create_async_engine(TEST_DATABASE_URL, future=True)
    try:
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            yield session
    finally:
        await engine.dispose()


async def create_user_in_db(
    email: str,
    password: str,
    role: Role = Role.student,
    verified: bool = True,
) -> str:
    """Insert a user straight into the test DB. Returns the user id."""
    from app.core.security import get_password_hash
    from app.models.user import User

    async with open_db_session() as session:
        user = User(
            email=email.lower(),
            hashed_password=get_password_hash(password),
            role=role,
            is_verified=verified,
        )
        session.add(user)
        await session.commit()
        return str(user.id)


async def expire_invite_in_db(email: str) -> None:
    """Force the active invite for an email to be expired."""
    from app.models.teacher_invite import TeacherInvite

    async with open_db_session() as session:
        await session.execute(
            update(TeacherInvite)
            .where(TeacherInvite.email == email.lower())
            .values(expires_at=datetime.now(UTC).replace(year=2000))
        )
        await session.commit()


async def active_invite_token_hash(email: str) -> str | None:
    from app.models.teacher_invite import TeacherInvite

    async with open_db_session() as session:
        result = await session.execute(
            select(TeacherInvite.token_hash).where(
                TeacherInvite.email == email.lower(),
                TeacherInvite.used_at.is_(None),
            )
        )
        return result.scalars().first()


async def login(client: AsyncClient, email: str, password: str) -> dict[str, Any]:
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


def get_outbox(client: AsyncClient) -> list[dict[str, str]]:
    """Fake-SMTP outbox captured at the seam boundary (see conftest)."""
    transport: Any = client._transport  # httpx ASGI transport holds the app
    return transport.app.state.test_outbox


# --- Exam builders shared by the assessment test modules --------------------
# Kept here so the per-module copies cannot drift (tickets 08/14/20).


async def teacher_with_course(
    client: AsyncClient, email: str, title: str = "Book"
) -> tuple[dict[str, Any], dict[str, str], str]:
    """Create a teacher + their course. Returns (tokens, headers, course_id)."""
    await create_user_in_db(email, "password123", role=Role.teacher)
    tokens = await login(client, email, "password123")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    r = await client.post("/api/v1/courses", json={"title": title}, headers=headers)
    assert r.status_code == 201, r.text
    return tokens, headers, r.json()["id"]


async def enroll_approved(
    client: AsyncClient,
    teacher_h: dict[str, str],
    course_id: str,
    student_h: dict[str, str],
    name: str = "S",
) -> str:
    """Join via a fresh code and approve. Returns the enrollment id."""
    code_r = await client.post(f"/api/v1/courses/{course_id}/codes", json={}, headers=teacher_h)
    assert code_r.status_code == 201, code_r.text
    j = await client.post(
        "/api/v1/enrollments/join",
        json={"code": code_r.json()["code"], "display_name": name},
        headers=student_h,
    )
    assert j.status_code == 201, j.text
    eid = j.json()["id"]
    a = await client.post(f"/api/v1/enrollments/{eid}/approve", headers=teacher_h)
    assert a.status_code == 200, a.text
    assert a.json()["status"] == "approved"
    return str(eid)


def exam_payload(**over: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "title": "Exam",
        "attempts_limit": 2,
        "duration_minutes": 30,
        "pass_score": 50,
        "show_result": "immediate",
    }
    base.update(over)
    return base


async def make_exam(
    client: AsyncClient, teacher_h: dict[str, str], course_id: str, **over: Any
) -> dict[str, Any]:
    r = await client.post(
        f"/api/v1/courses/{course_id}/exams", json=exam_payload(**over), headers=teacher_h
    )
    assert r.status_code == 201, r.text
    return r.json()


async def add_mcq(
    client: AsyncClient,
    teacher_h: dict[str, str],
    exam_id: str,
    *,
    options: list[str] | None = None,
    correct: int = 2,
    max_score: int = 4,
) -> dict[str, Any]:
    r = await client.post(
        f"/api/v1/exams/{exam_id}/questions",
        json={
            "type": "mcq",
            "prompt": "What is 2+2?",
            "options": options if options is not None else ["1", "2", "4", "5"],
            "correct_index": correct,
            "max_score": max_score,
        },
        headers=teacher_h,
    )
    assert r.status_code == 201, r.text
    return r.json()


async def add_tf(
    client: AsyncClient,
    teacher_h: dict[str, str],
    exam_id: str,
    *,
    correct: bool = True,
    max_score: int = 1,
) -> dict[str, Any]:
    r = await client.post(
        f"/api/v1/exams/{exam_id}/questions",
        json={"type": "tf", "prompt": "Sky is blue.", "correct_answer": correct},
        headers=teacher_h,
    )
    assert r.status_code == 201, r.text
    question = r.json()
    if max_score != 1:
        u = await client.put(
            f"/api/v1/questions/{question['id']}",
            json={"max_score": max_score},
            headers=teacher_h,
        )
        assert u.status_code == 200, u.text
        question = u.json()
    return question


async def add_essay(
    client: AsyncClient,
    teacher_h: dict[str, str],
    exam_id: str,
    *,
    max_score: int = 10,
) -> dict[str, Any]:
    r = await client.post(
        f"/api/v1/exams/{exam_id}/questions",
        json={"type": "essay", "prompt": "Explain.", "max_score": max_score},
        headers=teacher_h,
    )
    assert r.status_code == 201, r.text
    return r.json()


async def start_attempt(
    client: AsyncClient, headers: dict[str, str], exam_id: str
) -> str:
    r = await client.post(f"/api/v1/exams/{exam_id}/attempts", headers=headers)
    assert r.status_code == 201, r.text
    return str(r.json()["id"])


async def expire_attempt_in_db(attempt_id: str) -> None:
    """Move an attempt's timer into the past (the clock is the only way to
    reach the expiry branch without waiting)."""
    from app.models.attempt import Attempt

    async with open_db_session() as session:
        await session.execute(
            update(Attempt)
            .where(Attempt.id == uuid.UUID(attempt_id))
            .values(expires_at=datetime.now(UTC) - timedelta(minutes=1))
        )
        await session.commit()
