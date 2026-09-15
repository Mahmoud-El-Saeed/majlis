# ADR-0003: API keys in DB (Fernet-encrypted) + round-robin with 429-skip, Redis fast pointer

Status: accepted

## Context

The chatbot must stretch free tiers across many provider keys (Groq/OpenRouter for generation). Env-file keys make adding/removing keys painful and risk leaking secrets into deploys.

## Decision

- Keys live in Postgres: provider, model, Fernet-encrypted key, weight, active flag, quota, last_used. Only the master encryption key is in env; provider keys never touch `.env`.
- Selection is round-robin by least-recently-used, skipping keys that return 429/5xx, with full per-call usage log (tokens, latency, error).
- Redis caches the rotation pointer for speed. Admin-only CRUD UI.

## Consequences

- Key add/disable is a UI action, no redeploy.
- Master-key rotation procedure must be documented before prod.
