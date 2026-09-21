import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class LessonAttachment(Base):
    """PDF handout attached to one lesson (ticket 06 extension).

    Teacher names it (title) + optional description; the file itself lives
    in R2 under ``courses/{course}/lessons/{lesson}/attachments/{id}.pdf``.
    ``file_key`` stays NULL until the browser PUT is confirmed, so students
    never see an unready file. Same direct-to-R2 pattern as lesson audio
    (ADR-0004): the API only issues presigned URLs and verifies existence.
    """

    __tablename__ = "lesson_attachments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    lesson_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("lessons.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_type: Mapped[str] = mapped_column(String(127), default="application/pdf")
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
