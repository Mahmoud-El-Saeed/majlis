import uuid
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course


class CourseRepository:
    async def get_by_id(self, db: AsyncSession, course_id: str) -> Course | None:
        try:
            cid = uuid.UUID(str(course_id))
        except ValueError:
            return None
        result = await db.execute(select(Course).where(Course.id == cid))
        return result.scalars().first()

    async def list_all(self, db: AsyncSession) -> list[Course]:
        result = await db.execute(select(Course).order_by(Course.created_at.asc()))
        return list(result.scalars().all())

    async def list_by_ids(self, db: AsyncSession, course_ids: list[uuid.UUID]) -> list[Course]:
        """Batched fetch for dashboard pending rows (one query, not N)."""
        if not course_ids:
            return []
        result = await db.execute(select(Course).where(Course.id.in_(course_ids)))
        return list(result.scalars().all())

    async def titles_for(
        self, db: AsyncSession, course_ids: Iterable[uuid.UUID]
    ) -> dict[uuid.UUID, str]:
        """Batched id → title map for enrollment reads (ticket 22): every
        enrollment read names its course without one query per row."""
        ids = set(course_ids)
        if not ids:
            return {}
        result = await db.execute(select(Course.id, Course.title).where(Course.id.in_(ids)))
        return {course_id: title for course_id, title in result.all()}

    async def save(self, db: AsyncSession, course: Course) -> Course:
        db.add(course)
        await db.flush()
        await db.refresh(course)
        return course

    async def delete(self, db: AsyncSession, course: Course) -> None:
        await db.delete(course)
        await db.flush()


course_repository = CourseRepository()
