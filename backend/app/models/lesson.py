import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, Uuid
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class LessonMediaType(enum.StrEnum):
    """Generic media kind (ADR-0001). V1 accepts audio only; the column stays
    generic so video needs no migration in V2."""

    audio = "audio"


class LessonStatus(enum.StrEnum):
    """Processing state. CRUD keeps lessons pending; ticket 05 (storage)
    owns the pending -> processing -> ready transitions."""

    pending = "pending"
    processing = "processing"
    ready = "ready"


class Lesson(Base):
    """Lesson = one recording session درس. Belongs to exactly one course."""

    __tablename__ = "lessons"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    course_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("courses.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    lesson_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    pages_from: Mapped[int | None] = mapped_column(nullable=True)
    pages_to: Mapped[int | None] = mapped_column(nullable=True)
    audio_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    media_type: Mapped[LessonMediaType] = mapped_column(
        SQLEnum(LessonMediaType, name="lesson_media_type", native_enum=True, validate_strings=True),
        default=LessonMediaType.audio,
        server_default="audio",
    )
    transcript_voice: Mapped[str] = mapped_column(Text, default="", server_default="")
    transcript_book: Mapped[str] = mapped_column(Text, default="", server_default="")
    status: Mapped[LessonStatus] = mapped_column(
        SQLEnum(LessonStatus, name="lesson_status", native_enum=True, validate_strings=True),
        default=LessonStatus.pending,
        server_default="pending",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    __table_args__ = (
        # pages range is the structure (no chapters): from <= to when both set.
        CheckConstraint(
            "pages_from IS NULL OR pages_to IS NULL OR pages_from <= pages_to",
            name="ck_lessons_pages_range",
        ),
    )
