import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ShowResultMode(enum.StrEnum):
    """Result visibility (Seam 4 authoring, Seam 5 enforces at taking time)."""

    immediate = "immediate"
    after_publish = "after_publish"


class Exam(Base):
    """Exam = teacher-authored assessment for a course, optionally one lesson.

    Null lesson_id = general/book-wide. Ticket 07 is authoring only;
    taking/grading/publish gates live in tickets 08/09.
    """

    __tablename__ = "exams"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    course_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("courses.id", ondelete="CASCADE"), index=True
    )
    lesson_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("lessons.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    attempts_limit: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    open_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    close_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    pass_score: Mapped[int] = mapped_column(Integer, default=50, server_default="50")
    show_result: Mapped[ShowResultMode] = mapped_column(
        SQLEnum(ShowResultMode, name="exam_show_result", native_enum=True, validate_strings=True),
        default=ShowResultMode.immediate,
        server_default="immediate",
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    __table_args__ = (
        CheckConstraint("attempts_limit >= 1", name="ck_exams_attempts_limit"),
        CheckConstraint(
            "duration_minutes IS NULL OR duration_minutes > 0",
            name="ck_exams_duration",
        ),
        CheckConstraint(
            "pass_score >= 0 AND pass_score <= 100",
            name="ck_exams_pass_score",
        ),
        CheckConstraint(
            "open_at IS NULL OR close_at IS NULL OR open_at < close_at",
            name="ck_exams_window",
        ),
    )
