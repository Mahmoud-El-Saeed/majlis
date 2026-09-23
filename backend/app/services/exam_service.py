import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exam import Exam, ShowResultMode
from app.models.question import Question, QuestionType
from app.models.user import User
from app.repositories.course_repository import course_repository
from app.repositories.exam_repository import exam_repository
from app.repositories.lesson_repository import lesson_repository
from app.repositories.question_repository import question_repository
from app.schemas.exams import ExamCreateIn, ExamUpdateIn, QuestionCreateIn, QuestionUpdateIn
from app.services.course_service import CourseNotFound, can_write


class ExamError(Exception):
    def __init__(self, message: str):
        self.message = message


class ExamNotFound(ExamError):
    pass


class ExamForbidden(ExamError):
    pass


class QuestionNotFound(ExamError):
    pass


async def _course_or_404(db: AsyncSession, course_id: str):
    course = await course_repository.get_by_id(db, course_id)
    if course is None:
        raise CourseNotFound("Course not found.")
    return course


def _check_can_write(actor: User, course) -> None:  # type: ignore[no-untyped-def]
    if not can_write(actor, course):
        raise ExamForbidden("Not authorized.")


def _check_window(open_at, close_at) -> None:  # type: ignore[no-untyped-def]
    if open_at is not None and close_at is not None and open_at >= close_at:
        raise ExamError("open_at must be before close_at.")


async def _resolve_lesson(db: AsyncSession, course, lesson_id: uuid.UUID | None):  # type: ignore[no-untyped-def]
    if lesson_id is None:
        return None
    lesson = await lesson_repository.get_by_id(db, str(lesson_id))
    if lesson is None:
        raise ExamNotFound("Lesson not found.")
    if lesson.course_id != course.id:
        raise ExamError("Lesson does not belong to this course.")
    return lesson


async def create_exam(db: AsyncSession, actor: User, course_id: str, data: ExamCreateIn) -> Exam:
    course = await _course_or_404(db, course_id)
    _check_can_write(actor, course)
    _check_window(data.open_at, data.close_at)
    lesson = await _resolve_lesson(db, course, data.lesson_id)
    exam = Exam(
        course_id=course.id,
        lesson_id=lesson.id if lesson is not None else None,
        title=data.title.strip(),
        description=data.description,
        attempts_limit=data.attempts_limit,
        duration_minutes=data.duration_minutes,
        open_at=data.open_at,
        close_at=data.close_at,
        pass_score=data.pass_score,
        show_result=ShowResultMode(data.show_result),
        created_by=actor.id,
    )
    if not exam.title:
        raise ExamError("Title must not be blank.")
    return await exam_repository.save(db, exam)


async def list_exams(db: AsyncSession, actor: User, course_id: str) -> list[Exam]:
    course = await _course_or_404(db, course_id)
    _check_can_write(actor, course)
    return await exam_repository.list_for_course(db, course.id)


async def _exam_and_course(db: AsyncSession, exam_id: str):  # type: ignore[no-untyped-def]
    exam = await exam_repository.get_by_id(db, exam_id)
    if exam is None:
        raise ExamNotFound("Exam not found.")
    course = await course_repository.get_by_id(db, str(exam.course_id))
    if course is None:
        raise CourseNotFound("Course not found.")
    return exam, course


async def get_exam_detail(
    db: AsyncSession, actor: User, exam_id: str
) -> tuple[Exam, list[Question]]:
    exam, course = await _exam_and_course(db, exam_id)
    _check_can_write(actor, course)
    questions = await question_repository.list_for_exam(db, exam.id)
    return exam, questions


async def update_exam(db: AsyncSession, actor: User, exam_id: str, data: ExamUpdateIn) -> Exam:
    exam, course = await _exam_and_course(db, exam_id)
    _check_can_write(actor, course)
    merged_open = (
        None if data.clear_open_at else (data.open_at if data.open_at is not None else exam.open_at)
    )
    merged_close = (
        None
        if data.clear_close_at
        else (data.close_at if data.close_at is not None else exam.close_at)
    )
    _check_window(merged_open, merged_close)
    if data.title is not None:
        title = data.title.strip()
        if not title:
            raise ExamError("Title must not be blank.")
        exam.title = title
    if data.clear_description:
        exam.description = None
    elif data.description is not None:
        exam.description = data.description
    if data.clear_lesson:
        exam.lesson_id = None
    elif data.lesson_id is not None:
        lesson = await _resolve_lesson(db, course, data.lesson_id)
        exam.lesson_id = lesson.id if lesson is not None else None
    if data.attempts_limit is not None:
        exam.attempts_limit = data.attempts_limit
    if data.clear_duration_minutes:
        exam.duration_minutes = None
    elif data.duration_minutes is not None:
        exam.duration_minutes = data.duration_minutes
    if data.clear_open_at:
        exam.open_at = None
    elif data.open_at is not None:
        exam.open_at = data.open_at
    if data.clear_close_at:
        exam.close_at = None
    elif data.close_at is not None:
        exam.close_at = data.close_at
    if data.pass_score is not None:
        exam.pass_score = data.pass_score
    if data.show_result is not None:
        exam.show_result = ShowResultMode(data.show_result)
    await db.flush()
    await db.refresh(exam)
    return exam


