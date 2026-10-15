from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.lesson import Lesson, LessonMediaType
from app.models.user import User
from app.repositories.course_repository import course_repository
from app.repositories.lesson_repository import lesson_repository
from app.schemas.lessons import LessonCreateIn, LessonUpdateIn
from app.services.course_service import CourseNotFound, can_view, can_write, is_book_based


class LessonError(Exception):
    def __init__(self, message: str):
        self.message = message


class LessonNotFound(LessonError):
    pass


class LessonForbidden(LessonError):
    pass


async def _course_or_404(db: AsyncSession, course_id: str) -> Course:
    course = await course_repository.get_by_id(db, course_id)
    if course is None:
        raise CourseNotFound("Course not found.")
    return course


def _check_media_type(value: str | None) -> None:
    if value is not None and value != LessonMediaType.audio.value:
        raise LessonError("Only audio lessons are supported in V1.")


def _check_pages(
    course: Course, pages_from: int | None, pages_to: int | None
) -> None:
    if pages_from is not None and pages_to is not None and pages_from > pages_to:
        raise LessonError("pages_from must be <= pages_to.")
    # Ticket 16: pages range is meaningless without a book — frontend hides
    # the inputs for general courses; the backend rejects any bypass.
    if not is_book_based(course) and (pages_from is not None or pages_to is not None):
        raise LessonError("Pages range is only allowed on book-based courses.")


async def create_lesson(
    db: AsyncSession, actor: User, course_id: str, data: LessonCreateIn
) -> Lesson:
    course = await _course_or_404(db, course_id)
    if not can_write(actor, course):
        raise LessonForbidden("Not authorized.")
    _check_media_type(data.media_type)
    _check_pages(course, data.pages_from, data.pages_to)
    lesson = Lesson(
        course_id=course.id,
        title=data.title.strip(),
        description=data.description,
        lesson_date=data.lesson_date,
        pages_from=data.pages_from,
        pages_to=data.pages_to,
        audio_key=data.audio_key,
        media_type=LessonMediaType.audio,
        transcript_voice=data.transcript_voice or "",
        transcript_book=data.transcript_book or "",
    )
    return await lesson_repository.save(db, lesson)


async def list_lessons(db: AsyncSession, actor: User, course_id: str) -> list[Lesson]:
    course = await _course_or_404(db, course_id)
    if not await can_view(db, actor, course):
        raise LessonForbidden("Not authorized.")
    return await lesson_repository.list_for_course(db, course.id)


async def get_lesson(db: AsyncSession, actor: User, lesson_id: str) -> Lesson:
    lesson = await lesson_repository.get_by_id(db, lesson_id)
    if lesson is None:
        raise LessonNotFound("Lesson not found.")
    course = await course_repository.get_by_id(db, str(lesson.course_id))
    if course is None:
        raise CourseNotFound("Course not found.")
    if not await can_view(db, actor, course):
        raise LessonForbidden("Not authorized.")
    return lesson


async def get_lesson_detail(db: AsyncSession, actor: User, lesson_id: str) -> tuple[Lesson, bool]:
    """Lesson + writer flag so the endpoint returns full transcripts to
    teachers/admins and the audio-only student view to approved students."""
    lesson = await get_lesson(db, actor, lesson_id)
    course = await course_repository.get_by_id(db, str(lesson.course_id))
    if course is None:
        raise CourseNotFound("Course not found.")
    return lesson, can_write(actor, course)


async def _lesson_or_404(db: AsyncSession, lesson_id: str) -> Lesson:
    lesson = await lesson_repository.get_by_id(db, lesson_id)
    if lesson is None:
        raise LessonNotFound("Lesson not found.")
    return lesson


async def update_lesson(
    db: AsyncSession, actor: User, lesson_id: str, data: LessonUpdateIn
) -> Lesson:
    lesson = await _lesson_or_404(db, lesson_id)
    course = await course_repository.get_by_id(db, str(lesson.course_id))
    if course is None:
        raise CourseNotFound("Course not found.")
    if not can_write(actor, course):
        raise LessonForbidden("Not authorized.")
    _check_media_type(data.media_type)
    # Partial-update pages guard: compare the merged range, not just payload.
    # Pre-16 general lessons may hold stored pages ("kept but hidden"): edits
    # that leave pages untouched stay allowed (stored ranges already satisfy
    # the DB CHECK); only explicit pages writes on a general course reject.
    if not is_book_based(course):
        if data.pages_from is not None or data.pages_to is not None:
            raise LessonError("Pages range is only allowed on book-based courses.")
    else:
        merged_from = data.pages_from if data.pages_from is not None else lesson.pages_from
        merged_to = data.pages_to if data.pages_to is not None else lesson.pages_to
        _check_pages(course, merged_from, merged_to)
    if data.title is not None:
        lesson.title = data.title.strip()
    if data.description is not None:
        lesson.description = data.description
    if data.lesson_date is not None:
        lesson.lesson_date = data.lesson_date
    if data.pages_from is not None:
        lesson.pages_from = data.pages_from
    if data.pages_to is not None:
        lesson.pages_to = data.pages_to
    if data.audio_key is not None:
        lesson.audio_key = data.audio_key
    if data.transcript_voice is not None:
        lesson.transcript_voice = data.transcript_voice
    if data.transcript_book is not None:
        lesson.transcript_book = data.transcript_book
    await db.flush()
    await db.refresh(lesson)
    return lesson


async def delete_lesson(db: AsyncSession, actor: User, lesson_id: str) -> None:
    lesson = await _lesson_or_404(db, lesson_id)
    course = await course_repository.get_by_id(db, str(lesson.course_id))
    if course is None:
        raise CourseNotFound("Course not found.")
    if not can_write(actor, course):
        raise LessonForbidden("Not authorized.")
    await lesson_repository.delete(db, lesson)
