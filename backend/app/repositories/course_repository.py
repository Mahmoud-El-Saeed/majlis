import uuid

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
        result = await db.execute(select(Course).order_by(Course.created_at.desc()))
        return list(result.scalars().all())

    async def save(self, db: AsyncSession, course: Course) -> Course:
        db.add(course)
        await db.flush()
        await db.refresh(course)
        return course

    async def delete(self, db: AsyncSession, course: Course) -> None:
        await db.delete(course)
        await db.flush()


course_repository = CourseRepository()
