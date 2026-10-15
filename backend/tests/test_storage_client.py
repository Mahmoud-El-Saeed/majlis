"""Seam 3 contract tests: the presigned-URL parameters we send to R2.

What we own ends at the presigned URL — bytes and Range handling live in
R2/the browser (ADR-0004), unreachable without network. These tests pin the
contract instead: correct S3 method, bucket/key mapping, expiry passthrough,
and the inline/attachment disposition that drives view-vs-download.

A stub S3 records generate_presigned_url kwargs; no network is touched.
"""

from botocore.exceptions import ClientError

from app.core.storage_client import Aioboto3StorageClient


class StubS3:
    def __init__(self, head_error: dict | None = None) -> None:
        self.calls: list[dict] = []
        self._head_error = head_error

    async def generate_presigned_url(self, ClientMethod: str, Params: dict, ExpiresIn: int) -> str:
        self.calls.append(
            {"ClientMethod": ClientMethod, "Params": dict(Params), "ExpiresIn": ExpiresIn}
        )
        return f"https://r2.test/{Params['Key']}?sig={ClientMethod}"

    async def head_object(self, Bucket: str, Key: str) -> dict:
        if self._head_error is not None:
            raise ClientError(self._head_error, "HeadObject")
        return {"ContentLength": 104857600}


def _client(stub: StubS3) -> Aioboto3StorageClient:
    return Aioboto3StorageClient(stub, "majlis-media")


async def test_presign_put_maps_method_bucket_key_expiry():
    stub = StubS3()
    out = await _client(stub).presign_put("courses/c/lessons/l/audio.mp3", "audio/mpeg", 900)
    assert out["object_key"] == "courses/c/lessons/l/audio.mp3"
    assert out["expires_in"] == 900
    assert stub.calls == [
        {
            "ClientMethod": "put_object",
            "Params": {
                "Bucket": "majlis-media",
                "Key": "courses/c/lessons/l/audio.mp3",
                "ContentType": "audio/mpeg",
            },
            "ExpiresIn": 900,
        }
    ]


async def test_presign_get_plain_is_range_capable_get():
    """Plain playback GET: no response overrides, so R2 serves bytes with
    native Range/206 support straight to the browser audio element."""
    stub = StubS3()
    out = await _client(stub).presign_get("courses/c/lessons/l/audio.mp3", 3600)
    assert out["expires_in"] == 3600
    assert stub.calls == [
        {
            "ClientMethod": "get_object",
            "Params": {"Bucket": "majlis-media", "Key": "courses/c/lessons/l/audio.mp3"},
            "ExpiresIn": 3600,
        }
    ]


async def test_presign_get_inline_pdf_view():
    stub = StubS3()
    out = await _client(stub).presign_get("a/b.pdf", 3600, "Handout.pdf", "inline")
    assert out["expires_in"] == 3600
    params = stub.calls[0]["Params"]
    assert params["ResponseContentDisposition"] == 'inline; filename="Handout.pdf"'
    assert params["ResponseContentType"] == "application/pdf"


async def test_presign_get_attachment_forces_download():
    stub = StubS3()
    await _client(stub).presign_get("a/b.pdf", 3600, "Handout.pdf", "attachment")
    params = stub.calls[0]["Params"]
    assert params["ResponseContentDisposition"] == 'attachment; filename="Handout.pdf"'


async def test_object_exists_head_semantics():
    assert await _client(StubS3()).object_exists("a") is True
    missing = StubS3(head_error={"Error": {"Code": "404"}})
    assert await _client(missing).object_exists("a") is False


async def test_object_size_returns_content_length_or_none():
    assert await _client(StubS3()).object_size("a") == 104857600
    missing = StubS3(head_error={"Error": {"Code": "NoSuchKey"}})
    assert await _client(missing).object_size("a") is None
