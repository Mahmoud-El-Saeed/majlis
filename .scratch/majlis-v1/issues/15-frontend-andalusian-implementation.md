# 15: Frontend implementation (Andalusian design system)

**What to build:** the complete Majlis frontend — greenfield `frontend/` — implementing the approved
Andalusian design system in `design-system/majlis/MASTER.md` (live reference: `preview.html`). All roles:
public auth, student, teacher, admin. Arabic-first RTL, mobile responsive, light/dark modes.

**Blocked by:** 01–09, 14 (backend seams + discovery exist and are test-locked). Chat/vault backend
(tickets 10–12) NOT built — those pages are UI stubs only, no API calls.

**Status:** ready-for-agent

## Source of truth (read in this order)

1. `design-system/majlis/MASTER.md` — tokens, fonts, motifs, components, dark-mode contrast rules, checklist
2. `design-system/majlis/preview.html` — pixel/behavior reference (open via local server, toggle ليلي/نهاري)
3. `design-system/majlis/fonts/` — Reem Kufi / Amiri / Tajawal / Cairo via `@font-face`, never CDN
4. `design-system/majlis/assets/` — placeholder SVGs; reference exact paths, ask user before replacing art
5. `docs/architecture.md §4`, `CONTEXT.md`, `.scratch/majlis-v1/spec.md` — pages, vocabulary, contracts
6. Backend endpoint map: 63 routes under `/api/v1` (auth/invites/dashboard/courses/lessons/media/attachments/
   enrollments/exams/attempts/grading). Key gotchas: raw code shown once; `my-enrollment` may return `null`;
   student lesson detail is blanked (play via `/play` only); `refresh` rotates both tokens; `422` vs `400`;
   CSV export is a blob; gating checks enrollment status, never `role == "student"` (except exam taking,
   student-only per ADR-0007).

## Stack

Vite + React 19.3 + TypeScript + Tailwind + React Router + TanStack Query, package-managed with Bun 1.4.2,
static build to Cloudflare Pages. `CORS FRONTEND_URL` must match served origin. Vitest + `tsc` typecheck
(set up first — none exists yet).

## Scope (in order)

- [ ] Scaffold: `src/{pages,features,components,api}`, `i18n.ts` (Arabic strings; backend messages stay English),
  RTL shell, floating navbar, theme toggle, toast, guards (`RequireAuth/Approved/Writer/Admin`), typed API client
  (Bearer + silent refresh on 401, 429 Arabic toast, CSV blob download)
- [ ] Public auth: signup/verify/login/reset/invite-accept + localized 401/403/404/429 states
- [ ] Student: dashboard (course cards + Join-with-code box), course lessons (ready-only), lesson page (HTML5
  audio + 1h URL re-fetch + retry), exam discovery/take/result (server `expires_at` timer, publish-gated scores)
- [ ] Teacher: course/lesson CRUD + transcript textareas + `processing/ready/failed` badges, presigned upload
  flow (progress + confirm + retry-fresh-URL), codes generate (copy-once) /trace/revoke, pending queue
  approve/reject/block/unblock, exam + question authoring, gradebook + essay grading + publish + CSV
- [ ] Admin: invites, users/ban, Drive-migration lesson form, vault page as STUB (no API exists)
- [ ] Chat page as STUB per MASTER.md chat section (bubbles, citations, refusal, quota UI; no backend calls
  until tickets 10–12 land and the eval gate passes)
- [ ] Andalusian application: beige/turquoise/gold tokens, Reem Kufi headings + Tajawal body (local),
  star8 dividers/badges, zellige hero/footer (76–94% veil rule + `.card` background-color trap in MASTER.md §3),
  arabesque cards, horseshoe-arch lesson/join panels, mode-aware fills (no white-on-gold — verify with toggle)
- [ ] Tests: frontend unit/integration for auth/enrollment/exam flows + E2E smoke
  (signup → join → approve → listen → exam → grade), same Postgres-backed backend untouched

## Out of scope

Video UI/transcoding/worker (V2), PDF viewer (dropped in V1), real chat/vault API integration, multi-org,
native app. Never commit without explicit instruction.
