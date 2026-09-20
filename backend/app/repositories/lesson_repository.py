import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lesson import Lesson


class LessonRepository:
    async def get_by_id(self, db: AsyncSession, lesson_id: str) -> Lesson | None:
        try:
            lid = uuid.UUID(str(lesson_id))
        except ValueError:
            return None
        result = await db.execute(select(Lesson).where(Lesson.id == lid))
        return result.scalars().first()

    async def list_for_course(self, db: AsyncSession, course_id: uuid.UUID) -> list[Lesson]:
        result = await db.execute(
            select(Lesson).where(Lesson.course_id == course_id).order_by(Lesson.created_at.desc())
        )
        return list(result.scalars().all())

    async def save(self, db: AsyncSession, lesson: Lesson) -> Lesson:
        db.add(lesson)
        await db.flush()
        await db.refresh(lesson)
        return lesson

    async def delete(self, db: AsyncSession, lesson: Lesson) -> None:
        await db.delete(lesson)
        await db.flush()


lesson_repository = LessonRepository()
