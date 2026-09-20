from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class JoinIn(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    display_name: str = Field(min_length=1, max_length=200)
    phone: str | None = Field(default=None, max_length=50)
    note: str | None = Field(default=None, max_length=2000)


class EnrollmentOut(BaseModel):
    id: str
    course_id: str
    course_title: str | None = None
    user_id: str
    code_id: str | None = None
    status: str
    display_name: str
    phone: str | None = None
    note: str | None = None
    decided_by: str | None = None
    decided_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class EnrollmentListOut(BaseModel):
    enrollments: list[EnrollmentOut]


def to_enrollment_out(row, course_title: str | None = None) -> EnrollmentOut:  # type: ignore[no-untyped-def]
    st = row.status
    st = st.value if isinstance(st, Enum) else str(st)
    return EnrollmentOut(
        id=str(row.id),
        course_id=str(row.course_id),
        course_title=course_title,
        user_id=str(row.user_id),
        code_id=str(row.code_id) if row.code_id else None,
        status=st,
        display_name=row.display_name,
        phone=row.phone,
        note=row.note,
        decided_by=str(row.decided_by) if row.decided_by else None,
        decided_at=row.decided_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )
