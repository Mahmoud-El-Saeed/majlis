# 27: Production bootstrap and backups

**What to build:** an operable production database — the admin account seeded from configuration, daily backups scheduled, a restore actually rehearsed, and the operator commands written down.

**Blocked by:** 25 Heroku API target

**Status:** ready-for-agent

- [ ] The admin account is seeded idempotently from configuration on boot; restarting does not duplicate it or reset its password
- [ ] The admin authenticates against the production API
- [ ] A daily backup schedule exists and a completed backup is visible
- [ ] A restore into a scratch database succeeds and row counts match the source at backup time
- [ ] Rotation of `SECRET_KEY` and the mail credential is documented, including the effect on live sessions
- [ ] One-off commands (seed, rotate, restore, scale) are recorded for the next operator
