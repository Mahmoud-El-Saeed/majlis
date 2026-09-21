from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

FileDisposition = Literal["inline", "attachment"]


class AttachmentCreateIn(BaseModel):
    """Teacher names the PDF (title) + optional description at creation.

    The file bytes follow via upload-url → browser PUT → confirm.
    """

    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)


class AttachmentUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)


class AttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    lesson_id: str
    title: str
    description: str | None = None
    file_key: str | None = None
    content_type: str
    has_file: bool
    created_at: datetime


class AttachmentUploadUrlOut(BaseModel):
    upload_url: str
    object_key: str
    expires_in: int


class AttachmentFileOut(BaseModel):
    file_url: str
    expires_in: int


def to_attachment_out(row) -> AttachmentOut:  # type: ignore[no-untyped-def]
    return AttachmentOut(
        id=str(row.id),
        lesson_id=str(row.lesson_id),
        title=row.title,
        description=row.description,
        file_key=row.file_key,
        content_type=row.content_type,
        has_file=row.file_key is not None,
        created_at=row.created_at,
    )


def to_student_attachment_out(row) -> AttachmentOut:  # type: ignore[no-untyped-def]
    """Student view: internal R2 file_key hidden — files go via /file only,
    mirroring the audio_key rule on lessons."""
    out = to_attachment_out(row)
    out.file_key = None
    return out
