import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attempt import Attempt, AttemptAnswer, AttemptStatus
from app.models.course import Course
from app.models.enrollment import EnrollmentStatus
from app.models.exam import Exam, ShowResultMode
from app.models.question import Question, QuestionType
from app.models.user import Role, User
from app.repositories.attempt_answer_repository import attempt_answer_repository
from app.repositories.attempt_repository import attempt_repository
from app.repositories.course_repository import course_repository
from app.repositories.enrollment_repository import enrollment_repository
from app.repositories.exam_repository import exam_repository
from app.repositories.question_repository import question_repository
from app.schemas.attempts import AttemptSubmitIn
from app.services.course_service import CourseNotFound


class AttemptError(Exception):
    def __init__(self, message: str):
        self.message = message


class AttemptNotFound(AttemptError):
    pass


class AttemptForbidden(AttemptError):
    pass


async def _course_for_exam(db: AsyncSession, exam: Exam) -> Course:
    course = await course_repository.get_by_id(db, str(exam.course_id))
    if course is None:
        raise CourseNotFound("Course not found.")
    return course


async def _exam_and_course(db: AsyncSession, exam_id: str) -> tuple[Exam, Course]:
    exam = await exam_repository.get_by_id(db, exam_id)
    if exam is None:
        raise AttemptNotFound("Exam not found.")
    return exam, await _course_for_exam(db, exam)


async def _require_student_taker(db: AsyncSession, actor: User, course: Course) -> None:
    """Only enrolled students may take exams.

    Intentional exception to the never-`role` rule, authorized by
    ADR-0007: writers (teachers/admins) use /preview (Seam 4) and get 403
    here even when they own the course, so preview answer keys never leak
    into the gradebook. Membership still decides among students: only an
    approved enrollment passes. Disabled/unverified accounts are refused
    even with an old approval, matching the join gate.
    """
    if not actor.is_active:
        raise AttemptForbidden("Account disabled.")
    if actor.role != Role.student:
        raise AttemptForbidden("Only enrolled students may take exams.")
    if not actor.is_verified:
        raise AttemptForbidden("Please verify your email before taking exams.")
    row = await enrollment_repository.get_by_course_user(db, course.id, actor.id)
    if row is None or row.status != EnrollmentStatus.approved:
        raise AttemptForbidden("Not enrolled in this course.")


def _require_owner(attempt: Attempt, actor: User) -> None:
    if attempt.student_id != actor.id:
        raise AttemptForbidden("Not authorized.")


def _check_open_for_start(exam: Exam, now: datetime) -> None:
    if exam.open_at is not None and now < exam.open_at:
        raise AttemptError("Exam has not opened yet.")
    if exam.close_at is not None and now >= exam.close_at:
        raise AttemptError("Exam window is closed.")


def _is_expired(exam: Exam, attempt: Attempt, now: datetime) -> bool:
    late_by_timer = attempt.expires_at is not None and now > attempt.expires_at
    late_by_window = exam.close_at is not None and now >= exam.close_at
    return bool(late_by_timer or late_by_window)


@dataclass
class _GradingBatch:
    """Questions plus the submitted payload per question; travels as one unit
    through _finalize/_build_rows/_auto_finalize_expired."""

    questions: list[Question] = field(default_factory=list)
    by_question: dict[str, dict] = field(default_factory=dict)  # type: ignore[type-arg]


def _build_rows(attempt_id: object, batch: _GradingBatch) -> tuple[list[AttemptAnswer], int]:
    """Grade every exam question (unanswered = 0) and sum the auto-score."""
    rows: list[AttemptAnswer] = []
    total = 0
    for q in batch.questions:
        payload = batch.by_question.get(str(q.id), {})
        awarded, correct, needs = _grade_one(q, payload)
        total += awarded
        rows.append(
            AttemptAnswer(
                attempt_id=attempt_id,  # type: ignore[arg-type]
                question_id=q.id,
                selected_index=payload.get("selected_index"),
                selected_bool=payload.get("selected_bool"),
                text_answer=payload.get("text_answer"),
                awarded_score=awarded,
                is_correct=correct,
                needs_grading=needs,
            )
        )
    return rows, total


