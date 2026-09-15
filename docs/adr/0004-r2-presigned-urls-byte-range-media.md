# ADR-0004: R2 + presigned URLs + byte-range for all media

Status: accepted

## Context

Media must stream to phones without routing bytes through the VPS, stay private to approved course members, and survive the 100GB VPS cap.

## Decision

- Single private Cloudflare R2 bucket, prefix `courses/{course_id}/lessons/{lesson_id}/`.
- Uploads: short-lived presigned PUT URLs, client → R2 direct.
- Playback: short-lived signed URLs (1h) with HTTP Range support; HTML5 audio player in V1 (video later).
- VPS holds no media bytes; R2 is the source of truth for bytes, Postgres for metadata.

## Consequences

- The API verifies object existence on confirm and issues playback URLs after membership checks.
- Direct R2 dependence is mitigated by the scheduled Drive backup (ADR-0005).
