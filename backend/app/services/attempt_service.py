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
from app.schemas.attempts import AttemptAnswersIn
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


def is_expired(exam: Exam, attempt: Attempt, now: datetime) -> bool:
    late_by_timer = attempt.expires_at is not None and now > attempt.expires_at
    late_by_window = exam.close_at is not None and now >= exam.close_at
    return bool(late_by_timer or late_by_window)


@dataclass(frozen=True)
class AnswerSelection:
    """One question's answer as the student sent it (draft or submit)."""

    selected_index: int | None = None
    selected_bool: bool | None = None
    text_answer: str | None = None


@dataclass
class _GradingBatch:
    """Questions plus the submitted selections; travels as one unit
    through _finalize/_grade_rows."""

    questions: list[Question] = field(default_factory=list)
    by_question: dict[str, AnswerSelection] = field(default_factory=dict)


def _selections_by_question(
    questions: list[Question], data: AttemptAnswersIn
) -> dict[str, AnswerSelection]:
    """Map question id -> selection, rejecting illegal answer sets.

    Shared by the draft (autosave) and the graded (submit) paths so the two
    cannot drift: an unknown question id and a duplicated question id are both
    rejected before anything is written.

    A selection index is NOT range-checked against the question's options: the
    upper bound is intentionally open (MCQ questions carry 2+ options), and an
    out-of-range selection simply scores incorrect in the service. Rejecting it
    would also strand a student whose teacher shortened a question while the
    attempt was open.
    """
    by_id = {str(q.id) for q in questions}
    seen: set[str] = set()
    selections: dict[str, AnswerSelection] = {}
    for ans in data.answers:
        key = str(ans.question_id)
        if key in seen:
            raise AttemptError("Duplicate answer for question.")
        if key not in by_id:
            raise AttemptError("Unknown question.")
        seen.add(key)
        selections[key] = AnswerSelection(
            selected_index=ans.selected_index,
            selected_bool=ans.selected_bool,
            text_answer=ans.text_answer.strip() if ans.text_answer else None,
        )
    return selections


async def _upsert_answer_rows(
    db: AsyncSession,
    attempt: Attempt,
    questions: list[Question],
    selections: dict[str, AnswerSelection],
) -> list[AttemptAnswer]:
    """One answer row per question, insert-or-update.

    A row that already exists for (attempt, question) is updated in place —
    drafts and the later submit share the same row, so the unique constraint
    uq_attempt_answers_attempt_question can never be violated. A missing row
    is created.
    """
    existing = await attempt_answer_repository.list_for_attempt_questions(
        db, attempt.id, [q.id for q in questions]
    )
    rows: list[AttemptAnswer] = []
    for q in questions:
        selection = selections.get(str(q.id)) or AnswerSelection()
        row = existing.get(q.id)
        if row is None:
            row = AttemptAnswer(attempt_id=attempt.id, question_id=q.id)
        row.selected_index = selection.selected_index
        row.selected_bool = selection.selected_bool
        row.text_answer = selection.text_answer
        rows.append(row)
    return rows


async def _save_draft_rows(
    db: AsyncSession,
    attempt: Attempt,
    questions: list[Question],
    selections: dict[str, AnswerSelection],
) -> list[AttemptAnswer]:
    """Draft path: a row per ANSWERED question, carrying the selection only.

    A draft never carries a verdict — no score, no correctness, no pending
    grade flag. Grading happens once, at submit.
    """
    answered = [q for q in questions if str(q.id) in selections]
    rows = await _upsert_answer_rows(db, attempt, answered, selections)
    for row in rows:
        row.awarded_score = 0
        row.is_correct = None
        row.needs_grading = False
    await attempt_answer_repository.save_all(db, rows)
    return rows


