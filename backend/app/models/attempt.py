import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AttemptStatus(enum.StrEnum):
    """Taking lifecycle (Seam 5). Grading/publish transitions live in 08/09."""

    in_progress = "in_progress"
    submitted = "submitted"


class Attempt(Base):
    """One student sitting for an exam. Only Seam 5 writes grades."""

    __tablename__ = "attempts"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    exam_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("exams.id", ondelete="CASCADE"), index=True
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("courses.id", ondelete="CASCADE"), index=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[AttemptStatus] = mapped_column(
        SQLEnum(AttemptStatus, name="attempt_status", native_enum=True, validate_strings=True),
        default=AttemptStatus.in_progress,
        server_default="in_progress",
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_score: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    is_late: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    __table_args__ = (
        CheckConstraint("max_score >= 0", name="ck_attempts_max_score"),
        CheckConstraint("score IS NULL OR score >= 0", name="ck_attempts_score"),
        Index(
            "uq_attempts_one_in_progress",
            "exam_id",
            "student_id",
            unique=True,
            postgresql_where=(status == AttemptStatus.in_progress),
        ),
    )


class AttemptAnswer(Base):
    """Per-question grade inside one attempt. Essay rows stay pending for 09."""

    __tablename__ = "attempt_answers"
    __table_args__ = (
        UniqueConstraint("attempt_id", "question_id", name="uq_attempt_answers_attempt_question"),
        CheckConstraint(
            "selected_index IS NULL OR (selected_index >= 0 AND selected_index <= 3)",
            name="ck_attempt_answers_selected_index",
        ),
        CheckConstraint("awarded_score >= 0", name="ck_attempt_answers_awarded"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    attempt_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("attempts.id", ondelete="CASCADE"), index=True
    )
    question_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("questions.id", ondelete="CASCADE"), index=True
    )
    selected_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    selected_bool: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    text_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    awarded_score: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    needs_grading: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    feedback: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # teacher-written (ticket 09 grading); None until graded
