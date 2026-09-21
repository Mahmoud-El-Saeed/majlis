from fastapi import APIRouter, HTTPException, status

from app.api.dependencies import CurrentUserDep, DbDep
from app.models.lesson import LessonStatus
from app.repositories.attachment_repository import attachment_repository
from app.repositories.course_repository import course_repository
from app.schemas.lessons import (
    LessonCreateIn,
    LessonOut,
    LessonSummaryOut,
    LessonUpdateIn,
    to_lesson_out,
    to_lesson_summary,
    to_student_lesson_out,
)
from app.services import lesson_service
from app.services.course_service import CourseForbidden, CourseNotFound, can_write
from app.services.lesson_service import LessonError, LessonForbidden, LessonNotFound

router = APIRouter(tags=["lessons"])


def _lesson_error_status(e: Exception) -> int:
    if isinstance(e, (LessonNotFound, CourseNotFound)):
        return 404
    if isinstance(e, (LessonForbidden, CourseForbidden)):
        return 403
    return 400


@router.post(
    "/courses/{course_id}/lessons", status_code=status.HTTP_201_CREATED, response_model=LessonOut
)
async def create_lesson(
    db: DbDep, user: CurrentUserDep, course_id: str, data: LessonCreateIn
) -> LessonOut:
    try:
        lesson = await lesson_service.create_lesson(db, user, course_id, data)
    except (LessonError, CourseNotFound, CourseForbidden) as e:
        raise HTTPException(status_code=_lesson_error_status(e), detail=e.message) from None
    return to_lesson_out(lesson, can_manage=True)


@router.get("/courses/{course_id}/lessons", response_model=list[LessonSummaryOut])
async def list_lessons(db: DbDep, user: CurrentUserDep, course_id: str) -> list[LessonSummaryOut]:
    try:
        lessons = await lesson_service.list_lessons(db, user, course_id)
    except CourseNotFound as e:
        raise HTTPException(status_code=404, detail=e.message) from None
    except (LessonForbidden, CourseForbidden) as e:
        raise HTTPException(status_code=403, detail=e.message) from None
    course = await course_repository.get_by_id(db, course_id)
    writer = course is not None and can_write(user, course)
    if not writer:
        # Students see only ready lessons: unready (pending/processing)
        # sessions never show as content, mirroring ticket 05 semantics.
        lessons = [lesson for lesson in lessons if lesson.status == LessonStatus.ready]
    counts = await attachment_repository.counts_for_lessons(
        db, [lesson.id for lesson in lessons], ready_only=not writer
    )
    return [to_lesson_summary(lesson, counts.get(str(lesson.id), 0)) for lesson in lessons]


@router.get("/lessons/{lesson_id}", response_model=LessonOut)
async def get_lesson(db: DbDep, user: CurrentUserDep, lesson_id: str) -> LessonOut:
    try:
        lesson, writer = await lesson_service.get_lesson_detail(db, user, lesson_id)
    except LessonNotFound as e:
        raise HTTPException(status_code=404, detail=e.message) from None
    except (LessonForbidden, CourseForbidden) as e:
        raise HTTPException(status_code=403, detail=e.message) from None
    # Ticket 06 audio-only student view: writers see transcripts + audio_key,
    # approved students get metadata only (play via /play, files via /file).
    return to_lesson_out(lesson, can_manage=True) if writer else to_student_lesson_out(lesson)


@router.put("/lessons/{lesson_id}", response_model=LessonOut)
async def update_lesson(
    db: DbDep, user: CurrentUserDep, lesson_id: str, data: LessonUpdateIn
) -> LessonOut:
    try:
        lesson = await lesson_service.update_lesson(db, user, lesson_id, data)
    except (LessonError, LessonNotFound, LessonForbidden, CourseNotFound, CourseForbidden) as e:
        raise HTTPException(status_code=_lesson_error_status(e), detail=e.message) from None
    return to_lesson_out(lesson, can_manage=True)


@router.delete("/lessons/{lesson_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lesson(db: DbDep, user: CurrentUserDep, lesson_id: str) -> None:
    try:
        await lesson_service.delete_lesson(db, user, lesson_id)
    except (LessonError, LessonNotFound, LessonForbidden, CourseNotFound, CourseForbidden) as e:
        raise HTTPException(status_code=_lesson_error_status(e), detail=e.message) from None
