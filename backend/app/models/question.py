import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, CheckConstraint, DateTime, ForeignKey, Integer, Text, Uuid
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class QuestionType(enum.StrEnum):
    """Fixed vocabulary (native PG enum, never plain strings)."""

    mcq = "mcq"
    tf = "tf"
    essay = "essay"


class Question(Base):
    """One question in an exam's bank. Ticket 07 authoring only."""

    __tablename__ = "questions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    exam_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("exams.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[QuestionType] = mapped_column(
        SQLEnum(QuestionType, name="question_type", native_enum=True, validate_strings=True),
    )
    prompt: Mapped[str] = mapped_column(Text)
    options: Mapped[list | None] = mapped_column(JSON, nullable=True)
    correct_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    correct_answer: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    max_score: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    position: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    __table_args__ = (
        CheckConstraint("max_score > 0", name="ck_questions_max_score"),
        CheckConstraint("position >= 0", name="ck_questions_position"),
        # MCQ options are 2+: index must sit inside the options array.
        CheckConstraint(
            "correct_index IS NULL OR (json_typeof(options) = 'array'"
            " AND correct_index >= 0 AND correct_index < json_array_length(options))",
            name="ck_questions_correct_index",
        ),
    )
