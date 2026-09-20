import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enrollment import Enrollment, EnrollmentStatus


class EnrollmentRepository:
    async def get_by_id(self, db: AsyncSession, enrollment_id: str) -> Enrollment | None:
        try:
            eid = uuid.UUID(str(enrollment_id))
        except ValueError:
            return None
        result = await db.execute(select(Enrollment).where(Enrollment.id == eid))
        return result.scalars().first()

    async def get_by_course_user(
        self, db: AsyncSession, course_id: uuid.UUID, user_id: uuid.UUID
    ) -> Enrollment | None:
        result = await db.execute(
            select(Enrollment).where(
                Enrollment.course_id == course_id, Enrollment.user_id == user_id
            )
        )
        return result.scalars().first()

    async def list_for_course(
        self,
        db: AsyncSession,
        course_id: uuid.UUID,
        status: EnrollmentStatus | None = None,
    ) -> list[Enrollment]:
        q = select(Enrollment).where(Enrollment.course_id == course_id)
        if status is not None:
            q = q.where(Enrollment.status == status)
        result = await db.execute(q.order_by(Enrollment.created_at.asc()))
        return list(result.scalars().all())

    async def approved_course_ids(self, db: AsyncSession, user_id: uuid.UUID) -> list[uuid.UUID]:
        result = await db.execute(
            select(Enrollment.course_id).where(
                Enrollment.user_id == user_id,
                Enrollment.status == EnrollmentStatus.approved,
            )
        )
        return list(result.scalars().all())

    async def list_for_user(self, db: AsyncSession, user_id: uuid.UUID) -> list[Enrollment]:
        result = await db.execute(
            select(Enrollment)
            .where(Enrollment.user_id == user_id)
            .order_by(Enrollment.created_at.asc())
        )
        return list(result.scalars().all())

    async def save(self, db: AsyncSession, enrollment: Enrollment) -> Enrollment:
        db.add(enrollment)
        await db.flush()
        await db.refresh(enrollment)
        return enrollment


enrollment_repository = EnrollmentRepository()
