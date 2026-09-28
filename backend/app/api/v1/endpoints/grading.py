from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import APIRouter, HTTPException, Response, status

from app.api.dependencies import CurrentUserDep, DbDep
from app.schemas.grading import (
    GradeAnswerOut,
    GradebookRowOut,
    GradeEssayIn,
    PublishAttemptOut,
    PublishExamOut,
)
from app.services import grading_service
from app.services.course_service import CourseForbidden, CourseNotFound
from app.services.grading_service import GradingError, GradingForbidden, GradingNotFound

router = APIRouter(tags=["grading"])

_NOT_FOUND = (GradingNotFound, CourseNotFound)
_FORBIDDEN = (GradingForbidden, CourseForbidden)
_GRADING_ERRORS = _NOT_FOUND + _FORBIDDEN + (GradingError,)


def _error_status(e: Exception) -> int:
    if isinstance(e, _NOT_FOUND):
        return 404
    if isinstance(e, _FORBIDDEN):
        return 403
    return 400


async def _run[T](service_call: Callable[..., Awaitable[T]], *args: Any, **kwargs: Any) -> T:
    """Run a grading-service call, mapping domain errors to HTTP statuses."""
    try:
        return await service_call(*args, **kwargs)
    except _GRADING_ERRORS as e:
        raise HTTPException(status_code=_error_status(e), detail=e.message) from None


@router.patch("/attempts/{attempt_id}/answers/{question_id}", response_model=GradeAnswerOut)
async def grade_essay(
    db: DbDep, actor: CurrentUserDep, attempt_id: str, question_id: str, data: GradeEssayIn
) -> GradeAnswerOut:
    attempt, answer = await _run(
        grading_service.grade_essay, db, actor, attempt_id, question_id, data
    )
    return GradeAnswerOut(
        attempt_id=str(attempt.id),
        question_id=str(answer.question_id),
        awarded_score=answer.awarded_score,
        needs_grading=answer.needs_grading,
        feedback=answer.feedback,
        attempt_score=int(attempt.score or 0),
        attempt_max_score=attempt.max_score,
    )


@router.post("/attempts/{attempt_id}/publish", response_model=PublishAttemptOut)
async def publish_attempt(db: DbDep, actor: CurrentUserDep, attempt_id: str) -> PublishAttemptOut:
    attempt, exam = await _run(grading_service.publish_attempt, db, actor, attempt_id)
    return PublishAttemptOut(
        attempt_id=str(attempt.id),
        exam_id=str(exam.id),
        is_published=attempt.is_published,
    )


@router.post(
    "/exams/{exam_id}/publish",
    status_code=status.HTTP_200_OK,
    response_model=PublishExamOut,
)
async def publish_exam(db: DbDep, actor: CurrentUserDep, exam_id: str) -> PublishExamOut:
    exam, count = await _run(grading_service.publish_exam, db, actor, exam_id)
    return PublishExamOut(exam_id=str(exam.id), published=count)


@router.get("/courses/{course_id}/gradebook", response_model=list[GradebookRowOut])
async def gradebook(db: DbDep, actor: CurrentUserDep, course_id: str) -> list[GradebookRowOut]:
    return await _run(grading_service.gradebook_for_course, db, actor, course_id)


@router.get("/courses/{course_id}/gradebook/export")
async def gradebook_export(db: DbDep, actor: CurrentUserDep, course_id: str) -> Response:
    """CSV representation of the gradebook projection (same rows, flat)."""
    rows = await _run(grading_service.gradebook_for_course, db, actor, course_id)

    filename = f"gradebook-{course_id}.csv"
    return Response(
        content=grading_service.build_gradebook_csv(rows),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
