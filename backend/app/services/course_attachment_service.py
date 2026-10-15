from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.storage_client import StorageClient
from app.models.course import Course
from app.models.course_attachment import CourseAttachment
from app.models.user import User
from app.repositories.course_attachment_repository import course_attachment_repository
from app.repositories.course_repository import course_repository
from app.schemas.attachments import FileDisposition
from app.schemas.course_attachments import (
    CourseAttachmentCreateIn,
    CourseAttachmentUpdateIn,
)
from app.services.attachment_service import (
    AttachmentConflict,
    AttachmentForbidden,
    AttachmentNotFound,
)
from app.services.course_service import CourseNotFound, can_view, can_write, is_book_based
from app.services.file_gates import (
    COURSE_FILE_TYPES,
    AttachmentError,
    check_file,
    check_size,
)


def build_course_attachment_key(course_id: str, attachment_id: str) -> str:
    return f"courses/{course_id}/attachments/{attachment_id}.pdf"


async def _course_or_404(db: AsyncSession, course_id: str) -> Course:
    course = await course_repository.get_by_id(db, course_id)
    if course is None:
        raise CourseNotFound("Course not found.")
    return course


async def _load(
    db: AsyncSession, actor: User, attachment_id: str, *, need_write: bool
) -> tuple[CourseAttachment, Course]:
    row = await course_attachment_repository.get_by_id(db, attachment_id)
    if row is None:
        raise AttachmentNotFound("Attachment not found.")
    course = await course_repository.get_by_id(db, str(row.course_id))
    if course is None:
        raise CourseNotFound("Course not found.")
    allowed = can_write(actor, course) if need_write else await can_view(db, actor, course)
    if not allowed:
        raise AttachmentForbidden("Not authorized.")
    return row, course


async def create_attachment(
    db: AsyncSession, actor: User, course_id: str, data: CourseAttachmentCreateIn
) -> CourseAttachment:
    course = await _course_or_404(db, course_id)
    if not can_write(actor, course):
        raise AttachmentForbidden("Not authorized.")
    row = CourseAttachment(
        course_id=course.id,
        title=data.title.strip(),
        description=data.description,
        content_type="application/pdf",
        created_by=actor.id,
    )
    return await course_attachment_repository.save(db, row)


async def list_attachments(
    db: AsyncSession, actor: User, course_id: str
) -> tuple[list[CourseAttachment], bool]:
    """Attachments + writer flag. Non-writers see only ready files."""
    course = await _course_or_404(db, course_id)
    if not await can_view(db, actor, course):
        raise AttachmentForbidden("Not authorized.")
    writer = can_write(actor, course)
    rows = await course_attachment_repository.list_for_course(db, course.id)
    if not writer:
        rows = [r for r in rows if r.file_key is not None]
    return rows, writer


async def update_attachment(
    db: AsyncSession, actor: User, attachment_id: str, data: CourseAttachmentUpdateIn
) -> CourseAttachment:
    row, _course = await _load(db, actor, attachment_id, need_write=True)
    if data.title is not None:
        row.title = data.title.strip()
    if data.description is not None:
        row.description = data.description
    await db.flush()
    await db.refresh(row)
    return row


async def delete_attachment(db: AsyncSession, actor: User, attachment_id: str) -> None:
    row, _course = await _load(db, actor, attachment_id, need_write=True)
    await course_attachment_repository.delete(db, row)


async def designate_main_book(
    db: AsyncSession, actor: User, attachment_id: str
) -> CourseAttachment:
    """Mark one attachment the main book. Ticket 16: replaces any previous
    silently; rejected on general (bookless) courses."""
    row, course = await _load(db, actor, attachment_id, need_write=True)
    if not is_book_based(course):
        raise AttachmentError("Only book-based courses have a main book.")
    await course_attachment_repository.unset_main_books(db, course.id)
    row.is_main_book = True
    await db.flush()
    await db.refresh(row)
    return row


async def request_upload_url(
    db: AsyncSession,
    actor: User,
    attachment_id: str,
    content_type: str | None,
    file_ext: str | None,
    storage: StorageClient,
) -> dict:
    file_content_type, _ext = check_file(COURSE_FILE_TYPES, content_type, file_ext)
    row, course = await _load(db, actor, attachment_id, need_write=True)
    key = build_course_attachment_key(str(course.id), str(row.id))
    settings = get_settings()
    return await storage.presign_put(key, file_content_type, settings.S3_UPLOAD_EXPIRE_SEC)


async def confirm_upload(
    db: AsyncSession,
    actor: User,
    attachment_id: str,
    object_key: str,
    storage: StorageClient,
) -> CourseAttachment:
    row, course = await _load(db, actor, attachment_id, need_write=True)
    expected_prefix = f"courses/{course.id}/attachments/{row.id}"
    if not object_key.startswith(expected_prefix):
        raise AttachmentConflict("Upload not found. Retry with a fresh upload URL.")
    if not object_key.lower().endswith(".pdf"):
        raise AttachmentError("Only PDF attachments are supported.")
    if not await storage.object_exists(object_key):
        raise AttachmentConflict("Upload not found. Retry with a fresh upload URL.")
    size = await storage.object_size(object_key)
    check_size(size)
    row.file_key = object_key
    row.content_type = "application/pdf"
    row.size_bytes = size
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
    row, _course = await _load(db, actor, attachment_id, need_write=False)
    if not row.file_key:
        raise AttachmentConflict("Attachment file is not ready yet.")
    settings = get_settings()
    filename = f"{row.title}.pdf"
    out = await storage.presign_get(
        row.file_key, settings.S3_PLAY_EXPIRE_SEC, filename, disposition, row.content_type
    )
    return {"file_url": out["playback_url"], "expires_in": out["expires_in"]}
