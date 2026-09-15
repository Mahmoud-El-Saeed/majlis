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
