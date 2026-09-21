from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.storage_client import StorageClient
from app.models.course import Course
from app.models.lesson import Lesson, LessonMediaType, LessonStatus
from app.models.user import User
from app.repositories.course_repository import course_repository
from app.repositories.lesson_repository import lesson_repository
from app.services.course_service import CourseNotFound, can_view, can_write


class StorageError(Exception):
    def __init__(self, message: str):
        self.message = message


class StorageNotFound(StorageError):
    pass


class StorageForbidden(StorageError):
    pass


class StorageConflict(StorageError):
    pass


_ALLOWED_EXTS = frozenset(
    {".mp3", ".m4a", ".wav", ".ogg", ".oga", ".opus", ".aac", ".flac", ".webm"}
)


def _check_audio(content_type: str | None) -> str:
    """Audio-only V1 gate. Returns the normalized content type."""
    ct = (content_type or "").strip().lower()
    if not ct.startswith("audio/"):
        raise StorageError("Only audio uploads are supported in V1.")
    return ct


def _check_ext(file_ext: str | None) -> str:
    ext = (file_ext or ".mp3").strip().lower()
    if not ext.startswith("."):
        ext = f".{ext}"
    if ext not in _ALLOWED_EXTS:
        raise StorageError("Only audio uploads are supported in V1.")
    return ext


def build_object_key(course_id: str, lesson_id: str, file_ext: str | None) -> str:
    """ADR-0004 prefix: courses/{course_id}/lessons/{lesson_id}/audio{ext}."""
    return f"courses/{course_id}/lessons/{lesson_id}/audio{_check_ext(file_ext)}"


async def _load_authorized(
    db: AsyncSession, actor: User, lesson_id: str, *, need_write: bool
) -> tuple[Lesson, Course]:
    """Fetch lesson + parent course and enforce the gate in one place.

    Writes (upload-url, confirm): admin or owner-teacher via can_write.
    Reads (play): admin, owner-teacher, or approved enrollment via can_view.
    """
    lesson = await lesson_repository.get_by_id(db, lesson_id)
    if lesson is None:
        raise StorageNotFound("Lesson not found.")
    course = await course_repository.get_by_id(db, str(lesson.course_id))
    if course is None:
        raise CourseNotFound("Course not found.")
    allowed = can_write(actor, course) if need_write else await can_view(db, actor, course)
    if not allowed:
        raise StorageForbidden("Not authorized.")
    return lesson, course


async def request_upload_url(
    db: AsyncSession,
    actor: User,
    lesson_id: str,
    content_type: str | None,
    file_ext: str | None,
    storage: StorageClient,
) -> dict:
    """Issue a fresh PUT URL. Idempotent across pending/processing/ready so an
    interrupted upload can always retry with a new URL (stuck-state recovery)."""
    ct = _check_audio(content_type)
    lesson, course = await _load_authorized(db, actor, lesson_id, need_write=True)
    key = build_object_key(str(course.id), str(lesson.id), file_ext)
    settings = get_settings()
    out = await storage.presign_put(key, ct, settings.S3_UPLOAD_EXPIRE_SEC)
    # Stuck-state recovery without availability loss: a ready lesson stays
    # playable while its replacement uploads; only pending/processing move.
    if lesson.status != LessonStatus.ready:
        lesson.status = LessonStatus.processing
        await db.flush()
        await db.refresh(lesson)
    return out


async def confirm_upload(
    db: AsyncSession,
    actor: User,
    lesson_id: str,
    object_key: str,
    storage: StorageClient,
) -> Lesson:
    """Verify the browser PUT landed, then mark ready. Missing object -> 409
    and the lesson stays `processing` (never `ready` without bytes)."""
    lesson, course = await _load_authorized(db, actor, lesson_id, need_write=True)
    expected_prefix = f"courses/{course.id}/lessons/{lesson.id}/"
    if not object_key.startswith(expected_prefix):
        raise StorageConflict("Upload not found. Retry with a fresh upload URL.")
    # Audio-only V1 re-check on the confirmed key: the upload-url gate can be
    # bypassed with a spoofed content type, so the extension is verified here.
    _check_ext(object_key[object_key.rfind(".") :])
    if not await storage.object_exists(object_key):
        raise StorageConflict("Upload not found. Retry with a fresh upload URL.")
    lesson.audio_key = object_key
    lesson.media_type = LessonMediaType.audio
    lesson.status = LessonStatus.ready
    await db.flush()
    await db.refresh(lesson)
    return lesson


async def get_playback_url(
    db: AsyncSession, actor: User, lesson_id: str, storage: StorageClient
) -> dict:
    """Signed GET URL for approved members only. VPS proxies zero bytes."""
    lesson, _course = await _load_authorized(db, actor, lesson_id, need_write=False)
    if lesson.status != LessonStatus.ready or not lesson.audio_key:
        raise StorageConflict("Lesson audio is not ready yet.")
    settings = get_settings()
    return await storage.presign_get(lesson.audio_key, settings.S3_PLAY_EXPIRE_SEC)