async def _grade_rows(
    db: AsyncSession,
    attempt: Attempt,
    questions: list[Question],
    selections: dict[str, AnswerSelection],
) -> tuple[list[AttemptAnswer], int]:
    """Graded path: a row per exam question (unanswered = 0) and the total.

    The attempt total is the sum of the auto-graded scores; essay rows stay
    pending for manual grading (ticket 09).
    """
    rows = await _upsert_answer_rows(db, attempt, questions, selections)
    total = 0
    for q, row in zip(questions, rows, strict=True):
        awarded, correct, needs = _grade_one(q, selections.get(str(q.id)))
        total += awarded
        row.awarded_score = awarded
        row.is_correct = correct
        row.needs_grading = needs
    await attempt_answer_repository.save_all(db, rows)
    return rows, total


async def _finalize(
    db: AsyncSession,
    attempt: Attempt,
    exam: Exam,
    batch: _GradingBatch,
    now: datetime,
) -> list[AttemptAnswer]:
    """Mark an in_progress attempt submitted: grade, stamp, publish per mode."""
    rows, total = await _grade_rows(db, attempt, batch.questions, batch.by_question)
    attempt.submitted_at = now
    attempt.status = AttemptStatus.submitted
    attempt.score = total
    attempt.is_late = is_expired(exam, attempt, now)
    attempt.is_published = exam.show_result == ShowResultMode.immediate
    await db.flush()
    await db.refresh(attempt)
    return rows


async def _finalize_expired(
    db: AsyncSession, attempt: Attempt, exam: Exam, now: datetime
) -> None:
    """Close a timed-out attempt at 0 without erasing the saved selection.

    Nothing was submitted, so every verdict is 0/ungraded; the draft the
    student had written stays on the rows, so the receipt still shows what
    they had chosen. Only submit grades.
    """
    for row in await attempt_answer_repository.list_for_attempt(db, attempt.id):
        row.awarded_score = 0
        row.is_correct = None
        row.needs_grading = False
    attempt.submitted_at = now
    attempt.status = AttemptStatus.submitted
    attempt.score = 0
    attempt.is_late = True
    attempt.is_published = exam.show_result == ShowResultMode.immediate
    await db.flush()
    await db.refresh(attempt)


async def finalize_expired_attempts(
    db: AsyncSession, exam: Exam, student_id: uuid.UUID, now: datetime
) -> None:
    """Close out timed-out in_progress rows.

    Needed so the one-active-attempt guard never deadlocks a student who never
    pressed submit, and so the gradebook sees the attempt. Safe to call from a
    read: it only ever closes attempts the clock already closed.
    """
    stale_rows = await attempt_repository.list_in_progress(
        db, exam.id, student_id, for_update=True
    )
    for stale in stale_rows:
        if is_expired(exam, stale, now):
            await _finalize_expired(db, stale, exam, now)


async def start_attempt(
    db: AsyncSession, actor: User, exam_id: str
) -> tuple[Attempt, list[Question], list[AttemptAnswer]]:
    exam, course = await _exam_and_course(db, exam_id)
    await _require_student_taker(db, actor, course)
    now = datetime.now(UTC)
    _check_open_for_start(exam, now)

    questions = await question_repository.list_for_exam(db, exam.id)
    await finalize_expired_attempts(db, exam, actor.id, now)

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


def _grade_mcq(
    question: Question, selection: AnswerSelection | None
) -> tuple[int, bool | None, bool]:
    sel = selection.selected_index if selection is not None else None
    if sel is None:
        return 0, False, False
    ok = sel == question.correct_index
    return (question.max_score if ok else 0), ok, False


def _grade_tf(
    question: Question, selection: AnswerSelection | None
) -> tuple[int, bool | None, bool]:
    sel = selection.selected_bool if selection is not None else None
    if sel is None:
        return 0, False, False
    ok = sel == question.correct_answer
    return (question.max_score if ok else 0), ok, False


def _grade_essay(
    question: Question, selection: AnswerSelection | None
) -> tuple[int, bool | None, bool]:
    # Essay: always pending for manual grading (ticket 09). Selection unused.
    _ = (question, selection)
    return 0, None, True


