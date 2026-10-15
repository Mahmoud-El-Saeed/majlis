"""Shared attachment file gates (ticket 16 review).

Lesson and course attachments enforce the same shape of rules with different
allowed types, so the base error, maps, and checks live here once instead of
drifting between the two attachment services.
"""


from app.core.config import get_settings


class AttachmentError(Exception):
    def __init__(self, message: str):
        self.message = message


#: Lesson handouts accept PDF or images; course attachments stay PDF-only.
LESSON_FILE_TYPES: dict[str, set[str]] = {
    "application/pdf": {".pdf"},
    "image/png": {".png"},
    "image/jpeg": {".jpg", ".jpeg"},
    "image/webp": {".webp"},
}
COURSE_FILE_TYPES: dict[str, set[str]] = {"application/pdf": {".pdf"}}


def _supported_label(allowed: dict[str, set[str]]) -> str:
    if set(allowed) == {"application/pdf"}:
        return "PDF"
    return "PDF, PNG, JPEG, and WEBP"


def check_file(
    allowed: dict[str, set[str]], content_type: str | None, file_ext: str | None
) -> tuple[str, str]:
    """Scoped type gate. Returns normalized (content_type, ext)."""
    ct = (content_type or "").strip().lower()
    ext = (file_ext or ".pdf").strip().lower()
    if not ext.startswith("."):
        ext = f".{ext}"
    if ct not in allowed or ext not in allowed[ct]:
        raise AttachmentError(f"Only {_supported_label(allowed)} attachments are supported.")
    return ct, ext


def check_size(size: int | None) -> None:
    """Per-file cap enforced at confirm via HeadObject size."""
    max_bytes = get_settings().ATTACHMENT_MAX_FILE_BYTES
    if size is not None and size > max_bytes:
        max_mb = max_bytes // (1024 * 1024)
        raise AttachmentError(
            f"File is too large (max {max_mb}MB). Please compress it and retry."
        )
