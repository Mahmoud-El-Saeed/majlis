from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


class UserRepository:
    async def get_by_email(self, db: AsyncSession, email: str) -> User | None:
        result = await db.execute(select(User).where(User.email == email.lower()))
        return result.scalars().first()

    async def get_by_id(self, db: AsyncSession, user_id: str) -> User | None:
        import uuid

        try:
            uid = uuid.UUID(str(user_id))
        except ValueError:
            return None
        result = await db.execute(select(User).where(User.id == uid))
        return result.scalars().first()

    async def create(self, db: AsyncSession, user: User) -> User:
        db.add(user)
        await db.flush()
        await db.refresh(user)
        return user


user_repository = UserRepository()
