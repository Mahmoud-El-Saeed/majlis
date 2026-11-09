import csv
import io
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attempt import Attempt, AttemptStatus
from app.models.exam import Exam, ShowResultMode
from app.models.question import QuestionType
from app.models.user import User
from app.repositories.attempt_answer_repository import attempt_answer_repository
from app.repositories.attempt_repository import attempt_repository
from app.repositories.course_repository import course_repository
from app.repositories.exam_repository import exam_repository
from app.repositories.question_repository import question_repository
from app.repositories.user_repository import user_repository
from app.schemas.common import enum_str
from app.schemas.grading import (
    GradebookAnswerOut,
    GradebookRowOut,
    GradeEssayIn,
)
from app.services.course_service import CourseNotFound, can_write


class GradingError(Exception):
    def __init__(self, message: str):
        self.message = message


class GradingNotFound(GradingError):
    pass


class GradingForbidden(GradingError):
    pass


def _check_can_write(actor: User, course) -> None:  # type: ignore[no-untyped-def]
    if not can_write(actor, course):
        raise GradingForbidden("Not authorized.")


async def _course_or_404(db: AsyncSession, course_id: object):  # type: ignore[no-untyped-def]
    course = await course_repository.get_by_id(db, str(course_id))
    if course is None:
        raise CourseNotFound("Course not found.")
    return course


async def _writable_attempt(db: AsyncSession, actor: User, attempt_id: str) -> tuple[Attempt, Exam]:  # type: ignore[no-untyped-def]
    """Shared attempt → exam → writable-course chain for the per-attempt
    mutations (grade/publish) so the three paths cannot drift."""
    attempt = await attempt_repository.get_by_id(db, attempt_id)
    if attempt is None:
        raise GradingNotFound("Attempt not found.")
    exam = await exam_repository.get_by_id(db, str(attempt.exam_id))
    if exam is None:
        raise GradingNotFound("Exam not found.")
    course = await _course_or_404(db, exam.course_id)
    _check_can_write(actor, course)
    return attempt, exam


async def grade_essay(
    db: AsyncSession, actor: User, attempt_id: str, question_id: str, data: GradeEssayIn
):  # type: ignore[no-untyped-def]
    """Grade one pending essay answer with score + feedback; retotal the attempt.

    Essay-only (ticket 09): MCQ/TF questions are rejected so auto-grades
    cannot be overwritten. Re-grading an essay is allowed and re-tallies.
    Feedback is required (ticket: "score + feedback text"). Publish state
    is untouched — visibility still follows show_grades_for (immediate
    reveals, after_publish waits for publish).
    """
    attempt, _ = await _writable_attempt(db, actor, attempt_id)

    if attempt.status != AttemptStatus.submitted:
        raise GradingError("Only submitted attempts can be graded.")

    try:
        qid = uuid.UUID(str(question_id))
    except ValueError:
        raise GradingNotFound("Question not found.") from None
    question = await question_repository.get_by_id(db, str(qid))
    if question is None or question.exam_id != attempt.exam_id:
        raise GradingNotFound("Question not found.")

    answers = await attempt_answer_repository.list_for_attempt(db, attempt.id)
    answer = next((a for a in answers if a.question_id == question.id), None)
    if answer is None:
        raise GradingNotFound("Answer not found.")
    if question.type != QuestionType.essay:
        raise GradingError("Only essay answers can be graded manually.")
    feedback = data.feedback.strip()
    if not feedback:
        raise GradingError("feedback must not be blank.")
    if data.awarded_score > question.max_score:
        raise GradingError("awarded_score must not exceed max_score.")

    answer.awarded_score = data.awarded_score
    answer.feedback = feedback
    answer.needs_grading = False
    answer.is_correct = None
    await db.flush()

    answers = await attempt_answer_repository.list_for_attempt(db, attempt.id)
    attempt.score = sum(a.awarded_score for a in answers)
    await db.flush()
    await db.refresh(attempt)
    await db.refresh(answer)
    return attempt, answer


async def publish_attempt(db: AsyncSession, actor: User, attempt_id: str):  # type: ignore[no-untyped-def]
    """Publish one submitted attempt (after_publish exams only). Idempotent."""
    attempt, exam = await _writable_attempt(db, actor, attempt_id)

    if exam.show_result != ShowResultMode.after_publish:
        raise GradingError("Exam publishes immediately; no manual publish needed.")
    if attempt.status != AttemptStatus.submitted:
        raise GradingError("Only submitted attempts can be published.")
    attempt.is_published = True
    await db.flush()
    await db.refresh(attempt)
    return attempt, exam


