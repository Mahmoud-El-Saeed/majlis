from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Query, status

from app.api.dependencies import AdminDep, DbDep
from app.schemas.invites import (
    InviteAcceptIn,
    InviteCreateIn,
    InviteListItem,
    InviteListOut,
    InviteLookupOut,
    InviteOut,
    InviteRevokeOut,
)
from app.services import invite_service
from app.services.invite_service import InviteError, InviteNotFound, InviteTransportError

router = APIRouter(prefix="/invites", tags=["invites"])


@router.post("", status_code=status.HTTP_201_CREATED, response_model=InviteOut)
async def create_invite(db: DbDep, admin: AdminDep, data: InviteCreateIn) -> InviteOut:
    try:
        invite, _ = await invite_service.create_invite(db, admin, str(data.email))
    except InviteTransportError as e:
        raise HTTPException(status_code=502, detail=e.message) from None
    except InviteError as e:
        raise HTTPException(status_code=400, detail=e.message) from None
    return InviteOut(id=str(invite.id), email=invite.email, message="Invite sent.")


@router.post("/accept", status_code=status.HTTP_201_CREATED, response_model=InviteOut)
async def accept_invite(db: DbDep, data: InviteAcceptIn) -> InviteOut:
    try:
        user = await invite_service.accept_invite(db, data.token, data.password, data.full_name)
    except InviteError as e:
        raise HTTPException(status_code=400, detail=e.message) from None
    return InviteOut(
        id=str(user.id), email=user.email, message="Account activated. You can now log in."
    )


@router.get("/lookup", response_model=InviteLookupOut)
async def lookup_invite(
    db: DbDep,
    token: Annotated[str, Query(min_length=1, max_length=256)],
) -> InviteLookupOut:
    try:
        invite = await invite_service.lookup_invite(db, token)
    except InviteNotFound as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=e.message) from None
    return InviteLookupOut(email=invite.email, status=invite_service.invite_status(invite))


@router.post("/{invite_id}/revoke", response_model=InviteRevokeOut)
async def revoke_invite(
    db: DbDep,
    admin: AdminDep,
    invite_id: Annotated[str, Path()],
) -> InviteRevokeOut:
    try:
        invite = await invite_service.revoke_invite(db, invite_id)
    except InviteNotFound as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=e.message) from None
    except InviteError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message) from None
    assert invite.revoked_at is not None
    return InviteRevokeOut(id=str(invite.id), email=invite.email, revoked_at=invite.revoked_at)


@router.get("", response_model=InviteListOut)
async def list_invites(db: DbDep, _admin: AdminDep) -> InviteListOut:
    invites = await invite_service.list_invites(db)
    return InviteListOut(
        invites=[
            InviteListItem(
                id=str(i.id),
                email=i.email,
                status=invite_service.invite_status(i),
                expires_at=i.expires_at,
                used_at=i.used_at,
                revoked_at=i.revoked_at,
                created_at=i.created_at,
            )
            for i in invites
        ]
    )
