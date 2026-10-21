from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status

from app.api.dependencies import CurrentUserDep, DbDep
from app.schemas.exams import (
    ExamCreateIn,
    ExamDetailOut,
    ExamOut,
    ExamUpdateIn,
    QuestionCreateIn,
    QuestionOut,
    QuestionUpdateIn,
    StudentExamDetailOut,
    StudentExamOut,
    to_exam_detail_out,
    to_exam_out,
    to_question_out,
    to_student_exam_detail_out,
    to_student_exam_out,
)
from app.services import exam_service
from app.services.course_service import CourseForbidden, CourseNotFound
from app.services.exam_service import ExamError, ExamForbidden, ExamNotFound, QuestionNotFound

router = APIRouter(tags=["exams"])

_NOT_FOUND = (ExamNotFound, QuestionNotFound, CourseNotFound)
_FORBIDDEN = (ExamForbidden, CourseForbidden)
_EXAM_ERRORS = _NOT_FOUND + _FORBIDDEN + (ExamError,)


def _error_status(e: Exception) -> int:
    if isinstance(e, _NOT_FOUND):
        return 404
    if isinstance(e, _FORBIDDEN):
        return 403
    return 400


@router.post(
    "/courses/{course_id}/exams", status_code=status.HTTP_201_CREATED, response_model=ExamOut
)
async def create_exam(
    db: DbDep, actor: CurrentUserDep, course_id: str, data: ExamCreateIn
) -> ExamOut:
    try:
        exam = await exam_service.create_exam(db, actor, course_id, data)
    except _EXAM_ERRORS as e:
        raise HTTPException(status_code=_error_status(e), detail=e.message) from None
    return to_exam_out(exam)


@router.get("/courses/{course_id}/exams", response_model=list[ExamOut])
async def list_exams(db: DbDep, actor: CurrentUserDep, course_id: str) -> list[ExamOut]:
    try:
        exams = await exam_service.list_exams(db, actor, course_id)
    except _EXAM_ERRORS as e:
        raise HTTPException(status_code=_error_status(e), detail=e.message) from None
    return [to_exam_out(e) for e in exams]


@router.get("/courses/{course_id}/student-exams", response_model=list[StudentExamOut])
async def list_student_exams(
    db: DbDep, actor: CurrentUserDep, course_id: str
) -> list[StudentExamOut]:
    """Student-safe discovery (ticket 14): can_view gate, never correct_* keys."""
    try:
        rows = await exam_service.list_student_exams(db, actor, course_id)
    except _EXAM_ERRORS as e:
        raise HTTPException(status_code=_error_status(e), detail=e.message) from None
    now = datetime.now(UTC)
    return [
        to_student_exam_out(
            exam,
            attempts_used=progress.attempts_used,
            has_in_progress=progress.has_in_progress,
            last_score=progress.last_score,
            now=now,
        )
        for exam, progress in rows
    ]


@router.get("/exams/{exam_id}", response_model=ExamDetailOut)
async def get_exam(db: DbDep, actor: CurrentUserDep, exam_id: str) -> ExamDetailOut:
    try:
        exam, questions = await exam_service.get_exam_detail(db, actor, exam_id)
    except _EXAM_ERRORS as e:
        raise HTTPException(status_code=_error_status(e), detail=e.message) from None
    return to_exam_detail_out(exam, questions)


@router.get("/exams/{exam_id}/student-exam", response_model=StudentExamDetailOut)
async def get_student_exam(
    db: DbDep, actor: CurrentUserDep, exam_id: str
) -> StudentExamDetailOut:
    """Student-safe single exam read (ticket 20).

    Same can_view gate as the per-course discovery list: approved
    enrollment, owner-teacher, or admin. The payload carries the exam
    config, the personal progress numbers and the question COUNT only —
    never a question body, an option list or an answer key.
    """
    try:
        exam, count, progress = await exam_service.get_student_exam_detail(db, actor, exam_id)
    except _EXAM_ERRORS as e:
        raise HTTPException(status_code=_error_status(e), detail=e.message) from None
    now = datetime.now(UTC)
    return to_student_exam_detail_out(
        exam,
        questions_count=count,
        attempts_used=progress.attempts_used,
        has_in_progress=progress.has_in_progress,
        last_score=progress.last_score,
        now=now,
    )


@router.put("/exams/{exam_id}", response_model=ExamOut)
async def update_exam(
    db: DbDep, actor: CurrentUserDep, exam_id: str, data: ExamUpdateIn
) -> ExamOut:
    try:
        exam = await exam_service.update_exam(db, actor, exam_id, data)
    except _EXAM_ERRORS as e:
        raise HTTPException(status_code=_error_status(e), detail=e.message) from None
    return to_exam_out(exam)


@router.delete("/exams/{exam_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_exam(db: DbDep, actor: CurrentUserDep, exam_id: str) -> None:
    try:
        await exam_service.delete_exam(db, actor, exam_id)
    except _EXAM_ERRORS as e:
        raise HTTPException(status_code=_error_status(e), detail=e.message) from None


@router.post(
    "/exams/{exam_id}/questions",
    status_code=status.HTTP_201_CREATED,
    response_model=QuestionOut,
)
async def create_question(
    db: DbDep, actor: CurrentUserDep, exam_id: str, data: QuestionCreateIn
) -> QuestionOut:
    try:
        question = await exam_service.create_question(db, actor, exam_id, data)
    except _EXAM_ERRORS as e:
        raise HTTPException(status_code=_error_status(e), detail=e.message) from None
    return to_question_out(question)


@router.get("/exams/{exam_id}/questions", response_model=list[QuestionOut])
async def list_questions(db: DbDep, actor: CurrentUserDep, exam_id: str) -> list[QuestionOut]:
    try:
        questions = await exam_service.list_questions(db, actor, exam_id)
    except _EXAM_ERRORS as e:
        raise HTTPException(status_code=_error_status(e), detail=e.message) from None
    return [to_question_out(q) for q in questions]


@router.put("/questions/{question_id}", response_model=QuestionOut)
async def update_question(
    db: DbDep, actor: CurrentUserDep, question_id: str, data: QuestionUpdateIn
) -> QuestionOut:
    try:
        question = await exam_service.update_question(db, actor, question_id, data)
    except _EXAM_ERRORS as e:
        raise HTTPException(status_code=_error_status(e), detail=e.message) from None
    return to_question_out(question)


@router.delete("/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_question(db: DbDep, actor: CurrentUserDep, question_id: str) -> None:
    try:
        await exam_service.delete_question(db, actor, question_id)
    except _EXAM_ERRORS as e:
        raise HTTPException(status_code=_error_status(e), detail=e.message) from None
