from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class LessonCreateIn(BaseModel):
    """Pages-range truth lives in lesson_service._check_pages (+ DB CHECK);
    schemas validate shape only."""

    title: str = Field(min_length=1, max_length=200)
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
    lesson_date: datetime | None = None
    pages_from: int | None = None
    pages_to: int | None = None
    audio_key: str | None = None
    media_type: str
    transcript_voice: str
    transcript_book: str
    status: str
    created_at: datetime


def to_lesson_out(lesson) -> LessonOut:  # type: ignore[no-untyped-def]
    media = lesson.media_type
    media = media.value if isinstance(media, Enum) else str(media)
    st = lesson.status
    st = st.value if isinstance(st, Enum) else str(st)
    return LessonOut(
        id=str(lesson.id),
        course_id=str(lesson.course_id),
        title=lesson.title,
        lesson_date=lesson.lesson_date,
        pages_from=lesson.pages_from,
        pages_to=lesson.pages_to,
        audio_key=lesson.audio_key,
        media_type=media,
        transcript_voice=lesson.transcript_voice or "",
        transcript_book=lesson.transcript_book or "",
        status=st,
        created_at=lesson.created_at,
    )
