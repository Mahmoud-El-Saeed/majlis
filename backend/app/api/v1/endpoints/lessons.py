from fastapi import APIRouter, HTTPException, status

from app.api.dependencies import CurrentUserDep, DbDep
from app.schemas.lessons import LessonCreateIn, LessonOut, LessonUpdateIn, to_lesson_out
from app.services import lesson_service
from app.services.course_service import CourseForbidden, CourseNotFound
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
    return to_lesson_out(lesson)


@router.get("/courses/{course_id}/lessons", response_model=list[LessonOut])
async def list_lessons(db: DbDep, user: CurrentUserDep, course_id: str) -> list[LessonOut]:
    try:
        lessons = await lesson_service.list_lessons(db, user, course_id)
    except CourseNotFound as e:
        raise HTTPException(status_code=404, detail=e.message) from None
    except (LessonForbidden, CourseForbidden) as e:
        raise HTTPException(status_code=403, detail=e.message) from None
    return [to_lesson_out(lesson) for lesson in lessons]


@router.get("/lessons/{lesson_id}", response_model=LessonOut)
async def get_lesson(db: DbDep, user: CurrentUserDep, lesson_id: str) -> LessonOut:
    try:
        lesson = await lesson_service.get_lesson(db, user, lesson_id)
    except LessonNotFound as e:
        raise HTTPException(status_code=404, detail=e.message) from None
    except (LessonForbidden, CourseForbidden) as e:
        raise HTTPException(status_code=403, detail=e.message) from None
    return to_lesson_out(lesson)


@router.put("/lessons/{lesson_id}", response_model=LessonOut)
async def update_lesson(
    db: DbDep, user: CurrentUserDep, lesson_id: str, data: LessonUpdateIn
) -> LessonOut:
    try:
        lesson = await lesson_service.update_lesson(db, user, lesson_id, data)
    except (LessonError, LessonNotFound, LessonForbidden, CourseNotFound, CourseForbidden) as e:
        raise HTTPException(status_code=_lesson_error_status(e), detail=e.message) from None
    return to_lesson_out(lesson)


@router.delete("/lessons/{lesson_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lesson(db: DbDep, user: CurrentUserDep, lesson_id: str) -> None:
    try:
        await lesson_service.delete_lesson(db, user, lesson_id)
    except (LessonError, LessonNotFound, LessonForbidden, CourseNotFound, CourseForbidden) as e:
        raise HTTPException(status_code=_lesson_error_status(e), detail=e.message) from None
