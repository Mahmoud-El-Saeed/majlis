import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.code_use import CodeUse


class CodeUseRepository:
    async def log(self, db: AsyncSession, use: CodeUse) -> CodeUse:
        db.add(use)
        await db.flush()
        await db.refresh(use)
        return use

    async def list_for_code(self, db: AsyncSession, code_id: uuid.UUID) -> list[CodeUse]:
        result = await db.execute(
            select(CodeUse).where(CodeUse.code_id == code_id).order_by(CodeUse.created_at.asc())
        )
        return list(result.scalars().all())


code_use_repository = CodeUseRepository()