async def _finalize(
    db: AsyncSession,
    attempt: Attempt,
    exam: Exam,
    batch: _GradingBatch,
    now: datetime,
) -> list[AttemptAnswer]:
    """Mark an in_progress attempt submitted: grade, stamp, publish per mode."""
    rows, total = _build_rows(attempt.id, batch)
    attempt.submitted_at = now
    attempt.status = AttemptStatus.submitted
    attempt.score = total
    attempt.is_late = _is_expired(exam, attempt, now)
    attempt.is_published = exam.show_result == ShowResultMode.immediate
    await attempt_answer_repository.save_all(db, rows)
    await db.flush()
    await db.refresh(attempt)
    return rows


async def _auto_finalize_expired(
    db: AsyncSession,
    exam: Exam,
    questions: list[Question],
    student_id: uuid.UUID,
    now: datetime,
) -> None:
    """Close out timed-out in_progress rows so the one-active-attempt guard
    never deadlocks a student who never pressed submit. Empty answers: the
    attempt keeps whatever was never sent (all zeros here). Counts toward
    attempts_limit like any submitted attempt."""
    batch = _GradingBatch(questions=questions)
    for stale in await attempt_repository.list_in_progress(db, exam.id, student_id):
        if _is_expired(exam, stale, now):
            await _finalize(db, stale, exam, batch, now)


async def start_attempt(
    db: AsyncSession, actor: User, exam_id: str
) -> tuple[Attempt, list[Question], list[AttemptAnswer]]:
    exam, course = await _exam_and_course(db, exam_id)
    await _require_student_taker(db, actor, course)
    now = datetime.now(UTC)
    _check_open_for_start(exam, now)

    questions = await question_repository.list_for_exam(db, exam.id)
    await _auto_finalize_expired(db, exam, questions, actor.id, now)

    existing = await attempt_repository.count_for_exam_student(db, exam.id, actor.id)
    if existing >= exam.attempts_limit:
        raise AttemptError("Attempts limit reached.")
    if await attempt_repository.has_in_progress(db, exam.id, actor.id):
        raise AttemptError("An attempt is already in progress.")

    max_score = sum(q.max_score for q in questions)
    expires_at = now + timedelta(minutes=exam.duration_minutes) if exam.duration_minutes else None
    attempt = Attempt(
        exam_id=exam.id,
        course_id=course.id,
        student_id=actor.id,
        status=AttemptStatus.in_progress,
        started_at=now,
        expires_at=expires_at,
        max_score=max_score,
        is_published=False,
        is_late=False,
    )
    try:
        attempt = await attempt_repository.save(db, attempt)
    except IntegrityError:
        raise AttemptError("An attempt is already in progress.") from None
    return attempt, questions, []


def _grade_mcq(question: Question, payload: dict) -> tuple[int, bool | None, bool]:  # type: ignore[type-arg]
    sel = payload.get("selected_index")
    if sel is None:
        return 0, False, False
    ok = sel == question.correct_index
    return (question.max_score if ok else 0), ok, False


def _grade_tf(question: Question, payload: dict) -> tuple[int, bool | None, bool]:  # type: ignore[type-arg]
    sel = payload.get("selected_bool")
    if sel is None:
        return 0, False, False
    ok = sel == question.correct_answer
    return (question.max_score if ok else 0), ok, False


def _grade_essay(question: Question, payload: dict) -> tuple[int, bool | None, bool]:  # type: ignore[type-arg]
    # Essay: always pending for manual grading (ticket 09). Payload unused.
    _ = (question, payload)
    return 0, None, True


_GRADERS = {
    QuestionType.mcq.value: _grade_mcq,
    QuestionType.tf.value: _grade_tf,
    QuestionType.essay.value: _grade_essay,
}


