# ADR-0001: Audio-only V1, no transcoding, direct-to-R2 presigned uploads

Status: accepted

## Context

V1 recordings are audio only (~100–150MB each). The original design had a background worker running ffmpeg compression/transcoding before pushing to object storage. That worker exists only to serve video needs we do not have in V1.

## Decision

- V1 accepts audio uploads only. No ffmpeg, no compression, no background worker service in docker-compose.
- Upload flow: API issues a presigned PUT URL → browser uploads directly to R2 → client confirms → API verifies the object exists → lesson marked ready. Failure = retry with a fresh URL.
- Schema carries a generic `media_type` field so video can be added in V2 without migration, but there is no video upload UI and no transcoding in V1.

## Consequences

- Compose loses the worker service; Redis stays for rate-limiting, chat cache, and rotation pointer.
- Upload bandwidth moves to the client; the VPS never stores media bytes.
- V2 (video): add video upload UI, reintroduce a transcode worker, HLS/multi-bitrate.

## Rejected alternatives

- Server-side transcode worker in V1: rejected — cost and complexity with zero V1 video demand.
