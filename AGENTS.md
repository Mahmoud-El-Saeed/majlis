## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical labels used as-is. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout with root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.

## Implementation rules

- Backend work: before writing any FastAPI code, load the `fastapi-templates` skill (scaffolding and patterns source of truth) and the `fastapi` skill (official correctness reference) via the Skill tool, and follow them for the whole session.
- Stack pins and behavior contracts live in `.scratch/majlis-v1/spec.md`; domain terms in `CONTEXT.md`; decisions in `docs/adr/`.

## Standing rules (every ticket)

- Fixed vocabularies are Postgres native enums, not strings.
- Tests run on Postgres (`majlis_test`), never SQLite; isolate per test.
- Migrations, every time: models → `autogenerate` → read → fix → `upgrade head` → test. Hand-fix PG ENUM alters; prove reversibility.
- Migrations stay sync, app code async; never block the event loop.
- Arabic-first in frontend (`i18n.ts` + `i18n/details.json`); backend messages English; backend emails Arabic.
- A new backend error detail needs an entry in `frontend/src/i18n/details.json` (the Arabic, or a deliberate pass-through with a reason). `backend/tests/test_error_details_contract.py` enforces the coverage; the generic fallback never says "try again" (`frontend/src/i18n.test.ts`).
- Role is a capability level: enrollment checks membership, never `role == "student"`; inviting a student promotes.
- TDD at seams; `ty` + single files during, full suite at end; `/code-review`, then fix findings.
- Never commit without an explicit instruction.
