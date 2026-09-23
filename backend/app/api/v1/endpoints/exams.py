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
    to_exam_detail_out,
    to_exam_out,
    to_question_out,
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


@router.get("/exams/{exam_id}", response_model=ExamDetailOut)
async def get_exam(db: DbDep, actor: CurrentUserDep, exam_id: str) -> ExamDetailOut:
    try:
        exam, questions = await exam_service.get_exam_detail(db, actor, exam_id)
    except _EXAM_ERRORS as e:
        raise HTTPException(status_code=_error_status(e), detail=e.message) from None
    return to_exam_detail_out(exam, questions)


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
