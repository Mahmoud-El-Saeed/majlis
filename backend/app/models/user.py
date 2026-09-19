import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, String, Text, Uuid
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Role(enum.StrEnum):
    """Capability level, not an exclusive partition.

    A teacher can still enroll as a learner in another teacher's course;
    enrollment checks membership, never `role == "student"`. Admin passes
    every role gate.
    """

    admin = "admin"
    teacher = "teacher"
    student = "student"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(Text)
    full_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    role: Mapped[Role] = mapped_column(
        SQLEnum(Role, name="user_role", native_enum=True, validate_strings=True),
        default=Role.student,
        server_default="student",
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
