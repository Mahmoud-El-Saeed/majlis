# 14: Student exam discovery + frontend redesign

**What to build:** an enrolled student discovers their course's exams and starts an attempt, inside a fully redesigned frontend — the current design is replaced wholesale with a polished, excellent UI/UX.

**Blocked by:** 07 Exam authoring, 08 Exam taking flow, 04 Codes + approvals.

**Status:** ready-for-agent

- [ ] Missing student APIs: student-safe per-course exam list (no correct_index/correct_answer leak), gated by approved enrollment; writers keep the existing preview path; pending/blocked/outsider 403, anon 401
- [ ] Discovery UI: Arabic-first RTL exam list showing window status (open/closed), attempts left, and entry into the taking flow; score visibility follows the exam's immediate vs after-publish setting
- [ ] Frontend visual redesign: replace the current design system-wide (theme, layout, components) with an excellent UI/UX pass — Arabic-first RTL and mobile responsive are preserved, not regressed
- [ ] Backend API-level tests for the new endpoints (enrollment gate, no-leak guarantee, attempts-left counts) on Postgres, same isolation pattern as the exam suites
- [ ] Frontend tests for the new flows (set up a test runner first — none exists yet — plus typecheck; E2E smoke of join → discover → start attempt)
