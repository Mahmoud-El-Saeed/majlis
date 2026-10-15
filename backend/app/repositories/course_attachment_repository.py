import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course_attachment import CourseAttachment


class CourseAttachmentRepository:
    async def get_by_id(
        self, db: AsyncSession, attachment_id: str
    ) -> CourseAttachment | None:
        try:
            aid = uuid.UUID(str(attachment_id))
        except ValueError:
            return None
        result = await db.execute(select(CourseAttachment).where(CourseAttachment.id == aid))
        return result.scalars().first()

    async def list_for_course(
        self, db: AsyncSession, course_id: uuid.UUID
    ) -> list[CourseAttachment]:
        result = await db.execute(
            select(CourseAttachment)
            .where(CourseAttachment.course_id == course_id)
            .order_by(CourseAttachment.created_at.asc())
        )
        return list(result.scalars().all())

    async def unset_main_books(self, db: AsyncSession, course_id: uuid.UUID) -> None:
        await db.execute(
            update(CourseAttachment)
            .where(
                CourseAttachment.course_id == course_id,
                CourseAttachment.is_main_book.is_(True),
            )
            .values(is_main_book=False)
        )

    async def save(self, db: AsyncSession, row: CourseAttachment) -> CourseAttachment:
        db.add(row)
        await db.flush()
        await db.refresh(row)
        return row

    async def delete(self, db: AsyncSession, row: CourseAttachment) -> None:
        await db.delete(row)
        await db.flush()


course_attachment_repository = CourseAttachmentRepository()
