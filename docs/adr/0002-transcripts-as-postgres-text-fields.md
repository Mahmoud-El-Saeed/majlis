# ADR-0002: Transcripts as Postgres TEXT fields (manual paste in MVP)

Status: accepted

## Context

The original design uploaded two transcript files per lesson (voice + book) for RAG. The MVP transcription process is fully manual (local Whisper script + pasted book text), so files add friction with no benefit.

## Decision

- `transcript_voice` and `transcript_book` are TEXT columns on lessons.
- Admin/teacher fills them via paste-in textarea UI.
- The RAG pipeline reads transcript text directly from Postgres; it never depends on the storage/upload ticket.

## Consequences

- Lesson create/edit UI must include both fields; validation is length/presence, not file handling.
- Automatic transcription (Whisper/agent pipeline) stays a V2 item and will write into the same columns.
