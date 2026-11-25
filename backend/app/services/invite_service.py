import asyncio
import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core import mail
from app.core.config import get_settings
from app.core.security import get_password_hash
from app.models.teacher_invite import TeacherInvite
from app.models.user import Role, User
from app.repositories.invite_repository import invite_repository
from app.repositories.user_repository import user_repository
from app.schemas.invites import InviteStatus


class InviteError(Exception):
    """Invite rejected: invalid/used/expired/revoked link or duplicate teacher."""

    def __init__(self, message: str):
        self.message = message


class InviteTransportError(InviteError):
    """The invite email could not be sent; nothing was persisted (safe to retry)."""


class InviteNotFound(InviteError):
    """The referenced invite (or invite link) does not exist."""


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode()).hexdigest()


def _invite_link(raw_token: str) -> str:
    return f"{get_settings().FRONTEND_URL}/invite?token={raw_token}"


def _is_teacher_like(user: User | None) -> bool:
    return user is not None and user.role in (Role.admin, Role.teacher)


async def create_invite(db: AsyncSession, admin: User, email: str) -> tuple[TeacherInvite, str]:
    """Admin invites an email to become a teacher. Revokes older active invites."""
    normalized = email.lower()
    if _is_teacher_like(await user_repository.get_by_email(db, normalized)):
        raise InviteError("Teacher account already exists.")
    # Flush first to mint the id, send the email, and only then let the
    # request commit — same atomic-mail pattern as signup: a mail failure
    # rolls everything back and the admin can simply retry.
    await invite_repository.revoke_active_for_email(db, normalized)
    raw_token = secrets.token_urlsafe(32)
    invite = TeacherInvite(
        email=normalized,
        token_hash=hash_token(raw_token),
        expires_at=datetime.now(UTC) + timedelta(hours=get_settings().INVITE_TOKEN_EXPIRE_HOURS),
        created_by=admin.id,
    )
    db.add(invite)
    await db.flush()
    body = (
        "السلام عليكم ورحمة الله وبركاته،\n"
        f"تمت دعوتك كمعلم. فعّل حسابك عبر هذا الرابط:\n\n\n{_invite_link(raw_token)}\n"
    )
    try:
        await asyncio.to_thread(mail.send_email, normalized, "دعوة معلم إلى مجلس", body)
    except Exception as exc:
        mail.log_failure("teacher invite", exc)
        raise InviteTransportError("Failed to send invite email.") from None
    await db.refresh(invite)
    return invite, raw_token


async def accept_invite(db: AsyncSession, token: str, password: str, full_name: str | None) -> User:
    """Consume an invite: create (or promote) the teacher and set their password."""
    invite = await invite_repository.get_by_token_hash(db, hash_token(token.strip()))
    if invite is None:
        raise InviteError("Invalid invite link.")
    if invite.used_at is not None:
        raise InviteError("Invite link already used.")
    if invite.revoked_at is not None:
        raise InviteError("Invite link revoked.")
    if invite.expires_at <= datetime.now(UTC):
        raise InviteError("Invite link expired.")

    user = await user_repository.get_by_email(db, invite.email)
    if _is_teacher_like(user):
        raise InviteError("Teacher account already exists.")
    if user is not None and not user.is_active:
        raise InviteError("Account disabled.")

    if user is None:
        user = User(
            email=invite.email,
            hashed_password=get_password_hash(password),
            full_name=full_name,
            role=Role.teacher,
            is_verified=True,
        )
        db.add(user)
    else:
        # Existing student studies on: promotion keeps the account, upgrades
        # the capability level, and activates with the chosen password.
        user.role = Role.teacher
        user.hashed_password = get_password_hash(password)
        if full_name is not None:
            user.full_name = full_name
        user.is_verified = True
    invite.used_at = datetime.now(UTC)
    await db.flush()
    return user


def invite_status(invite: TeacherInvite) -> InviteStatus:
    """Display state for an invite, in the same precedence accept enforces."""
    if invite.used_at is not None:
        return "used"
    if invite.revoked_at is not None:
        return "revoked"
    if invite.expires_at <= datetime.now(UTC):
        return "expired"
    return "active"


async def lookup_invite(db: AsyncSession, token: str) -> TeacherInvite:
    """Resolve an invite link for the acceptance page (email + status only)."""
    invite = await invite_repository.get_by_token_hash(db, hash_token(token.strip()))
    if invite is None:
        raise InviteNotFound("Invalid invite link.")
    return invite


async def revoke_invite(db: AsyncSession, invite_id: str) -> TeacherInvite:
    """Admin-revoke an unused invite. Already-revoked is a no-op so a retry
    after a lost response does not fail; used/expired rows stay rejected."""
    invite = await invite_repository.get_by_id(db, invite_id)
    if invite is None:
        raise InviteNotFound("Invite not found.")
    if invite.used_at is not None:
        raise InviteError("Invite link already used.")
    if invite.revoked_at is not None:
        return invite
    if invite.expires_at <= datetime.now(UTC):
        raise InviteError("Invite link expired.")
    invite.revoked_at = datetime.now(UTC)
    await db.flush()
    await db.refresh(invite)
    return invite


async def list_invites(db: AsyncSession) -> list[TeacherInvite]:
    """All invites, newest first — traceable history including used/revoked."""
    return await invite_repository.list_all(db)