async def publish_exam(db: AsyncSession, actor: User, exam_id: str):  # type: ignore[no-untyped-def]
    """Bulk publish all submitted unpublished attempts for an exam."""
    exam = await exam_repository.get_by_id(db, exam_id)
    if exam is None:
        raise GradingNotFound("Exam not found.")
    course = await _course_or_404(db, exam.course_id)
    _check_can_write(actor, course)

    if exam.show_result != ShowResultMode.after_publish:
        raise GradingError("Exam publishes immediately; no manual publish needed.")
    count = await attempt_repository.publish_for_exam(db, exam.id)
    return exam, count


async def gradebook_for_course(
    db: AsyncSession, actor: User, course_id: str
) -> list[GradebookRowOut]:
    """Per-course gradebook: one row per submitted attempt (every attempt).

    Teacher-only read projection over attempts. Full grades always shown to
    the writer regardless of the exam's publish setting; students keep using
    the taking endpoints with show_grades_for gating.
    """
    course = await course_repository.get_by_id(db, course_id)
    if course is None:
        raise CourseNotFound("Course not found.")
    _check_can_write(actor, course)

    attempts = await attempt_repository.list_submitted_for_course(db, course.id)
    rows: list[GradebookRowOut] = []
    for attempt in attempts:
        # attempts.exam_id is ON DELETE CASCADE, so a missing exam here
        # means a broken FK invariant — loud failure, never a silent skip.
        exam = await exam_repository.get_by_id(db, str(attempt.exam_id))
        if exam is None:
            raise GradingError("Exam not found.")
        student = await user_repository.get_by_id(db, str(attempt.student_id))
        questions = await question_repository.list_for_exam(db, exam.id)
        answers = await attempt_answer_repository.list_for_attempt(db, attempt.id)
        questions_by_id = {str(q.id): q for q in questions}
        email = student.email if student is not None else ""
        student_name = (student.full_name or "").strip() if student is not None else ""
        if not student_name:
            student_name = email
        row_answers: list[GradebookAnswerOut] = []
        for a in sorted(answers, key=lambda r: str(r.question_id)):
            question = questions_by_id.get(str(a.question_id))
            if question is None:
                continue
            row_answers.append(
                GradebookAnswerOut(
                    question_id=str(a.question_id),
                    question_type=enum_str(question.type),
                    question_prompt=question.prompt,
                    question_max=question.max_score,
                    awarded_score=a.awarded_score,
                    needs_grading=a.needs_grading,
                    feedback=a.feedback,
                )
            )
        rows.append(
            GradebookRowOut(
                attempt_id=str(attempt.id),
                exam_id=str(exam.id),
                exam_title=exam.title,
                student_id=str(attempt.student_id),
                student_email=email,
                student_name=student_name,
                status=enum_str(attempt.status),
                score=attempt.score,
                max_score=attempt.max_score,
                is_published=attempt.is_published,
                is_late=attempt.is_late,
                submitted_at=attempt.submitted_at,
                answers=row_answers,
            )
        )
    return rows


CSV_HEADER = [
    "student_email",
    "student_name",
    "exam_title",
    "attempt_id",
    "exam_id",
    "student_id",
    "status",
    "score",
    "max_score",
    "is_published",
    "is_late",
    "submitted_at",
    "question_id",
    "question_type",
    "question_prompt",
    "question_max",
    "awarded_score",
    "needs_grading",
    "feedback",
]


def build_gradebook_csv(rows: list[GradebookRowOut]) -> str:
    """Render the gradebook projection as CSV (long format).

    One row per attempt-answer so per-student totals repeat while the
    per-question breakdown varies. An attempt with no answers still emits
    one totals-only row so no submitted attempt vanishes from the export.
    """
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(CSV_HEADER)
    for row in rows:
        totals_prefix = [
            row.student_email,
            row.student_name,
            row.exam_title,
            row.attempt_id,
            row.exam_id,
            row.student_id,
            row.status,
            row.score if row.score is not None else "",
            row.max_score,
            str(row.is_published).lower(),
            str(row.is_late).lower(),
            row.submitted_at.isoformat() if row.submitted_at else "",
        ]
        if not row.answers:
            writer.writerow([*totals_prefix, "", "", "", "", "", "", ""])
            continue
        for a in row.answers:
            writer.writerow(
                [
                    *totals_prefix,
                    a.question_id,
                    a.question_type,
                    a.question_prompt,
                    a.question_max,
                    a.awarded_score,
                    str(a.needs_grading).lower(),
                    a.feedback or "",
                ]
            )
    return buf.getvalue()
