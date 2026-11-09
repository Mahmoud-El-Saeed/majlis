from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

InviteStatus = Literal["active", "used", "revoked", "expired"]


class InviteCreateIn(BaseModel):
    email: EmailStr


class InviteAcceptIn(BaseModel):
    token: str = Field(min_length=1, max_length=256)
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=200)


class InviteOut(BaseModel):
    id: str
    email: str
    message: str


class InviteListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    status: InviteStatus
    expires_at: datetime
    used_at: datetime | None = None
    revoked_at: datetime | None = None
    created_at: datetime


class InviteListOut(BaseModel):
    invites: list[InviteListItem]


class InviteLookupOut(BaseModel):
    email: str
    status: InviteStatus


class InviteRevokeOut(BaseModel):
    id: str
    email: str
    revoked_at: datetime
