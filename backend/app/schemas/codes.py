from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CodeCreateIn(BaseModel):
    """Teacher knobs from spec story 8 (expiry/usage limit); length stays at
    the 8-char default."""

    max_uses: int | None = Field(default=None, ge=1, le=1000)
    expires_days: int | None = Field(default=None, ge=0, le=365)


class CodeOut(BaseModel):
    """Create response: the only place the raw code appears."""

    id: str
    code: str
    code_prefix: str
    max_uses: int
    uses_count: int
    expires_at: datetime
    created_at: datetime


class CodeListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    code_prefix: str
    max_uses: int
    uses_count: int
    expires_at: datetime
    revoked_at: datetime | None = None
    created_by: str | None = None
    created_at: datetime


class CodeListOut(BaseModel):
    codes: list[CodeListItem]


class CodeUseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    display_name: str
    used_at: datetime


class CodeUsesOut(BaseModel):
    uses: list[CodeUseOut]


def to_code_use_out(row) -> CodeUseOut:  # type: ignore[no-untyped-def]
    return CodeUseOut(
        id=str(row.id),
        user_id=str(row.user_id),
        display_name=row.display_name,
        used_at=row.created_at,
    )


def to_code_out(row, raw: str) -> CodeOut:
    return CodeOut(
        id=str(row.id),
        code=raw,
        code_prefix=row.code_prefix,
        max_uses=row.max_uses,
        uses_count=row.uses_count,
        expires_at=row.expires_at,
        created_at=row.created_at,
    )


def to_code_list_item(row) -> CodeListItem:
    return CodeListItem(
        id=str(row.id),
        code_prefix=row.code_prefix,
        max_uses=row.max_uses,
        uses_count=row.uses_count,
        expires_at=row.expires_at,
        revoked_at=row.revoked_at,
        created_by=str(row.created_by) if row.created_by else None,
        created_at=row.created_at,
    )
