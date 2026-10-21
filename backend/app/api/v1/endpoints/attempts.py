from fastapi import APIRouter, HTTPException, status

from app.api.dependencies import CurrentUserDep, DbDep
from app.schemas.attempts import AttemptAnswersIn, AttemptOut, to_attempt_out
from app.services import attempt_service
from app.services.attempt_service import AttemptError, AttemptForbidden, AttemptNotFound
from app.services.course_service import CourseForbidden, CourseNotFound

router = APIRouter(tags=["attempts"])

_NOT_FOUND = (AttemptNotFound, CourseNotFound)
_FORBIDDEN = (AttemptForbidden, CourseForbidden)
_ATTEMPT_ERRORS = _NOT_FOUND + _FORBIDDEN + (AttemptError,)


def _error_status(e: Exception) -> int:
    if isinstance(e, _NOT_FOUND):
        return 404
    if isinstance(e, _FORBIDDEN):
        return 403
    return 400


@router.post(
    "/exams/{exam_id}/attempts", status_code=status.HTTP_201_CREATED, response_model=AttemptOut
)
async def start_attempt(db: DbDep, actor: CurrentUserDep, exam_id: str) -> AttemptOut:
    try:
        attempt, questions, answers = await attempt_service.start_attempt(db, actor, exam_id)
    except _ATTEMPT_ERRORS as e:
        raise HTTPException(status_code=_error_status(e), detail=e.message) from None
    return to_attempt_out(attempt, questions, answers, show_grades=False)


@router.get("/exams/{exam_id}/attempts/me", response_model=list[AttemptOut])
async def list_my_attempts(db: DbDep, actor: CurrentUserDep, exam_id: str) -> list[AttemptOut]:
    try:
        exam, questions, rows = await attempt_service.list_my_attempts(db, actor, exam_id)
    except _ATTEMPT_ERRORS as e:
        raise HTTPException(status_code=_error_status(e), detail=e.message) from None
    return [
        to_attempt_out(
            attempt, questions, answers, show_grades=attempt_service.show_grades_for(exam, attempt)
        )
        for attempt, answers in rows
    ]


@router.get("/attempts/{attempt_id}", response_model=AttemptOut)
async def get_attempt(db: DbDep, actor: CurrentUserDep, attempt_id: str) -> AttemptOut:
    try:
        attempt, exam, questions, answers, is_writer = await attempt_service.get_attempt(
            db, actor, attempt_id
        )
    except _ATTEMPT_ERRORS as e:
        raise HTTPException(status_code=_error_status(e), detail=e.message) from None
    # Writers see everything (mirrors the gradebook); students follow the
    # exam's immediate vs after-publish setting.
    show = is_writer or attempt_service.show_grades_for(exam, attempt)
    return to_attempt_out(attempt, questions, answers, show_grades=show)


@router.post("/attempts/{attempt_id}/answers", response_model=AttemptOut)
async def save_answers(
    db: DbDep, actor: CurrentUserDep, attempt_id: str, data: AttemptAnswersIn
) -> AttemptOut:
    """Autosave the current selection of an in-progress attempt (ticket 20).

    Lets a student leave and come back to the same attempt: the selection is
    stored without a verdict, so no grade is visible before the submit.
    """
    try:
        attempt, questions, answers = await attempt_service.save_answers(
            db, actor, attempt_id, data
        )
    except _ATTEMPT_ERRORS as e:
        raise HTTPException(status_code=_error_status(e), detail=e.message) from None
    # An in-progress attempt never shows grades.
    return to_attempt_out(attempt, questions, answers, show_grades=False)


@router.post("/attempts/{attempt_id}/submit", response_model=AttemptOut)
async def submit_attempt(
    db: DbDep, actor: CurrentUserDep, attempt_id: str, data: AttemptAnswersIn
) -> AttemptOut:
    try:
        attempt, exam, questions, answers = await attempt_service.submit_attempt(
            db, actor, attempt_id, data
        )
    except _ATTEMPT_ERRORS as e:
        raise HTTPException(status_code=_error_status(e), detail=e.message) from None
    # Visibility follows immediate vs after_publish (receipt when unpublished).
    show = attempt_service.show_grades_for(exam, attempt)
    return to_attempt_out(attempt, questions, answers, show_grades=show)