async def delete_exam(db: AsyncSession, actor: User, exam_id: str) -> None:
    exam, course = await _exam_and_course(db, exam_id)
    _check_can_write(actor, course)
    await exam_repository.delete(db, exam)


def _default_score(max_score: int | None) -> int:
    score = max_score if max_score is not None else 1
    if score <= 0:
        raise ExamError("max_score must be positive.")
    return score


def _check_question_shapes(
    qtype: str,
    options: list[str] | None,
    correct_index: int | None,
    correct_answer: bool | None,
    max_score: int | None,
) -> tuple[list[str] | None, int | None, bool | None, int]:
    if qtype == QuestionType.mcq.value:
        if (
            options is None
            or len(options) != 4
            or any(not isinstance(o, str) or not o.strip() for o in options)
        ):
            raise ExamError("MCQ questions need exactly 4 non-empty options.")
        if correct_index is None:
            raise ExamError("MCQ questions need correct_index (0-3).")
        if correct_index < 0 or correct_index > 3:
            raise ExamError("MCQ correct_index must be 0-3.")
        if correct_answer is not None:
            raise ExamError("MCQ questions must not set correct_answer.")
        return (options, correct_index, None, _default_score(max_score))
    if qtype == QuestionType.tf.value:
        if correct_answer is None:
            raise ExamError("True/False questions need correct_answer.")
        if options is not None:
            raise ExamError("True/False questions must not set options.")
        if correct_index is not None:
            raise ExamError("True/False questions must not set correct_index.")
        return (None, None, correct_answer, _default_score(max_score))
    if qtype == QuestionType.essay.value:
        if max_score is None:
            raise ExamError("Essay questions need max_score.")
        if max_score <= 0:
            raise ExamError("max_score must be positive.")
        if options is not None:
            raise ExamError("Essay questions must not set options.")
        if correct_index is not None or correct_answer is not None:
            raise ExamError("Essay questions must not set a correct answer.")
        return (None, None, None, max_score)
    raise ExamError("Unknown question type.")


async def create_question(
    db: AsyncSession, actor: User, exam_id: str, data: QuestionCreateIn
) -> Question:
    exam, course = await _exam_and_course(db, exam_id)
    _check_can_write(actor, course)
    prompt = data.prompt.strip()
    if not prompt:
        raise ExamError("Prompt must not be blank.")
    options, correct_index, correct_answer, score = _check_question_shapes(
        data.type, data.options, data.correct_index, data.correct_answer, data.max_score
    )
    question = Question(
        exam_id=exam.id,
        type=QuestionType(data.type),
        prompt=prompt,
        options=options,
        correct_index=correct_index,
        correct_answer=correct_answer,
        max_score=score,
        position=data.position,
    )
    return await question_repository.save(db, question)


async def list_questions(db: AsyncSession, actor: User, exam_id: str) -> list[Question]:
    exam, course = await _exam_and_course(db, exam_id)
    _check_can_write(actor, course)
    return await question_repository.list_for_exam(db, exam.id)


async def _question_and_course(db: AsyncSession, question_id: str):  # type: ignore[no-untyped-def]
    question = await question_repository.get_by_id(db, question_id)
    if question is None:
        raise QuestionNotFound("Question not found.")
    exam, course = await _exam_and_course(db, str(question.exam_id))
    return question, exam, course


async def update_question(
    db: AsyncSession, actor: User, question_id: str, data: QuestionUpdateIn
) -> Question:
    question, _, course = await _question_and_course(db, question_id)
    _check_can_write(actor, course)
    merged_type = data.type if data.type is not None else str(question.type.value)
    if data.clear_options:
        merged_options = None
    elif data.options is not None:
        merged_options = data.options
    else:
        merged_options = list(question.options) if question.options is not None else None
    if data.clear_correct_index:
        merged_index = None
    elif data.correct_index is not None:
        merged_index = data.correct_index
    else:
        merged_index = question.correct_index
    if data.clear_correct_answer:
        merged_answer = None
    elif data.correct_answer is not None:
        merged_answer = data.correct_answer
    else:
        merged_answer = question.correct_answer
    merged_score = data.max_score if data.max_score is not None else question.max_score
    merged_prompt = data.prompt.strip() if data.prompt is not None else question.prompt
    if not merged_prompt.strip():
        raise ExamError("Prompt must not be blank.")
    options, correct_index, correct_answer, score = _check_question_shapes(
        merged_type, merged_options, merged_index, merged_answer, merged_score
    )
    question.type = QuestionType(merged_type)
    question.prompt = merged_prompt.strip()
    question.options = options
    question.correct_index = correct_index
    question.correct_answer = correct_answer
    question.max_score = score
    if data.position is not None:
        question.position = data.position
    await db.flush()
    await db.refresh(question)
    return question


async def delete_question(db: AsyncSession, actor: User, question_id: str) -> None:
    question, _, course = await _question_and_course(db, question_id)
    _check_can_write(actor, course)
    await question_repository.delete(db, question)
