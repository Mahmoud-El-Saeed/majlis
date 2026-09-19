"""Ticket 02: role hierarchy enforced by require_roles (admin passes every gate).

No teacher-only/student-only endpoints exist yet (tickets 03+), so the
hierarchy itself is proven here by invoking the gate directly.
"""

import pytest
from fastapi import HTTPException

from app.api.dependencies import require_roles
from app.models.user import Role, User


def make_user(role: Role) -> User:
    return User(email=f"{role.value}@example.com", hashed_password="x", role=role)


async def test_admin_passes_every_gate() -> None:
    admin = make_user(Role.admin)
    assert await require_roles(Role.admin)(admin) is admin
    assert await require_roles(Role.teacher)(admin) is admin
    assert await require_roles(Role.student)(admin) is admin


async def test_teacher_gate() -> None:
    gate = require_roles(Role.teacher)
    assert await gate(make_user(Role.teacher)) is not None
    with pytest.raises(HTTPException) as exc:
        await gate(make_user(Role.student))
    assert exc.value.status_code == 403
    assert exc.value.detail == "Not authorized."


async def test_admin_gate_rejects_teacher_with_admin_message() -> None:
    with pytest.raises(HTTPException) as exc:
        await require_roles(Role.admin)(make_user(Role.teacher))
    assert exc.value.status_code == 403
    assert exc.value.detail == "Admin access required."
