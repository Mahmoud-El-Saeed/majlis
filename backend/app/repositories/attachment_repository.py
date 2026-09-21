import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lesson_attachment import LessonAttachment


class AttachmentRepository:
    async def get_by_id(self, db: AsyncSession, attachment_id: str) -> LessonAttachment | None:
        try:
            aid = uuid.UUID(str(attachment_id))
        except ValueError:
            return None
        result = await db.execute(select(LessonAttachment).where(LessonAttachment.id == aid))
        return result.scalars().first()

    async def list_for_lesson(
        self, db: AsyncSession, lesson_id: uuid.UUID
    ) -> list[LessonAttachment]:
        result = await db.execute(
            select(LessonAttachment)
            .where(LessonAttachment.lesson_id == lesson_id)
            .order_by(LessonAttachment.created_at.asc())
        )
        return list(result.scalars().all())

    async def counts_for_lessons(
        self, db: AsyncSession, lesson_ids: list[uuid.UUID], *, ready_only: bool = False
    ) -> dict[str, int]:
        """Batched attachment counts per lesson in one GROUP BY query."""
        if not lesson_ids:
            return {}
        query = (
            select(LessonAttachment.lesson_id, func.count())
            .where(LessonAttachment.lesson_id.in_(lesson_ids))
            .group_by(LessonAttachment.lesson_id)
        )
        if ready_only:
            query = query.where(LessonAttachment.file_key.is_not(None))
        rows = (await db.execute(query)).all()
        counts = {str(lid): int(n) for lid, n in rows}
        return {str(lid): counts.get(str(lid), 0) for lid in lesson_ids}

    async def save(self, db: AsyncSession, row: LessonAttachment) -> LessonAttachment:
        db.add(row)
        await db.flush()
        await db.refresh(row)
        return row

    async def delete(self, db: AsyncSession, row: LessonAttachment) -> None:
        await db.delete(row)
        await db.flush()


attachment_repository = AttachmentRepository()
