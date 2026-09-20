import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CodeUse(Base):
    """Immutable audit row: who consumed which code, when, under which name.

    Re-applying with a new code appends a row instead of overwriting
    `enrollment.code_id`, so the who-used history of every code survives.
    """

    __tablename__ = "enrollment_code_uses"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    code_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("enrollment_codes.id", ondelete="CASCADE"), index=True
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("courses.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    enrollment_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("enrollments.id", ondelete="CASCADE")
    )
    display_name: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
