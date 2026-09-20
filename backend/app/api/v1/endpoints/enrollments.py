from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.api.dependencies import CurrentUserDep, DbDep
from app.models.enrollment import EnrollmentStatus
from app.schemas.codes import (
    CodeCreateIn,
    CodeListOut,
    CodeOut,
    CodeUsesOut,
    to_code_list_item,
    to_code_out,
    to_code_use_out,
)
from app.schemas.enrollments import (
    EnrollmentListOut,
    EnrollmentOut,
    JoinIn,
    to_enrollment_out,
)
from app.services import enrollment_service
from app.services.course_service import CourseError, CourseForbidden, CourseNotFound
from app.services.enrollment_service import (
    CodeForbidden,
    CodeNotFound,
    Decision,
    EnrollmentError,
    EnrollmentForbidden,
    EnrollmentNotFound,
)

router = APIRouter(tags=["enrollments"])

_NOT_FOUND = (CodeNotFound, EnrollmentNotFound, CourseNotFound)
_FORBIDDEN = (CodeForbidden, EnrollmentForbidden, CourseForbidden)


def _not_found(e: EnrollmentError | CourseError) -> HTTPException:
    return HTTPException(status_code=404, detail=e.message)


def _forbidden(e: EnrollmentError | CourseError) -> HTTPException:
    return HTTPException(status_code=403, detail=e.message)


@router.post(
    "/courses/{course_id}/codes", status_code=status.HTTP_201_CREATED, response_model=CodeOut
)
async def create_code(
    db: DbDep, actor: CurrentUserDep, course_id: str, data: CodeCreateIn
) -> CodeOut:
    try:
        code, raw = await enrollment_service.create_code(db, actor, course_id, data)
    except _NOT_FOUND as e:
        raise _not_found(e) from None
    except _FORBIDDEN as e:
        raise _forbidden(e) from None
    except EnrollmentError as e:
        raise HTTPException(status_code=400, detail=e.message) from None
    return to_code_out(code, raw)


@router.get("/courses/{course_id}/codes", response_model=CodeListOut)
async def list_codes(db: DbDep, actor: CurrentUserDep, course_id: str) -> CodeListOut:
    try:
        codes = await enrollment_service.list_codes(db, actor, course_id)
    except _NOT_FOUND as e:
        raise _not_found(e) from None
    except _FORBIDDEN as e:
        raise _forbidden(e) from None
    return CodeListOut(codes=[to_code_list_item(c) for c in codes])


@router.post("/courses/{course_id}/codes/{code_id}/revoke", response_model=CodeListOut)
async def revoke_code(
    db: DbDep, actor: CurrentUserDep, course_id: str, code_id: str
) -> CodeListOut:
    try:
        await enrollment_service.revoke_code(db, actor, course_id, code_id)
        codes = await enrollment_service.list_codes(db, actor, course_id)
    except _NOT_FOUND as e:
        raise _not_found(e) from None
    except _FORBIDDEN as e:
        raise _forbidden(e) from None
    return CodeListOut(codes=[to_code_list_item(c) for c in codes])


@router.get(
    "/courses/{course_id}/codes/{code_id}/uses",
    response_model=CodeUsesOut,
)
async def list_code_uses(
    db: DbDep, actor: CurrentUserDep, course_id: str, code_id: str
) -> CodeUsesOut:
    """Who-used audit for one code."""
    try:
        _, uses = await enrollment_service.list_code_uses(db, actor, course_id, code_id)
    except _NOT_FOUND as e:
        raise _not_found(e) from None
    except _FORBIDDEN as e:
        raise _forbidden(e) from None
    return CodeUsesOut(uses=[to_code_use_out(u) for u in uses])


@router.post("/enrollments/join", status_code=status.HTTP_201_CREATED, response_model=EnrollmentOut)
async def join_with_code(db: DbDep, user: CurrentUserDep, data: JoinIn) -> EnrollmentOut:
    try:
        row = await enrollment_service.join_with_code(db, user, data)
    except EnrollmentForbidden as e:
        raise HTTPException(status_code=403, detail=e.message) from None
    except EnrollmentError as e:
        raise HTTPException(status_code=400, detail=e.message) from None
    return to_enrollment_out(row)


@router.get("/enrollments/mine", response_model=EnrollmentListOut)
async def my_enrollments(db: DbDep, user: CurrentUserDep) -> EnrollmentListOut:
    """The caller's enrollments across all courses with course titles, so one
    account joining N courses sees every pending/approved state."""
    rows = await enrollment_service.my_enrollments(db, user)
    return EnrollmentListOut(enrollments=[to_enrollment_out(row, title) for row, title in rows])


@router.get("/courses/{course_id}/enrollments", response_model=EnrollmentListOut)
async def list_enrollments(
    db: DbDep,
    actor: CurrentUserDep,
    course_id: str,
    status: Annotated[EnrollmentStatus | None, Query()] = None,
) -> EnrollmentListOut:
    try:
        rows = await enrollment_service.list_enrollments(db, actor, course_id, status)
    except _NOT_FOUND as e:
        raise _not_found(e) from None
    except _FORBIDDEN as e:
        raise _forbidden(e) from None
    return EnrollmentListOut(enrollments=[to_enrollment_out(r) for r in rows])


@router.get("/courses/{course_id}/my-enrollment", response_model=EnrollmentOut | None)
async def my_enrollment(db: DbDep, user: CurrentUserDep, course_id: str) -> EnrollmentOut | None:
    try:
        row = await enrollment_service.get_my_enrollment(db, user, course_id)
    except CourseNotFound as e:
        raise HTTPException(status_code=404, detail=e.message) from None
    if row is None:
        return None
    return to_enrollment_out(row)


async def _decide(
    db: DbDep, actor: CurrentUserDep, enrollment_id: str, action: Decision
) -> EnrollmentOut:
    try:
        row = await enrollment_service.decide(db, actor, enrollment_id, action)
    except _NOT_FOUND as e:
        raise _not_found(e) from None
    except _FORBIDDEN as e:
        raise _forbidden(e) from None
    except EnrollmentError as e:
        raise HTTPException(status_code=400, detail=e.message) from None
    return to_enrollment_out(row)


@router.post("/enrollments/{enrollment_id}/approve", response_model=EnrollmentOut)
async def approve_enrollment(db: DbDep, actor: CurrentUserDep, enrollment_id: str) -> EnrollmentOut:
    return await _decide(db, actor, enrollment_id, "approve")


@router.post("/enrollments/{enrollment_id}/reject", response_model=EnrollmentOut)
async def reject_enrollment(db: DbDep, actor: CurrentUserDep, enrollment_id: str) -> EnrollmentOut:
    return await _decide(db, actor, enrollment_id, "reject")


@router.post("/enrollments/{enrollment_id}/block", response_model=EnrollmentOut)
async def block_enrollment(db: DbDep, actor: CurrentUserDep, enrollment_id: str) -> EnrollmentOut:
    return await _decide(db, actor, enrollment_id, "block")


@router.post("/enrollments/{enrollment_id}/unblock", response_model=EnrollmentOut)
async def unblock_enrollment(db: DbDep, actor: CurrentUserDep, enrollment_id: str) -> EnrollmentOut:
    return await _decide(db, actor, enrollment_id, "unblock")
