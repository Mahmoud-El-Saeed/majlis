import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.code_use import CodeUse
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.enrollment_code import EnrollmentCode
from app.models.user import User
from app.repositories.code_repository import code_repository
from app.repositories.code_use_repository import code_use_repository
from app.repositories.course_repository import course_repository
from app.repositories.enrollment_repository import enrollment_repository
from app.schemas.codes import CodeCreateIn
from app.schemas.enrollments import JoinIn
from app.services.course_service import CourseNotFound, can_write

# No ambiguous 0/O/1/l/I characters so codes read clearly in Arabic UI.
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


class EnrollmentError(Exception):
    def __init__(self, message: str):
        self.message = message


class CodeNotFound(EnrollmentError):
    pass


class CodeForbidden(EnrollmentError):
    pass


class EnrollmentNotFound(EnrollmentError):
    pass


class EnrollmentForbidden(EnrollmentError):
    pass


def hash_code(raw: str) -> str:
    return hashlib.sha256(raw.strip().upper().encode()).hexdigest()


def _generate_raw(length: int) -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(length))


async def _course_or_404(db: AsyncSession, course_id: str):
    course = await course_repository.get_by_id(db, course_id)
    if course is None:
        raise CourseNotFound("Course not found.")
    return course


def _check_can_write(actor: User, course) -> None:
    if not can_write(actor, course):
        raise CodeForbidden("Not authorized.")


async def create_code(
    db: AsyncSession, actor: User, course_id: str, data: CodeCreateIn
) -> tuple[EnrollmentCode, str]:
    """Teacher generates a temporary per-course join code (raw returned once)."""
    course = await _course_or_404(db, course_id)
    _check_can_write(actor, course)
    settings = get_settings()
    active = await code_repository.count_active_for_course(db, course.id)
    if active >= settings.CODE_MAX_ACTIVE_PER_COURSE:
        raise EnrollmentError(
            f"Too many active codes for this course (max {settings.CODE_MAX_ACTIVE_PER_COURSE}). "
            "Revoke an old code first."
        )
    length = settings.CODE_DEFAULT_LENGTH
    max_uses = data.max_uses or settings.CODE_DEFAULT_MAX_USES
    days = data.expires_days if data.expires_days is not None else settings.CODE_DEFAULT_EXPIRE_DAYS
    # expires_days=0 means already expired (lets teachers invalidate a code
    # without revoking it).
    expires_at = datetime.now(UTC) + timedelta(days=days)

    raw = ""
    for _ in range(5):
        candidate = _generate_raw(length)
        if await code_repository.get_by_hash(db, hash_code(candidate)) is None:
            raw = candidate
            break
    if not raw:
        raise EnrollmentError("Could not generate a unique code. Try again.")
    code = EnrollmentCode(
        course_id=course.id,
        code_hash=hash_code(raw),
        code_prefix=raw[:4],
        created_by=actor.id,
        max_uses=max_uses,
        uses_count=0,
        expires_at=expires_at,
    )
    db.add(code)
    await db.flush()
    await db.refresh(code)
    return code, raw


async def list_codes(db: AsyncSession, actor: User, course_id: str) -> list[EnrollmentCode]:
    course = await _course_or_404(db, course_id)
    _check_can_write(actor, course)
    return await code_repository.list_for_course(db, course.id)


async def revoke_code(
    db: AsyncSession, actor: User, course_id: str, code_id: str
) -> EnrollmentCode:
    course = await _course_or_404(db, course_id)
    _check_can_write(actor, course)
    code = await code_repository.get_by_id(db, code_id)
    if code is None or code.course_id != course.id:
        raise CodeNotFound("Join code not found.")
    if code.revoked_at is None:
        code.revoked_at = datetime.now(UTC)
        await db.flush()
        await db.refresh(code)
    return code


