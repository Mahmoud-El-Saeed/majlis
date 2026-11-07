# ADR-0009: Production serves no interactive API docs

Status: accepted

## Context

FastAPI ships `/docs`, `/redoc` and `/openapi.json` on by default. For a
private-circle platform the OpenAPI document publishes the full route map,
permission surface and error shapes to anyone who can reach the origin. An
audit finding (ticket 22) flagged this as an exposure, with no production
notion anywhere in the Settings.

## Decision

- A single `APP_ENV` setting (`"dev"` | `"prod"`, default `"dev"`) gates it.
- In `prod`, `main.create_app()` constructs the application with
  `docs_url=None`, `redoc_url=None`, `openapi_url=None` — the three paths
  return 404.
- The compose deployment unit sets `APP_ENV=prod` by default (overridable)
  so local `uvicorn` development keeps docs.
- Tests pin both sides: dev serves all three; prod serves `/health` and 404s
  the three (`tests/test_docs_security.py`).

## Consequences

- Contract exploration during development stays one click away; production
  clients rely on the maintained code, not a published spec.
- `APP_ENV` is the first environment switch in Settings — future production
  hardening can hang off the same flag.

## Rejected alternatives

- HTTP-basic protecting the docs in production: rejected — extra moving
  parts (credentials to rotate) for a surface nobody needs in prod.
- Shipping `/openapi.json` but disabling the UI: rejected — the route map
  itself is the leak; without it the UI has nothing to render.