def _grade_one(question: Question, payload: dict) -> tuple[int, bool | None, bool]:  # type: ignore[type-arg]
    """Return (awarded_score, is_correct, needs_grading). Missing answers score 0."""
    return _GRADERS[str(question.type.value)](question, payload)


async def submit_attempt(
    db: AsyncSession, actor: User, attempt_id: str, data: AttemptSubmitIn
) -> tuple[Attempt, Exam, list[Question], list[AttemptAnswer]]:
    attempt = await attempt_repository.get_by_id(db, attempt_id)
    if attempt is None:
        raise AttemptNotFound("Attempt not found.")
    _require_owner(attempt, actor)
    exam = await exam_repository.get_by_id(db, str(attempt.exam_id))
    if exam is None:
        raise AttemptNotFound("Exam not found.")
    course = await _course_for_exam(db, exam)
    # Re-check trust at submit time: a student blocked/disabled after
    # starting loses the right to submit (ban keeps its scope, CONTEXT.md).
    await _require_student_taker(db, actor, course)
    if attempt.status != AttemptStatus.in_progress:
        raise AttemptError("Attempt already submitted.")

    questions = await question_repository.list_for_exam(db, exam.id)
    by_id = {str(q.id): q for q in questions}

    seen: set[str] = set()
    payload_by_q: dict[str, dict] = {}
    for ans in data.answers:
        key = str(ans.question_id)
        if key in seen:
            raise AttemptError("Duplicate answer for question.")
        if key not in by_id:
            raise AttemptError("Unknown question.")
        seen.add(key)
        payload_by_q[key] = {
            "selected_index": ans.selected_index,
            "selected_bool": ans.selected_bool,
            "text_answer": ans.text_answer.strip() if ans.text_answer else None,
        }

    batch = _GradingBatch(questions=questions, by_question=payload_by_q)
    rows = await _finalize(db, attempt, exam, batch, datetime.now(UTC))
    return attempt, exam, questions, rows


def show_grades_for(exam: Exam, attempt: Attempt) -> bool:
    """Grades show iff the attempt is submitted AND visible under the exam's
    CURRENT mode: immediate always reveals; after_publish needs the teacher
    publish flag (ticket 09 flips it). Switching an exam to after_publish
    unpublishes prior attempts (see exam_service.update_exam), so a stale
    immediate-era flag can never leak after the teacher hides results.
    """
    if attempt.status != AttemptStatus.submitted:
        return False
    if exam.show_result == ShowResultMode.immediate:
        return True
    return attempt.is_published


async def get_attempt(
    db: AsyncSession, actor: User, attempt_id: str
) -> tuple[Attempt, Exam, list[Question], list[AttemptAnswer]]:
    attempt = await attempt_repository.get_by_id(db, attempt_id)
    if attempt is None:
        raise AttemptNotFound("Attempt not found.")
    _require_owner(attempt, actor)
    exam = await exam_repository.get_by_id(db, str(attempt.exam_id))
    if exam is None:
        raise AttemptNotFound("Exam not found.")
    course = await _course_for_exam(db, exam)
    await _require_student_taker(db, actor, course)
    questions = await question_repository.list_for_exam(db, exam.id)
    answers = await attempt_answer_repository.list_for_attempt(db, attempt.id)
    return attempt, exam, questions, answers


async def list_my_attempts(
    db: AsyncSession, actor: User, exam_id: str
) -> tuple[Exam, list[Question], list[tuple[Attempt, list[AttemptAnswer]]]]:
    """Own attempts with full receipt detail (questions shared separately)."""
    exam, course = await _exam_and_course(db, exam_id)
    await _require_student_taker(db, actor, course)
    rows = await attempt_repository.list_for_exam_student(db, exam.id, actor.id)
    out: list[tuple[Attempt, list[AttemptAnswer]]] = []
    for attempt in rows:
        answers = await attempt_answer_repository.list_for_attempt(db, attempt.id)
        out.append((attempt, answers))
    questions = await question_repository.list_for_exam(db, exam.id)
    return exam, questions, out
