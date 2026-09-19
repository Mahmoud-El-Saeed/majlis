from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.teacher_invite import TeacherInvite


class InviteRepository:
    async def get_by_token_hash(self, db: AsyncSession, token_hash: str) -> TeacherInvite | None:
        result = await db.execute(
            select(TeacherInvite).where(TeacherInvite.token_hash == token_hash)
        )
        return result.scalars().first()

    async def list_all(self, db: AsyncSession) -> list[TeacherInvite]:
        result = await db.execute(select(TeacherInvite).order_by(TeacherInvite.created_at.desc()))
        return list(result.scalars().all())

    async def revoke_active_for_email(self, db: AsyncSession, email: str) -> None:
        """Revoke-and-reissue: flag unconsumed invites so only the newest link
        works, while revoked/expired history stays auditable."""
        result = await db.execute(
            select(TeacherInvite).where(
                TeacherInvite.email == email.lower(),
                TeacherInvite.used_at.is_(None),
                TeacherInvite.revoked_at.is_(None),
            )
        )
        for invite in result.scalars().all():
            invite.revoked_at = datetime.now(UTC)
        await db.flush()


invite_repository = InviteRepository()
