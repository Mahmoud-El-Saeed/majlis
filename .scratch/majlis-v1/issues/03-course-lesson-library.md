# 03: Course + Lesson library with transcript fields

**What to build:** the single content seam — courses as books, lessons as recording sessions with pages range, audio reference, and pasted transcripts.

**Blocked by:** 01 Bootstrap + Identity vertical.

**Status:** ready-for-agent

- [ ] Course (book) CRUD with organization_id reserved for future multi-org
- [ ] Lesson CRUD with title, date, pages_from/to (validated range), audio reference, generic media_type
- [ ] transcript_voice and transcript_book TEXT fields with paste-in textarea edit UI
- [ ] Lesson create/edit restricted to admin in V1 (teacher self-upload is V2)
- [ ] Lesson carries a processing status field for the storage ticket to transition
- [ ] Students can only see content of courses they are approved in
