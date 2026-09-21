from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.api.dependencies import CurrentUserDep, DbDep, StorageDep
from app.schemas.attachments import (
    AttachmentCreateIn,
    AttachmentFileOut,
    AttachmentOut,
    AttachmentUpdateIn,
    AttachmentUploadUrlOut,
    FileDisposition,
    to_attachment_out,
    to_student_attachment_out,
)
from app.schemas.lesson_media import ConfirmIn, UploadUrlIn
from app.services import attachment_service
from app.services.attachment_service import (
    AttachmentConflict,
    AttachmentError,
    AttachmentForbidden,
    AttachmentNotFound,
)
from app.services.course_service import CourseForbidden, CourseNotFound

router = APIRouter(tags=["attachments"])


def _status(e: Exception) -> int:
    if isinstance(e, (AttachmentNotFound, CourseNotFound)):
        return 404
    if isinstance(e, (AttachmentForbidden, CourseForbidden)):
        return 403
    if isinstance(e, AttachmentConflict):
        return 409
    return 400


@router.post(
    "/courses/{course_id}/lessons/{lesson_id}/attachments",
    status_code=status.HTTP_201_CREATED,
    response_model=AttachmentOut,
)
async def create_attachment(
    db: DbDep, user: CurrentUserDep, course_id: str, lesson_id: str, data: AttachmentCreateIn
) -> AttachmentOut:
    try:
        row = await attachment_service.create_attachment_in_course(
            db, user, course_id, lesson_id, data
        )
    except (AttachmentError, CourseNotFound, CourseForbidden) as e:
        raise HTTPException(status_code=_status(e), detail=e.message) from None
    return to_attachment_out(row)


@router.get(
    "/courses/{course_id}/lessons/{lesson_id}/attachments",
    response_model=list[AttachmentOut],
)
async def list_attachments(
    db: DbDep, user: CurrentUserDep, course_id: str, lesson_id: str
) -> list[AttachmentOut]:
    try:
        rows, writer = await attachment_service.list_attachments(db, user, lesson_id, course_id)
    except (AttachmentError, CourseNotFound, CourseForbidden) as e:
        raise HTTPException(status_code=_status(e), detail=e.message) from None
    to_out = to_attachment_out if writer else to_student_attachment_out
    return [to_out(r) for r in rows]


@router.put("/lesson-attachments/{attachment_id}", response_model=AttachmentOut)
async def update_attachment(
    db: DbDep, user: CurrentUserDep, attachment_id: str, data: AttachmentUpdateIn
) -> AttachmentOut:
    try:
        row = await attachment_service.update_attachment(db, user, attachment_id, data)
    except (AttachmentError, CourseNotFound, CourseForbidden) as e:
        raise HTTPException(status_code=_status(e), detail=e.message) from None
    return to_attachment_out(row)


@router.delete("/lesson-attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attachment(db: DbDep, user: CurrentUserDep, attachment_id: str) -> None:
    try:
        await attachment_service.delete_attachment(db, user, attachment_id)
    except (AttachmentError, CourseNotFound, CourseForbidden) as e:
        raise HTTPException(status_code=_status(e), detail=e.message) from None


@router.post(
    "/lesson-attachments/{attachment_id}/upload-url",
    response_model=AttachmentUploadUrlOut,
)
async def get_attachment_upload_url(
    db: DbDep,
    user: CurrentUserDep,
    storage: StorageDep,
    attachment_id: str,
    data: UploadUrlIn,
) -> AttachmentUploadUrlOut:
    try:
        out = await attachment_service.request_upload_url(
            db, user, attachment_id, data.content_type, data.file_ext, storage
        )
    except (AttachmentError, CourseNotFound, CourseForbidden) as e:
        raise HTTPException(status_code=_status(e), detail=e.message) from None
    return AttachmentUploadUrlOut(**out)


@router.post("/lesson-attachments/{attachment_id}/confirm", response_model=AttachmentOut)
async def confirm_attachment_upload(
    db: DbDep,
    user: CurrentUserDep,
    storage: StorageDep,
    attachment_id: str,
    data: ConfirmIn,
) -> AttachmentOut:
    try:
        row = await attachment_service.confirm_upload(
            db, user, attachment_id, data.object_key, storage
        )
    except (AttachmentError, CourseNotFound, CourseForbidden) as e:
        raise HTTPException(status_code=_status(e), detail=e.message) from None
    return to_attachment_out(row)


@router.get("/lesson-attachments/{attachment_id}/file", response_model=AttachmentFileOut)
async def get_attachment_file(
    db: DbDep,
    user: CurrentUserDep,
    storage: StorageDep,
    attachment_id: str,
    disposition: Annotated[FileDisposition, Query()] = "inline",
) -> AttachmentFileOut:
    """Signed file URL. `?disposition=inline` views in browser,
    `?disposition=attachment` forces download."""
    try:
        out = await attachment_service.get_file_url(db, user, attachment_id, storage, disposition)
    except (AttachmentError, CourseNotFound, CourseForbidden) as e:
        raise HTTPException(status_code=_status(e), detail=e.message) from None
    return AttachmentFileOut(**out)
