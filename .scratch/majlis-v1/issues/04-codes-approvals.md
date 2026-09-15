# 04: Codes + approvals

**What to build:** the private-circle gate — temporary per-course codes plus the teacher's pending queue with approve/reject/block.

**Blocked by:** 01 Bootstrap + Identity vertical, 02 Teacher invites + roles, 03 Course + Lesson library.

**Status:** ready-for-agent

- [ ] Teacher generates per-course codes with defaults 8 chars, 7 days, 50 uses, max 5 active per course
- [ ] Codes are traceable (who created/used) and revocable; revoked/expired/overused codes rejected
- [ ] Student Join-with-code → pending status with name/phone/note visible in teacher queue
- [ ] Teacher approve → access; reject → soft, student may re-apply with a new code; block → per-course ban, cannot rejoin that course