_GRADERS = {
    QuestionType.mcq.value: _grade_mcq,
    QuestionType.tf.value: _grade_tf,
    QuestionType.essay.value: _grade_essay,
}


def _grade_one(
    question: Question, selection: AnswerSelection | None
) -> tuple[int, bool | None, bool]:
    """Return (awarded_score, is_correct, needs_grading). Missing answers score 0."""
    return _GRADERS[str(question.type.value)](question, selection)


async def save_answers(
    db: AsyncSession, actor: User, attempt_id: str, data: AttemptAnswersIn
) -> tuple[Attempt, list[Question], list[AttemptAnswer]]:
    """Autosave the current selection of an in-progress attempt (ticket 20).

    Same ownership and trust checks as submit: only the taker may write, and
    a student blocked/disabled after starting loses the right to save (the
    ban keeps its scope). The draft is stored without a verdict — grading
    happens once, at submit.

    The attempt row is locked (FOR UPDATE) for the same reason submit locks
    it: without it an autosave that started before a submit could commit
    after it and overwrite the graded rows with a draft.
    """
    attempt = await attempt_repository.get_by_id(db, attempt_id, for_update=True)
    if attempt is None:
        raise AttemptNotFound("Attempt not found.")
    _require_owner(attempt, actor)
    exam = await exam_repository.get_by_id(db, str(attempt.exam_id))
    if exam is None:
        raise AttemptNotFound("Exam not found.")
    course = await _course_for_exam(db, exam)
    # Re-check trust at save time: a student blocked/disabled after
    # starting loses the right to write (ban keeps its scope, CONTEXT.md).
    await _require_student_taker(db, actor, course)
    if attempt.status != AttemptStatus.in_progress:
        raise AttemptError("Attempt already submitted.")

    questions = await question_repository.list_for_exam(db, exam.id)
    selections = _selections_by_question(questions, data)
    rows = await _save_draft_rows(db, attempt, questions, selections)
    return attempt, questions, rows


async def submit_attempt(
    db: AsyncSession, actor: User, attempt_id: str, data: AttemptAnswersIn
) -> tuple[Attempt, Exam, list[Question], list[AttemptAnswer]]:
    """Grade the attempt and close it.

    The payload is authoritative: every exam question gets exactly one answer
    row (upsert — a draft saved earlier is updated in place, never
    duplicated), and the stored selection is the submitted one. A question
    the payload leaves out is stored unanswered and scores 0, exactly as
    before drafts existed.

    The attempt row is locked (FOR UPDATE) so a draft save, a second submit or
    a concurrent expiry cannot interleave with this grading write.
    """
    attempt = await attempt_repository.get_by_id(db, attempt_id, for_update=True)
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
    selections = _selections_by_question(questions, data)

    batch = _GradingBatch(questions=questions, by_question=selections)
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
) -> tuple[Attempt, Exam, list[Question], list[AttemptAnswer], bool]:
    """Attempt read for review and grading. Owners read their own attempts;
    course writers (owner-teacher/admin) read any attempt of their course so
    essays can be graded (ticket 16) — through the same student-safe question
    shape, so this stays consistent with ADR-0007 (no answer keys leak).
    Everyone else stays gated out. Returns (attempt, exam, questions,
    answers, is_writer)."""
    from app.services.course_service import can_write

    attempt = await attempt_repository.get_by_id(db, attempt_id)
    if attempt is None:
        raise AttemptNotFound("Attempt not found.")
    exam = await exam_repository.get_by_id(db, str(attempt.exam_id))
    if exam is None:
        raise AttemptNotFound("Exam not found.")
    course = await _course_for_exam(db, exam)
    is_writer = can_write(actor, course)
    if attempt.student_id != actor.id:
        if not is_writer:
            raise AttemptForbidden("Not authorized.")
    else:
        await _require_student_taker(db, actor, course)
    questions = await question_repository.list_for_exam(db, exam.id)
    answers = await attempt_answer_repository.list_for_attempt(db, attempt.id)
    return attempt, exam, questions, answers, is_writer


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
