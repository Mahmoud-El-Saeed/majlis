from pydantic import BaseModel, Field


class UploadUrlIn(BaseModel):
    content_type: str = Field(min_length=1, max_length=127)
    file_ext: str | None = Field(default=None, max_length=10)


class UploadUrlOut(BaseModel):
    upload_url: str
    object_key: str
    expires_in: int


class ConfirmIn(BaseModel):
    object_key: str = Field(min_length=1, max_length=512)


class PlayOut(BaseModel):
    playback_url: str
    expires_in: int
