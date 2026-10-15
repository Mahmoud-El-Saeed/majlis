"""Shared seam fakes (one copy — ticket 16 prefactor).

FakeStorage mirrors the StorageClient protocol in memory: presigned URLs are
synthetic, objects land via ``objects.add`` (use ``put_object`` to also record
a size), no network is touched.
"""


class FakeStorage:
    def __init__(self) -> None:
        self.objects: set[str] = set()
        self.sizes: dict[str, int] = {}
        self._counter = 0
        self.last_get: dict | None = None

    def put_object(self, key: str, size: int = 0) -> None:
        self.objects.add(key)
        self.sizes[key] = size

    async def presign_put(self, key: str, content_type: str, expires_in: int) -> dict:
        self._counter += 1
        return {
            "upload_url": f"https://fake-r2/{key}?sig=put-{self._counter}",
            "object_key": key,
            "expires_in": expires_in,
        }

    async def object_exists(self, key: str) -> bool:
        return key in self.objects

    async def object_size(self, key: str) -> int | None:
        if key not in self.objects:
            return None
        return self.sizes.get(key, 0)

    async def presign_get(
        self,
        key: str,
        expires_in: int,
        filename: str | None = None,
        disposition: str | None = None,
        content_type: str | None = None,
    ) -> dict:
        self.last_get = {
            "filename": filename,
            "disposition": disposition,
            "content_type": content_type,
        }
        disp = disposition or "inline"
        safe = (filename or key.rsplit("/", 1)[-1]).replace('"', "")
        return {
            "playback_url": f"https://fake-r2/{key}?sig=get&disp={disp}&file={safe}",
            "expires_in": expires_in,
        }
