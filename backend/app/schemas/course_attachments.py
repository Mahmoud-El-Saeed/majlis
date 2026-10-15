from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CourseAttachmentCreateIn(BaseModel):
    """Teacher names the PDF (title) + optional description at creation.

    The file bytes follow via upload-url → browser PUT → confirm.
    """

    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)


class CourseAttachmentUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)


class CourseAttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    course_id: str
    title: str
    description: str | None = None
    file_key: str | None = None
    content_type: str
    size_bytes: int | None = None
    has_file: bool
    is_main_book: bool = False
    created_at: datetime


def to_course_attachment_out(row) -> CourseAttachmentOut:  # type: ignore[no-untyped-def]
    return CourseAttachmentOut(
        id=str(row.id),
        course_id=str(row.course_id),
        title=row.title,
        description=row.description,
        file_key=row.file_key,
        content_type=row.content_type,
        size_bytes=row.size_bytes,
        has_file=row.file_key is not None,
        is_main_book=bool(row.is_main_book),
        created_at=row.created_at,
    )


def to_student_course_attachment_out(row) -> CourseAttachmentOut:  # type: ignore[no-untyped-def]
    """Student view: internal R2 file_key hidden — files go via /file only,
    mirroring the audio_key rule on lessons."""
    out = to_course_attachment_out(row)
    out.file_key = None
    return out
