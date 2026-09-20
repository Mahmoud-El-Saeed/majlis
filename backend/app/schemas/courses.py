from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CourseCreateIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    book_title: str | None = Field(default=None, max_length=200)
    organization_id: UUID | None = None
    # Admin-only: create on behalf of a teacher. Ignored for teacher callers.
    owner_id: UUID | None = None


class CourseUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    book_title: str | None = Field(default=None, max_length=200)
    organization_id: UUID | None = None


class CourseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    description: str | None = None
    book_title: str | None = None
    organization_id: str | None = None
    created_by: str | None = None
    created_at: datetime


def to_course_out(course) -> CourseOut:  # type: ignore[no-untyped-def]
    return CourseOut(
        id=str(course.id),
        title=course.title,
        description=course.description,
        book_title=course.book_title,
        organization_id=str(course.organization_id) if course.organization_id else None,
        created_by=str(course.created_by) if course.created_by else None,
        created_at=course.created_at,
    )