async def join_with_code(db: AsyncSession, user: User, data: JoinIn) -> Enrollment:
    """Any verified user joins any course via code; always lands in pending."""
    if not user.is_verified:
        raise EnrollmentForbidden("Please verify your email before joining a course.")
    if not user.is_active:
        raise EnrollmentForbidden("Account disabled.")
    code = await code_repository.get_by_hash_for_update(db, hash_code(data.code))
    if code is None:
        raise EnrollmentError("Invalid join code.")
    if code.revoked_at is not None:
        raise EnrollmentError("Join code revoked.")
    if code.expires_at <= datetime.now(UTC):
        raise EnrollmentError("Join code expired.")
    if code.uses_count >= code.max_uses:
        raise EnrollmentError("Join code has no uses left.")

    existing = await enrollment_repository.get_by_course_user(db, code.course_id, user.id)
    display_name = data.display_name.strip()
    if existing is not None:
        if existing.status == EnrollmentStatus.blocked:
            raise EnrollmentForbidden("You are blocked from this course and cannot rejoin.")
        if existing.status == EnrollmentStatus.approved:
            raise EnrollmentError("Already enrolled in this course.")
        if existing.status == EnrollmentStatus.pending:
            raise EnrollmentError("Join request already pending review.")
        # Rejected: soft re-apply with the new code (unblock restores
        # pre-block access instead of bouncing through rejected).
        existing.status = EnrollmentStatus.pending
        existing.code_id = code.id
        existing.display_name = display_name
        existing.phone = data.phone.strip() if data.phone else None
        existing.note = data.note
        existing.decided_by = None
        existing.decided_at = None
        code.uses_count += 1
        await db.flush()
        await code_use_repository.log(
            db,
            CodeUse(
                code_id=code.id,
                course_id=code.course_id,
                user_id=user.id,
                enrollment_id=existing.id,
                display_name=display_name,
            ),
        )
        await db.refresh(existing)
        return existing

    enrollment = Enrollment(
        course_id=code.course_id,
        user_id=user.id,
        code_id=code.id,
        status=EnrollmentStatus.pending,
        display_name=display_name,
        phone=data.phone.strip() if data.phone else None,
        note=data.note,
    )
    code.uses_count += 1
    enrollment = await enrollment_repository.save(db, enrollment)
    await code_use_repository.log(
        db,
        CodeUse(
            code_id=code.id,
            course_id=code.course_id,
            user_id=user.id,
            enrollment_id=enrollment.id,
            display_name=display_name,
        ),
    )
    return enrollment


async def list_enrollments(
    db: AsyncSession,
    actor: User,
    course_id: str,
    status: EnrollmentStatus | None = None,
) -> list[Enrollment]:
    course = await _course_or_404(db, course_id)
    _check_can_write(actor, course)
    return await enrollment_repository.list_for_course(db, course.id, status)


async def get_my_enrollment(db: AsyncSession, user: User, course_id: str) -> Enrollment | None:
    course = await _course_or_404(db, course_id)
    return await enrollment_repository.get_by_course_user(db, course.id, user.id)


Decision = Literal["approve", "reject", "block", "unblock"]

