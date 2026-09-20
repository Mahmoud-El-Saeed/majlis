import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, Uuid
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class EnrollmentStatus(enum.StrEnum):
    """Per-course trust state.

    rejected = soft refusal, may re-apply with a (new) code.
    blocked = per-course ban, cannot rejoin that course.
    """

    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    blocked = "blocked"


class Enrollment(Base):
    """One row per (course, user): status transitions happen in place so a
    per-course block survives promotion and re-applies."""

    __tablename__ = "enrollments"
    __table_args__ = (UniqueConstraint("course_id", "user_id", name="uq_enrollments_course_user"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    course_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("courses.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    code_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("enrollment_codes.id"), nullable=True
    )
    status: Mapped[EnrollmentStatus] = mapped_column(
        SQLEnum(
            EnrollmentStatus, name="enrollment_status", native_enum=True, validate_strings=True
        ),
        default=EnrollmentStatus.pending,
        server_default="pending",
    )
    display_name: Mapped[str] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id"), nullable=True
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
