from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.storage_client import StorageClient
from app.models.course import Course
from app.models.lesson import Lesson
from app.models.lesson_attachment import LessonAttachment
from app.models.user import User
from app.repositories.attachment_repository import attachment_repository
from app.repositories.course_repository import course_repository
from app.repositories.lesson_repository import lesson_repository
from app.schemas.attachments import (
    AttachmentCreateIn,
    AttachmentUpdateIn,
    FileDisposition,
)
from app.services.course_service import CourseNotFound, can_view, can_write


class AttachmentError(Exception):
    def __init__(self, message: str):
        self.message = message


class AttachmentNotFound(AttachmentError):
    pass


class AttachmentForbidden(AttachmentError):
    pass


class AttachmentConflict(AttachmentError):
    pass


def _check_pdf(content_type: str | None, file_ext: str | None) -> tuple[str, str]:
    """PDF-only gate for handouts. Returns (content_type, ext)."""
    pdf_content_type = (content_type or "").strip().lower()
    ext = (file_ext or ".pdf").strip().lower()
    if not ext.startswith("."):
        ext = f".{ext}"
    if pdf_content_type != "application/pdf" or ext != ".pdf":
        raise AttachmentError("Only PDF attachments are supported.")
    return pdf_content_type, ext


def build_attachment_key(course_id: str, lesson_id: str, attachment_id: str) -> str:
    return f"courses/{course_id}/lessons/{lesson_id}/attachments/{attachment_id}.pdf"


async def _load_lesson(
    db: AsyncSession,
    actor: User,
    lesson_id: str,
    *,
    need_write: bool,
    expected_course_id: str | None = None,
) -> tuple[Lesson, Course]:
    lesson = await lesson_repository.get_by_id(db, lesson_id)
    if lesson is None:
        raise AttachmentNotFound("Lesson not found.")
    if expected_course_id is not None and str(lesson.course_id) != expected_course_id:
        raise AttachmentNotFound("Lesson not found.")
    course = await course_repository.get_by_id(db, str(lesson.course_id))
    if course is None:
        raise CourseNotFound("Course not found.")
    allowed = can_write(actor, course) if need_write else await can_view(db, actor, course)
    if not allowed:
        raise AttachmentForbidden("Not authorized.")
    return lesson, course


async def _load_attachment(
    db: AsyncSession, actor: User, attachment_id: str, *, need_write: bool
) -> tuple[LessonAttachment, Lesson, Course]:
    row = await attachment_repository.get_by_id(db, attachment_id)
    if row is None:
        raise AttachmentNotFound("Attachment not found.")
    lesson = await lesson_repository.get_by_id(db, str(row.lesson_id))
    if lesson is None:
        raise AttachmentNotFound("Lesson not found.")
    course = await course_repository.get_by_id(db, str(lesson.course_id))
    if course is None:
        raise CourseNotFound("Course not found.")
    allowed = can_write(actor, course) if need_write else await can_view(db, actor, course)
    if not allowed:
        raise AttachmentForbidden("Not authorized.")
    return row, lesson, course


async def create_attachment_in_course(
    db: AsyncSession, actor: User, course_id: str, lesson_id: str, data: AttachmentCreateIn
) -> LessonAttachment:
    """Course-scoped create: the URL course must own the lesson (else 404)."""
    lesson, _course = await _load_lesson(
        db, actor, lesson_id, need_write=True, expected_course_id=course_id
    )
    row = LessonAttachment(
        lesson_id=lesson.id,
        title=data.title.strip(),
        description=data.description,
        content_type="application/pdf",
        created_by=actor.id,
    )
    return await attachment_repository.save(db, row)


async def list_attachments(
    db: AsyncSession, actor: User, lesson_id: str, course_id: str | None = None
) -> tuple[list[LessonAttachment], bool]:
    """Attachments + writer flag. Non-writers see only ready files (with
    keys stripped at the schema layer) — unready drafts stay teacher-only."""
    lesson, course = await _load_lesson(
        db, actor, lesson_id, need_write=False, expected_course_id=course_id
    )
    writer = can_write(actor, course)
    rows = await attachment_repository.list_for_lesson(db, lesson.id)
    if not writer:
        rows = [r for r in rows if r.file_key is not None]
    return rows, writer


async def update_attachment(
    db: AsyncSession, actor: User, attachment_id: str, data: AttachmentUpdateIn
) -> LessonAttachment:
    row, _lesson, _course = await _load_attachment(db, actor, attachment_id, need_write=True)
    if data.title is not None:
        row.title = data.title.strip()
    if data.description is not None:
        row.description = data.description
    await db.flush()
    await db.refresh(row)
    return row


async def delete_attachment(db: AsyncSession, actor: User, attachment_id: str) -> None:
    row, _lesson, _course = await _load_attachment(db, actor, attachment_id, need_write=True)
    await attachment_repository.delete(db, row)


async def request_upload_url(
    db: AsyncSession,
    actor: User,
    attachment_id: str,
    content_type: str | None,
    file_ext: str | None,
    storage: StorageClient,
) -> dict:
    pdf_content_type, _ext = _check_pdf(content_type, file_ext)
    row, lesson, course = await _load_attachment(db, actor, attachment_id, need_write=True)
    key = build_attachment_key(str(course.id), str(lesson.id), str(row.id))
    settings = get_settings()
    return await storage.presign_put(key, pdf_content_type, settings.S3_UPLOAD_EXPIRE_SEC)


async def confirm_upload(
    db: AsyncSession,
    actor: User,
    attachment_id: str,
    object_key: str,
    storage: StorageClient,
) -> LessonAttachment:
    row, lesson, course = await _load_attachment(db, actor, attachment_id, need_write=True)
    expected_prefix = f"courses/{course.id}/lessons/{lesson.id}/attachments/{row.id}"
    if not object_key.startswith(expected_prefix):
        raise AttachmentConflict("Upload not found. Retry with a fresh upload URL.")
    if not object_key.lower().endswith(".pdf"):
        raise AttachmentError("Only PDF attachments are supported.")
    if not await storage.object_exists(object_key):
        raise AttachmentConflict("Upload not found. Retry with a fresh upload URL.")
    row.file_key = object_key
    row.content_type = "application/pdf"
    await db.flush()
    await db.refresh(row)
    return row


async def get_file_url(
    db: AsyncSession,
    actor: User,
    attachment_id: str,
    storage: StorageClient,
    disposition: FileDisposition = "inline",
) -> dict:
    row, _lesson, _course = await _load_attachment(db, actor, attachment_id, need_write=False)
    if not row.file_key:
        raise AttachmentConflict("Attachment file is not ready yet.")
    settings = get_settings()
    filename = f"{row.title}.pdf"
    out = await storage.presign_get(
        row.file_key, settings.S3_PLAY_EXPIRE_SEC, filename, disposition
    )
    return {"file_url": out["playback_url"], "expires_in": out["expires_in"]}
