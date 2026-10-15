from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import enum_str


class AttemptAnswerIn(BaseModel):
    """One answer row. Type-specific presence is validated in the service."""

    model_config = ConfigDict(extra="ignore")

    question_id: UUID
    # Upper bound intentionally open (MCQ options are 2+): an out-of-range
    # selection simply scores incorrect in the service.
    selected_index: int | None = Field(default=None, ge=0)
    selected_bool: bool | None = None
    text_answer: str | None = None


class AttemptSubmitIn(BaseModel):
    answers: list[AttemptAnswerIn] = Field(default_factory=list)


class AttemptQuestionOut(BaseModel):
    """Student-safe question: never carries correct_index/correct_answer."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    type: str
    prompt: str
    options: list[str] | None = None
    max_score: int
    position: int


class AttemptAnswerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    question_id: str
    selected_index: int | None = None
    selected_bool: bool | None = None
    text_answer: str | None = None
    awarded_score: int | None = None
    is_correct: bool | None = None
    needs_grading: bool
    feedback: str | None = None


class AttemptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    exam_id: str
    course_id: str
    student_id: str
    status: str
    started_at: datetime
    expires_at: datetime | None = None
    submitted_at: datetime | None = None
    score: int | None = None
    max_score: int
    is_published: bool
    is_late: bool
    questions: list[AttemptQuestionOut] = []
    answers: list[AttemptAnswerOut] = []


def to_question_safe(question) -> AttemptQuestionOut:  # type: ignore[no-untyped-def]
    return AttemptQuestionOut(
        id=str(question.id),
        type=enum_str(question.type),
        prompt=question.prompt,
        options=list(question.options) if question.options is not None else None,
        max_score=question.max_score,
        position=question.position,
    )


def to_answer_out(row, *, show_grades: bool) -> AttemptAnswerOut:  # type: ignore[no-untyped-def]
    """Grades + teacher feedback show only when visible; the receipt echoes
    the submitted answers with needs_grading so students know essays pend."""
    return AttemptAnswerOut(
        question_id=str(row.question_id),
        selected_index=row.selected_index,
        selected_bool=row.selected_bool,
        text_answer=row.text_answer,
        awarded_score=row.awarded_score if show_grades else None,
        is_correct=row.is_correct if show_grades else None,
        needs_grading=row.needs_grading,
        feedback=row.feedback if show_grades else None,
    )


def to_attempt_out(  # type: ignore[no-untyped-def]
    attempt,
    questions: list,
    answers: list,
    *,
    show_grades: bool,
) -> AttemptOut:
    return AttemptOut(
        id=str(attempt.id),
        exam_id=str(attempt.exam_id),
        course_id=str(attempt.course_id),
        student_id=str(attempt.student_id),
        status=enum_str(attempt.status),
        started_at=attempt.started_at,
        expires_at=attempt.expires_at,
        submitted_at=attempt.submitted_at,
        score=attempt.score if show_grades else None,
        max_score=attempt.max_score,
        is_published=attempt.is_published,
        is_late=attempt.is_late,
        questions=[to_question_safe(q) for q in questions],
        answers=[to_answer_out(a, show_grades=show_grades) for a in answers],
    )
