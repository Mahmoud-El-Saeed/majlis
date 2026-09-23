import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.question import Question


class QuestionRepository:
    async def get_by_id(self, db: AsyncSession, question_id: str) -> Question | None:
        try:
            qid = uuid.UUID(str(question_id))
        except ValueError:
            return None
        result = await db.execute(select(Question).where(Question.id == qid))
        return result.scalars().first()

    async def list_for_exam(self, db: AsyncSession, exam_id: uuid.UUID) -> list[Question]:
        result = await db.execute(
            select(Question)
            .where(Question.exam_id == exam_id)
            .order_by(Question.position.asc(), Question.created_at.asc())
        )
        return list(result.scalars().all())

    async def save(self, db: AsyncSession, question: Question) -> Question:
        db.add(question)
        await db.flush()
        await db.refresh(question)
        return question

    async def delete(self, db: AsyncSession, question: Question) -> None:
        await db.delete(question)
        await db.flush()


question_repository = QuestionRepository()
