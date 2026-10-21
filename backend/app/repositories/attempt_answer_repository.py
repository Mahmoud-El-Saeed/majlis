import uuid

from sqlalchemy import inspect, select
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

    async def list_for_attempt_questions(
        self, db: AsyncSession, attempt_id: uuid.UUID, question_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, AttemptAnswer]:
        """Existing answer rows of one attempt, keyed by question id.

        The lookup half of the upsert: a row that already exists for
        (attempt, question) is updated in place instead of inserted, so the
        unique constraint uq_attempt_answers_attempt_question holds even when
        a draft was saved before the submit.
        """
        if not question_ids:
            return {}
        result = await db.execute(
            select(AttemptAnswer).where(
                AttemptAnswer.attempt_id == attempt_id,
                AttemptAnswer.question_id.in_(question_ids),
            )
        )
        return {row.question_id: row for row in result.scalars().all()}

    async def save_all(self, db: AsyncSession, rows: list[AttemptAnswer]) -> list[AttemptAnswer]:
        """Insert-or-update. Transient rows are added, persistent rows are
        updated in place (the upsert path)."""
        for row in rows:
            if inspect(row).transient:
                db.add(row)
        await db.flush()
        for row in rows:
            await db.refresh(row)
        return rows


attempt_answer_repository = AttemptAnswerRepository()