# Single transition table for the approval seam (spec: pending →
# approved/rejected/blocked; rejected soft, blocked per-course ban).
# A str target means "rejected for this state" with the paired message.
# None (unblock from blocked only) means "restore status_before_block"
# so unblock returns instant pre-block access; legacy NULL → approved.
_DECISIONS: dict[Decision, dict[EnrollmentStatus, EnrollmentStatus | str | None]] = {
    "approve": {
        EnrollmentStatus.pending: EnrollmentStatus.approved,
        EnrollmentStatus.approved: EnrollmentStatus.approved,  # idempotent no-op
        EnrollmentStatus.rejected: "Rejected requests must re-apply with a new code.",
        EnrollmentStatus.blocked: "Unblock this student before approving.",
    },
    "reject": {
        EnrollmentStatus.pending: EnrollmentStatus.rejected,
        EnrollmentStatus.rejected: EnrollmentStatus.rejected,  # idempotent no-op
        EnrollmentStatus.approved: "Block enrolled students instead of rejecting.",
        EnrollmentStatus.blocked: "Unblock this student before rejecting.",
    },
    "block": {
        EnrollmentStatus.pending: EnrollmentStatus.blocked,
        EnrollmentStatus.approved: EnrollmentStatus.blocked,
        EnrollmentStatus.rejected: EnrollmentStatus.blocked,
        EnrollmentStatus.blocked: EnrollmentStatus.blocked,  # idempotent no-op
    },
    "unblock": {
        EnrollmentStatus.blocked: None,  # restore pre-block access
        EnrollmentStatus.pending: "Enrollment is not blocked.",
        EnrollmentStatus.approved: "Enrollment is not blocked.",
        EnrollmentStatus.rejected: "Enrollment is not blocked.",
    },
}


async def decide(db: AsyncSession, actor: User, enrollment_id: str, action: Decision) -> Enrollment:
    """Run one approval transition. Same-state decisions are no-ops that leave
    the audit (decided_by/decided_at) untouched."""
    if action not in _DECISIONS:
        raise EnrollmentError("Unknown decision.")
    enrollment = await enrollment_repository.get_by_id(db, enrollment_id)
    if enrollment is None:
        raise EnrollmentNotFound("Enrollment not found.")
    course = await course_repository.get_by_id(db, str(enrollment.course_id))
    if course is None:
        raise CourseNotFound("Course not found.")
    _check_can_write(actor, course)

    outcome = _DECISIONS[action][enrollment.status]
    if isinstance(outcome, EnrollmentStatus):
        pass  # normal transition handled below
    elif outcome is None:
        # The only None cell is unblock-from-blocked: restore the status
        # captured at block time (instant access, no re-apply). Legacy rows
        # blocked before status_before_block existed carry NULL → approved;
        # a stored blocked (unreachable via block, a no-op from blocked)
        # also falls back to approved.
        restore = enrollment.status_before_block
        if restore is None or restore is EnrollmentStatus.blocked:
            restore = EnrollmentStatus.approved
        enrollment.status = restore
        enrollment.status_before_block = None
        enrollment.decided_by = actor.id
        enrollment.decided_at = datetime.now(UTC)
        await db.flush()
        await db.refresh(enrollment)
        return enrollment
    else:
        # StrEnum members are str instances too, so the enum branch runs
        # first; here outcome is a plain rejection message.
        raise EnrollmentError(outcome)
    if outcome == enrollment.status:
        return enrollment  # idempotent: no transition, audit preserved
    if action == "block":
        # Remember pre-block access so a later unblock restores it instantly.
        enrollment.status_before_block = enrollment.status
    enrollment.status = outcome
    enrollment.decided_by = actor.id
    enrollment.decided_at = datetime.now(UTC)
    await db.flush()
    await db.refresh(enrollment)
    return enrollment


async def list_code_uses(
    db: AsyncSession, actor: User, course_id: str, code_id: str
) -> tuple[EnrollmentCode, list[CodeUse]]:
    """Who-used audit for one code (traceability)."""
    course = await _course_or_404(db, course_id)
    _check_can_write(actor, course)
    code = await code_repository.get_by_id(db, code_id)
    if code is None or code.course_id != course.id:
        raise CodeNotFound("Join code not found.")
    return code, await code_use_repository.list_for_code(db, code.id)


async def my_enrollments(db: AsyncSession, user: User) -> list[tuple[Enrollment, str]]:
    """All of the caller's enrollments across courses with course titles, so
    one account joining N courses sees every pending/approved state.
    One batched id→title query instead of one per row."""
    rows = await enrollment_repository.list_for_user(db, user.id)
    titles = await course_repository.titles_for(db, (row.course_id for row in rows))
    return [(row, titles.get(row.course_id, "")) for row in rows]
