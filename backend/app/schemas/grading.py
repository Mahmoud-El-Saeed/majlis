from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class GradeEssayIn(BaseModel):
    """Manual essay grade with score + feedback (ticket 09).

    Max-score bound needs the question row, so the range check lives in the
    service (400) — here only non-negative shape. Feedback is required and
    non-empty here; blank/whitespace-only is rejected in the service (400).
    """

    model_config = ConfigDict(extra="ignore")

    awarded_score: int = Field(ge=0)
    feedback: str = Field(min_length=1)


class GradeAnswerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    attempt_id: str
    question_id: str
    awarded_score: int
    needs_grading: bool
    feedback: str | None = None
    attempt_score: int
    attempt_max_score: int


class PublishAttemptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    attempt_id: str
    exam_id: str
    is_published: bool


class PublishExamOut(BaseModel):
    exam_id: str
    published: int


class GradebookAnswerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    question_id: str
    question_type: str
    question_prompt: str
    question_max: int
    awarded_score: int
    needs_grading: bool
    feedback: str | None = None


class GradebookRowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    attempt_id: str
    exam_id: str
    exam_title: str
    student_id: str
    student_email: str
    status: str
    score: int | None = None
    max_score: int
    is_published: bool
    is_late: bool
    submitted_at: datetime | None = None
    answers: list[GradebookAnswerOut] = []
