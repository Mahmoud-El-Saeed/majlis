from fastapi import APIRouter, HTTPException, status

from app.api.dependencies import CurrentUserDep, DbDep, StorageDep
from app.schemas.lesson_media import ConfirmIn, PlayOut, UploadUrlIn, UploadUrlOut
from app.schemas.lessons import LessonOut, to_lesson_out
from app.services import storage as storage_service
from app.services.course_service import CourseForbidden, CourseNotFound
from app.services.storage import StorageConflict, StorageError, StorageForbidden, StorageNotFound

router = APIRouter(tags=["lesson-media"])


def _media_error_status(e: Exception) -> int:
    if isinstance(e, (StorageNotFound, CourseNotFound)):
        return 404
    if isinstance(e, (StorageForbidden, CourseForbidden)):
        return 403
    if isinstance(e, StorageConflict):
        return 409
    return 400


@router.post(
    "/lessons/{lesson_id}/upload-url",
    status_code=status.HTTP_200_OK,
    response_model=UploadUrlOut,
)
async def get_upload_url(
    db: DbDep, user: CurrentUserDep, storage: StorageDep, lesson_id: str, data: UploadUrlIn
) -> UploadUrlOut:
    try:
        out = await storage_service.request_upload_url(
            db, user, lesson_id, data.content_type, data.file_ext, storage
        )
    except (StorageError, CourseNotFound, CourseForbidden) as e:
        raise HTTPException(status_code=_media_error_status(e), detail=e.message) from None
    return UploadUrlOut(**out)


@router.post("/lessons/{lesson_id}/confirm", response_model=LessonOut)
async def confirm_upload(
    db: DbDep, user: CurrentUserDep, storage: StorageDep, lesson_id: str, data: ConfirmIn
) -> LessonOut:
    try:
        lesson = await storage_service.confirm_upload(db, user, lesson_id, data.object_key, storage)
    except (StorageError, CourseNotFound, CourseForbidden) as e:
        raise HTTPException(status_code=_media_error_status(e), detail=e.message) from None
    return to_lesson_out(lesson)


@router.get("/lessons/{lesson_id}/play", response_model=PlayOut)
async def get_playback_url(
    db: DbDep, user: CurrentUserDep, storage: StorageDep, lesson_id: str
) -> PlayOut:
    try:
        out = await storage_service.get_playback_url(db, user, lesson_id, storage)
    except (StorageError, CourseNotFound, CourseForbidden) as e:
        raise HTTPException(status_code=_media_error_status(e), detail=e.message) from None
    return PlayOut(**out)
