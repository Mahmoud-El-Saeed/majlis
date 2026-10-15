import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CourseAttachment(Base):
    """PDF file attached to a whole course (ticket 16).

    Same direct-to-R2 pattern as lesson attachments (ADR-0004): the API
    only issues presigned URLs and verifies existence + size at confirm.
    ``file_key`` stays NULL until the browser PUT is confirmed. At most one
    row per course carries ``is_main_book`` (enforced in the service: setting
    a new main silently unsets the old).
    """

    __tablename__ = "course_attachments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    course_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("courses.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_type: Mapped[str] = mapped_column(String(127), default="application/pdf")
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_main_book: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
