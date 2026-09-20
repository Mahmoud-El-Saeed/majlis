import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Course(Base):
    """Course = one book شرح كتاب. Top-level container students join.

    organization_id is reserved for future multi-org (nullable, no FK in V1).
    created_by is the owner-teacher (or the creating admin). Writes are
    admin-any or owner-teacher-only; reads are permissive until ticket 04
    adds the approved-enrollment gate.
    """

    __tablename__ = "courses"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    book_title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    organization_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
