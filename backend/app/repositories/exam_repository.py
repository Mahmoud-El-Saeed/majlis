import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exam import Exam


class ExamRepository:
    async def get_by_id(self, db: AsyncSession, exam_id: str) -> Exam | None:
        try:
            eid = uuid.UUID(str(exam_id))
        except ValueError:
            return None
        result = await db.execute(select(Exam).where(Exam.id == eid))
        return result.scalars().first()

    async def list_for_course(self, db: AsyncSession, course_id: uuid.UUID) -> list[Exam]:
        result = await db.execute(
            select(Exam).where(Exam.course_id == course_id).order_by(Exam.created_at.desc())
        )
        return list(result.scalars().all())

    async def save(self, db: AsyncSession, exam: Exam) -> Exam:
        db.add(exam)
        await db.flush()
        await db.refresh(exam)
        return exam

    async def delete(self, db: AsyncSession, exam: Exam) -> None:
        await db.delete(exam)
        await db.flush()


exam_repository = ExamRepository()
