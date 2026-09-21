import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lesson import Lesson, LessonStatus


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

    async def counts_for_courses(
        self, db: AsyncSession, course_ids: list[uuid.UUID]
    ) -> dict[str, dict[str, int]]:
        """Batched lesson totals per course: {course_id: {total, ready}}.
        One query per measure instead of N per dashboard row."""
        if not course_ids:
            return {}
        total_rows = (
            await db.execute(
                select(Lesson.course_id, func.count())
                .where(Lesson.course_id.in_(course_ids))
                .group_by(Lesson.course_id)
            )
        ).all()
        ready_rows = (
            await db.execute(
                select(Lesson.course_id, func.count())
                .where(Lesson.course_id.in_(course_ids), Lesson.status == LessonStatus.ready)
                .group_by(Lesson.course_id)
            )
        ).all()
        totals = {str(cid): int(n) for cid, n in total_rows}
        readies = {str(cid): int(n) for cid, n in ready_rows}
        return {
            str(cid): {"total": totals.get(str(cid), 0), "ready": readies.get(str(cid), 0)}
            for cid in course_ids
        }

    async def delete(self, db: AsyncSession, lesson: Lesson) -> None:
        await db.delete(lesson)
        await db.flush()


lesson_repository = LessonRepository()
