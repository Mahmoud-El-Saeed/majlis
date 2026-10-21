from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import enum_str

ShowResultIn = Literal["immediate", "after_publish"]
QuestionTypeIn = Literal["mcq", "tf", "essay"]


class ExamCreateIn(BaseModel):
    """Config knobs validate shape here; cross-field rules live in the service
    so failures return 400 with English backend messages."""

    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    lesson_id: UUID | None = None
    attempts_limit: int = Field(default=1, ge=1)
    duration_minutes: int | None = Field(default=None, gt=0)
    open_at: datetime | None = None
    close_at: datetime | None = None
    pass_score: int = Field(default=50, ge=0, le=100)
    show_result: ShowResultIn = "immediate"


class ExamUpdateIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    clear_description: bool = False
    lesson_id: UUID | None = None
    clear_lesson: bool = False
    attempts_limit: int | None = Field(default=None, ge=1)
    duration_minutes: int | None = Field(default=None, gt=0)
    clear_duration_minutes: bool = False
    open_at: datetime | None = None
    clear_open_at: bool = False
    close_at: datetime | None = None
    clear_close_at: bool = False
    pass_score: int | None = Field(default=None, ge=0, le=100)
    show_result: ShowResultIn | None = None


class QuestionCreateIn(BaseModel):
    """Permissive shape; type-specific rules (2+ options/1 correct, TF answer,
    essay max_score) are enforced in the service for 400 responses."""

    type: QuestionTypeIn
    prompt: str = Field(min_length=1)
    options: list[str] | None = None
    # Upper bound intentionally open: the service validates index < len(options).
    correct_index: int | None = Field(default=None, ge=0)
    correct_answer: bool | None = None
    max_score: int | None = Field(default=None, gt=0)
    position: int = Field(default=0, ge=0)


class QuestionUpdateIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    type: QuestionTypeIn | None = None
    prompt: str | None = Field(default=None, min_length=1)
    options: list[str] | None = None
    clear_options: bool = False
    # Upper bound intentionally open: the service validates index < len(options).
    correct_index: int | None = Field(default=None, ge=0)
    clear_correct_index: bool = False
    correct_answer: bool | None = None
    clear_correct_answer: bool = False
    max_score: int | None = Field(default=None, gt=0)
    position: int | None = Field(default=None, ge=0)


class QuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    exam_id: str
    type: str
    prompt: str
    options: list[str] | None = None
    correct_index: int | None = None
    correct_answer: bool | None = None
    max_score: int
    position: int
    created_at: datetime


class ExamOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    course_id: str
    lesson_id: str | None = None
    title: str
    description: str | None = None
    attempts_limit: int
    duration_minutes: int | None = None
    open_at: datetime | None = None
    close_at: datetime | None = None
    pass_score: int
    show_result: str
    created_by: str | None = None
    created_at: datetime


class ExamDetailOut(ExamOut):
    questions: list[QuestionOut] = []


class StudentExamOut(ExamOut):
    """Student-safe projection: exam config plus personal progress.

    Never carries questions or correct_* keys (no-leak guarantee).
    window_status is display-only; enforcement stays server-side at start/submit.
    last_score is the latest submitted score, or null when there is none or
    the exam hides results until publish (after_publish + unpublished).
    """

    attempts_used: int
    attempts_left: int
    window_status: Literal["open", "upcoming", "closed"]
    has_in_progress: bool
    last_score: int | None = None


class StudentExamDetailOut(StudentExamOut):
    """Single student-safe exam read (ticket 20).

    StudentExamOut plus the question COUNT only — the questions themselves
    (prompt/options) and every answer key stay out of the payload.
    """

    questions_count: int


def to_exam_out(exam) -> ExamOut:  # type: ignore[no-untyped-def]
    return ExamOut(
        id=str(exam.id),
        course_id=str(exam.course_id),
        lesson_id=str(exam.lesson_id) if exam.lesson_id else None,
        title=exam.title,
        description=exam.description,
        attempts_limit=exam.attempts_limit,
        duration_minutes=exam.duration_minutes,
        open_at=exam.open_at,
        close_at=exam.close_at,
        pass_score=exam.pass_score,
        show_result=enum_str(exam.show_result),
        created_by=str(exam.created_by) if exam.created_by else None,
        created_at=exam.created_at,
    )


def to_question_out(question) -> QuestionOut:  # type: ignore[no-untyped-def]
    options = list(question.options) if question.options is not None else None
    return QuestionOut(
        id=str(question.id),
        exam_id=str(question.exam_id),
        type=enum_str(question.type),
        prompt=question.prompt,
        options=options,
        correct_index=question.correct_index,
        correct_answer=question.correct_answer,
        max_score=question.max_score,
        position=question.position,
        created_at=question.created_at,
    )


def to_exam_detail_out(exam, questions: list) -> ExamDetailOut:  # type: ignore[no-untyped-def]
    base = to_exam_out(exam)
    return ExamDetailOut(
        **base.model_dump(),
        questions=[to_question_out(q) for q in questions],
    )


def _ensure_aware(moment):  # type: ignore[no-untyped-def]
    """Treat naive datetimes as UTC so display math never mixes tz-aware/naive."""
    if moment is None:
        return None
    if moment.tzinfo is None:
        from datetime import UTC

        return moment.replace(tzinfo=UTC)
    return moment


def _window_status(open_at, close_at, now) -> Literal["open", "upcoming", "closed"]:  # type: ignore[no-untyped-def]
    """Display-only window state. Enforcement lives in attempt_service."""
    opens_at, closes_at = _ensure_aware(open_at), _ensure_aware(close_at)
    if opens_at is not None and now < opens_at:
        return "upcoming"
    if closes_at is not None and now >= closes_at:
        return "closed"
    return "open"


def to_student_exam_out(  # type: ignore[no-untyped-def]
    exam, *, attempts_used: int, has_in_progress: bool, last_score: int | None, now
) -> StudentExamOut:
    base = to_exam_out(exam)
    left = max(exam.attempts_limit - attempts_used, 0)
    return StudentExamOut(
        **base.model_dump(),
        attempts_used=attempts_used,
        last_score=last_score,
        attempts_left=left,
        window_status=_window_status(exam.open_at, exam.close_at, now),
        has_in_progress=has_in_progress,
    )


def to_student_exam_detail_out(  # type: ignore[no-untyped-def]
    exam,
    *,
    questions_count: int,
    attempts_used: int,
    has_in_progress: bool,
    last_score: int | None,
    now,
) -> StudentExamDetailOut:
    base = to_student_exam_out(
        exam,
        attempts_used=attempts_used,
        has_in_progress=has_in_progress,
        last_score=last_score,
        now=now,
    )
    return StudentExamDetailOut(**base.model_dump(), questions_count=questions_count)
