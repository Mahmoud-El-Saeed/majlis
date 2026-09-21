import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enrollment_code import EnrollmentCode


class EnrollmentCodeRepository:
    async def get_by_hash(self, db: AsyncSession, code_hash: str) -> EnrollmentCode | None:
        result = await db.execute(
            select(EnrollmentCode).where(EnrollmentCode.code_hash == code_hash)
        )
        return result.scalars().first()

    async def get_by_hash_for_update(
        self, db: AsyncSession, code_hash: str
    ) -> EnrollmentCode | None:
        """Row-locked read for the join path so concurrent consumes cannot
        overshoot max_uses (SELECT ... FOR UPDATE inside the request txn)."""
        result = await db.execute(
            select(EnrollmentCode).where(EnrollmentCode.code_hash == code_hash).with_for_update()
        )
        return result.scalars().first()

    async def get_by_id(self, db: AsyncSession, code_id: str) -> EnrollmentCode | None:
        try:
            cid = uuid.UUID(str(code_id))
        except ValueError:
            return None
        result = await db.execute(select(EnrollmentCode).where(EnrollmentCode.id == cid))
        return result.scalars().first()

    async def count_active_for_course(self, db: AsyncSession, course_id: uuid.UUID) -> int:
        """Usable codes only: unrevoked, unexpired, with uses left. Exhausted
        codes free their slot under the per-course cap."""
        now = datetime.now(UTC)
        result = await db.execute(
            select(EnrollmentCode).where(
                EnrollmentCode.course_id == course_id,
                EnrollmentCode.revoked_at.is_(None),
                EnrollmentCode.expires_at > now,
                EnrollmentCode.uses_count < EnrollmentCode.max_uses,
            )
        )
        return len(result.scalars().all())

    async def list_for_course(self, db: AsyncSession, course_id: uuid.UUID) -> list[EnrollmentCode]:
        result = await db.execute(
            select(EnrollmentCode)
            .where(EnrollmentCode.course_id == course_id)
            .order_by(EnrollmentCode.created_at.desc())
        )
        return list(result.scalars().all())


code_repository = EnrollmentCodeRepository()
