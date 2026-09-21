# 05: Direct-to-R2 audio upload

**What to build:** audio-only media handling with no worker — browser uploads straight to R2, API verifies, students stream. (Backup to Google Drive is deferred to post-V1; R2 is the sole copy in V1.)

**Blocked by:** 01 Bootstrap + Identity vertical, 03 Course + Lesson library.

**Status:** ready-for-agent

- [ ] API issues short-lived presigned PUT URL → browser uploads audio directly to R2 → client confirms → API verifies object exists → lesson marked ready
- [ ] Failed upload retries with a fresh URL; unverified lessons never show as ready
- [ ] Audio-only validation in V1; media_type stays generic for V2 video
- [ ] Playback via short-lived signed URLs with Range support in an HTML5 audio player
