"""Seam 3 Storage client (ticket 05): presigned direct-to-R2 audio URLs.

Only seam allowed to touch media bytes — and it never proxies them: the API
issues short-lived presigned PUT/GET URLs and verifies existence via HeadObject.
Playback Range requests go browser -> R2 directly (ADR-0004).

aioboto3 session management: one global ``aioboto3.Session`` lives on
``app.state`` (created in lifespan); each request opens a client with
``async with session.client(...)`` inside the ``get_storage_client``
dependency (``yield``), so no client/context leaks across requests.
"""

from typing import Any, Protocol

from app.core.config import get_settings


class StorageClient(Protocol):
    """Seam boundary. Prod = Aioboto3StorageClient; tests inject a fake."""

    async def presign_put(self, key: str, content_type: str, expires_in: int) -> dict: ...

    async def object_exists(self, key: str) -> bool: ...

    async def presign_get(
        self,
        key: str,
        expires_in: int,
        filename: str | None = None,
        disposition: str | None = None,
    ) -> dict: ...


class Aioboto3StorageClient:
    """S3-compatible client (Cloudflare R2). Thin wrapper only."""

    def __init__(self, s3: Any, bucket: str) -> None:
        self._s3 = s3
        self._bucket = bucket

    @property
    def bucket(self) -> str:
        return self._bucket

    async def presign_put(self, key: str, content_type: str, expires_in: int) -> dict:
        s3 = self._s3
        url = await s3.generate_presigned_url(  # type: ignore[misc]
            ClientMethod="put_object",
            Params={"Bucket": self._bucket, "Key": key, "ContentType": content_type},
            ExpiresIn=expires_in,
        )
        return {"upload_url": url, "object_key": key, "expires_in": expires_in}

    async def object_exists(self, key: str) -> bool:
        from botocore.exceptions import ClientError

        try:
            await self._s3.head_object(Bucket=self._bucket, Key=key)  # type: ignore[misc]
            return True
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
                return False
            raise

    async def presign_get(
        self,
        key: str,
        expires_in: int,
        filename: str | None = None,
        disposition: str | None = None,
    ) -> dict:
        s3 = self._s3
        params: dict = {"Bucket": self._bucket, "Key": key}
        # Inline = view in browser; attachment = download. Both stream
        # browser -> R2 directly with Range support (ADR-0004).
        if disposition in ("inline", "attachment"):
            safe = (filename or key.rsplit("/", 1)[-1]).replace('"', "")
            params["ResponseContentDisposition"] = f'{disposition}; filename="{safe}"'
            if key.lower().endswith(".pdf"):
                params["ResponseContentType"] = "application/pdf"
        url = await s3.generate_presigned_url(  # type: ignore[misc]
            ClientMethod="get_object",
            Params=params,
            ExpiresIn=expires_in,
        )
        return {"playback_url": url, "expires_in": expires_in}


def build_s3_client_kwargs() -> dict:
    """Endpoint/credential mapping shared by lifespan + dependency."""
    settings = get_settings()
    kwargs: dict = {"region_name": settings.S3_REGION}
    if settings.S3_ENDPOINT_URL:
        kwargs["endpoint_url"] = settings.S3_ENDPOINT_URL
    if settings.S3_ACCESS_KEY_ID:
        kwargs["aws_access_key_id"] = settings.S3_ACCESS_KEY_ID
    if settings.S3_SECRET_ACCESS_KEY:
        kwargs["aws_secret_access_key"] = settings.S3_SECRET_ACCESS_KEY
    return kwargs
