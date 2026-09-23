import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attempt import Attempt, AttemptStatus


class AttemptRepository:
    async def get_by_id(self, db: AsyncSession, attempt_id: str) -> Attempt | None:
        try:
            aid = uuid.UUID(str(attempt_id))
        except ValueError:
            return None
        result = await db.execute(select(Attempt).where(Attempt.id == aid))
        return result.scalars().first()

    def _exam_student(
        self, exam_id: uuid.UUID, student_id: uuid.UUID, only_in_progress: bool = False
    ):  # type: ignore[no-untyped-def]
        """Shared (exam, student) filter so the four queries below cannot drift."""
        conds = [Attempt.exam_id == exam_id, Attempt.student_id == student_id]
        if only_in_progress:
            conds.append(Attempt.status == AttemptStatus.in_progress)
        return conds

    async def list_for_exam_student(
        self, db: AsyncSession, exam_id: uuid.UUID, student_id: uuid.UUID
    ) -> list[Attempt]:
        result = await db.execute(
            select(Attempt)
            .where(*self._exam_student(exam_id, student_id))
            .order_by(Attempt.created_at.asc())
        )
        return list(result.scalars().all())

    async def count_for_exam_student(
        self, db: AsyncSession, exam_id: uuid.UUID, student_id: uuid.UUID
    ) -> int:
        result = await db.execute(
            select(func.count())
            .select_from(Attempt)
            .where(*self._exam_student(exam_id, student_id))
        )
        return int(result.scalar_one())

    async def has_in_progress(
        self, db: AsyncSession, exam_id: uuid.UUID, student_id: uuid.UUID
    ) -> bool:
        result = await db.execute(
            select(func.count())
            .select_from(Attempt)
            .where(*self._exam_student(exam_id, student_id, only_in_progress=True))
        )
        return int(result.scalar_one()) > 0

    async def list_in_progress(
        self, db: AsyncSession, exam_id: uuid.UUID, student_id: uuid.UUID
    ) -> list[Attempt]:
        result = await db.execute(
            select(Attempt).where(*self._exam_student(exam_id, student_id, only_in_progress=True))
        )
        return list(result.scalars().all())

    async def unpublish_for_exam(self, db: AsyncSession, exam_id: uuid.UUID) -> None:
        """Clear the teacher-publish flag on an exam's attempts.

        Used when an exam flips immediate → after_publish: previously visible
        scores must hide until the teacher publishes (ticket 09 owns the
        publish mutation; this is the reverse transition).
        """
        from sqlalchemy import update

        await db.execute(
            update(Attempt)
            .where(Attempt.exam_id == exam_id, Attempt.is_published.is_(True))
            .values(is_published=False)
        )
        await db.flush()

    async def save(self, db: AsyncSession, attempt: Attempt) -> Attempt:
        db.add(attempt)
        await db.flush()
        await db.refresh(attempt)
        return attempt


attempt_repository = AttemptRepository()
