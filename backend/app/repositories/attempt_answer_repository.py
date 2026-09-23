import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attempt import AttemptAnswer


class AttemptAnswerRepository:
    async def list_for_attempt(
        self, db: AsyncSession, attempt_id: uuid.UUID
    ) -> list[AttemptAnswer]:
        result = await db.execute(
            select(AttemptAnswer).where(AttemptAnswer.attempt_id == attempt_id)
        )
        return list(result.scalars().all())

    async def save_all(self, db: AsyncSession, rows: list[AttemptAnswer]) -> list[AttemptAnswer]:
        for row in rows:
            db.add(row)
        await db.flush()
        for row in rows:
            await db.refresh(row)
        return rows


attempt_answer_repository = AttemptAnswerRepository()
