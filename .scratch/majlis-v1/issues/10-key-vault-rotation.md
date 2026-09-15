# 10: Key vault + rotation

**What to build:** free-tier survival — encrypted provider keys in the database with least-recent round-robin and full usage logging.

**Blocked by:** 01 Bootstrap + Identity vertical.

**Status:** ready-for-agent

- [ ] Admin-only CRUD for keys: provider, model, encrypted key (Fernet), weight, active flag, quota
- [ ] Master encryption key is the only secret in env; provider keys never appear in env or frontend
- [ ] Selection is least-recently-used, skipping keys that return 429/5xx, with Redis fast pointer
- [ ] Every call logged with provider, model, tokens, latency, error; rotation visible in logs
