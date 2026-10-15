from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import enum_str


class LessonCreateIn(BaseModel):
    """Pages-range truth lives in lesson_service._check_pages (+ DB CHECK);
    schemas validate shape only."""

    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    lesson_date: datetime | None = None
    pages_from: int | None = Field(default=None, ge=1)
    pages_to: int | None = Field(default=None, ge=1)
    audio_key: str | None = None
    media_type: Literal["audio"] | None = None
    transcript_voice: str | None = None
    transcript_book: str | None = None


class LessonUpdateIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    lesson_date: datetime | None = None
    pages_from: int | None = Field(default=None, ge=1)
    pages_to: int | None = Field(default=None, ge=1)
    audio_key: str | None = None
    media_type: Literal["audio"] | None = None
    transcript_voice: str | None = None
    transcript_book: str | None = None


class LessonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    course_id: str
    title: str
    description: str | None = None
    lesson_date: datetime | None = None
    pages_from: int | None = None
    pages_to: int | None = None
    audio_key: str | None = None
    media_type: str
    transcript_voice: str
    transcript_book: str
    status: str
    # Server-computed: True for admin/owner-teacher (manage audio, PDFs,
    # transcripts). The frontend never infers capability from blanked fields.
    can_manage: bool = False
    created_at: datetime


class LessonSummaryOut(BaseModel):
    """Lightweight list item (ticket 06 best practice): no transcript TEXT,
    no internal S3 audio_key — students play via /play signed URLs only."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    course_id: str
    title: str
    description: str | None = None
    lesson_date: datetime | None = None
    pages_from: int | None = None
    pages_to: int | None = None
    media_type: str
    status: str
    attachment_count: int = 0
    created_at: datetime


def to_lesson_out(lesson, can_manage: bool = False) -> LessonOut:  # type: ignore[no-untyped-def]
    return LessonOut(
        id=str(lesson.id),
        course_id=str(lesson.course_id),
        title=lesson.title,
        description=lesson.description,
        lesson_date=lesson.lesson_date,
        pages_from=lesson.pages_from,
        pages_to=lesson.pages_to,
        audio_key=lesson.audio_key,
        media_type=enum_str(lesson.media_type),
        transcript_voice=lesson.transcript_voice or "",
        transcript_book=lesson.transcript_book or "",
        status=enum_str(lesson.status),
        can_manage=can_manage,
        created_at=lesson.created_at,
    )


def to_lesson_summary(lesson, attachment_count: int = 0) -> LessonSummaryOut:  # type: ignore[no-untyped-def]
    return LessonSummaryOut(
        id=str(lesson.id),
        course_id=str(lesson.course_id),
        title=lesson.title,
        description=lesson.description,
        lesson_date=lesson.lesson_date,
        pages_from=lesson.pages_from,
        pages_to=lesson.pages_to,
        media_type=enum_str(lesson.media_type),
        status=enum_str(lesson.status),
        attachment_count=attachment_count,
        created_at=lesson.created_at,
    )


def to_student_lesson_out(lesson) -> LessonOut:  # type: ignore[no-untyped-def]
    """Audio-only student view (ticket 06): transcripts blanked and the
    internal S3 audio_key hidden — playback goes through /play only."""
    full = to_lesson_out(lesson, can_manage=False)
    full.audio_key = None
    full.transcript_voice = ""
    full.transcript_book = ""
    return full
