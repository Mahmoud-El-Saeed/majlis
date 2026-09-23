# ADR-0007: Exam taking blocked for writers (intentional role-check exception)

Status: accepted

## Context

Standing rules (AGENTS.md) and CONTEXT.md say enrollment checks membership and
never `role == "student"`, and that admin passes every gate. Ticket 08's
binding decision requires the opposite at exactly one seam: only enrolled
students may start attempts (`POST /exams/{id}/attempts` returns 403 for
admins/teachers), because writers can already see correct answers via the
teacher preview (Seam 4, ticket 07) and must never pollute the gradebook.

## Decision

- Seam 5 (assessment taking) is the single exception: `_require_student_taker`
  checks `actor.role == student` first, then the usual approved-enrollment
  membership check.
- Writers preview via `GET /exams/{id}` (Seam 4); they have no taking path.
- A teacher studying another teacher's course takes exams only from a
  separate student-role account. Per-course `blocked` and platform
  `is_active=False` keep their scope (a blocked/disabled student loses
  taking access even mid-attempt).
- Revisit if writer-preview and gradebook ever need to share accounts.

## Consequences

- Standards review flags the role check as a hard violation of the
  never-`role` rule; this ADR is the authorizing record — the flag is
  expected, not a defect.
- `test_teacher_and_admin_cannot_start` locks the 403 behavior.
